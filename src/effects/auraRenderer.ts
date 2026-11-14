/**
 * WebGL2 aura renderer (web only).
 *
 * Per frame:
 *   1. Upload the camera frame as a texture (full resolution).
 *   2. Upload the low-res person mask (R8).
 *   3. Blur the mask twice (wide bloom + tight glow) at mask resolution.
 *   4. Persist glow: max(current, previous * decay) so the aura trails motion.
 *   5. Composite at full resolution: video + tinted trail glow (scrolling
 *      noise flicker) + thin rim.
 *
 * All heavy work is on the GPU, so the cost barely depends on video size.
 */

export type GlowMode = "outer" | "inner" | "both";

export type AuraFrameOptions = {
  color: readonly [number, number, number]; // 0-255
  mode: GlowMode;
  timeSeconds: number;
  strength: number;
  /**
   * Scan bar position, 0 (top) to 1 (bottom). The bar only shows on the
   * person (inside the segmentation mask). Omit or pass a negative to hide.
   */
  scan?: number;
};

export type AuraRenderer = {
  setMask(data: Uint8Array, width: number, height: number): void;
  /** Video (or canvas) frame source — phone streams are already upright. */
  render(source: HTMLVideoElement | HTMLCanvasElement, options: AuraFrameOptions): void;
  dispose(): void;
};

/** How long residual glow hangs after the silhouette moves (0 = none, ~0.95 = long). */
const TRAIL_DECAY = 0.65;

function sourceSize(source: HTMLVideoElement | HTMLCanvasElement) {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight };
  }
  return { w: source.width, h: source.height };
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Separable 17-tap gaussian on the red channel.
const BLUR_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 32.0);
    sum += texture(uTex, vUv + uStep * fi).r * w;
    wsum += w;
  }
  outColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
}`;

// Soft glow from blurred masks, with temporal persistence for motion trails.
const TRAIL_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uWide;
uniform sampler2D uNarrow;
uniform sampler2D uPrev;
uniform int uMode;
uniform float uDecay;
void main() {
  float bw = texture(uWide, vUv).r;
  float bn = texture(uNarrow, vUv).r;
  float body = smoothstep(0.38, 0.72, bn);
  float bodySoft = smoothstep(0.28, 0.78, bw);

  float outerGlow = bw * (1.0 - bodySoft) * 1.35 + bn * (1.0 - body) * 0.55;
  float innerGlow = ((1.0 - bw) * 0.45 + (1.0 - bn) * 0.85) * body;
  float glow;
  if (uMode == 0) {
    glow = outerGlow;
  } else if (uMode == 1) {
    glow = innerGlow;
  } else {
    glow = outerGlow * 1.05 + innerGlow * 0.45;
  }

  // max() trails without brightening a still silhouette (additive would pile up).
  float prev = texture(uPrev, vUv).r;
  float trailed = max(glow, prev * uDecay);
  outColor = vec4(trailed, 0.0, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVideo;
uniform sampler2D uNarrow;
uniform sampler2D uTrail;
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
uniform int uMode;
uniform float uHasMask;
uniform float uScan;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Cheap value noise — enough for soft flame flicker without a texture.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  // Textures are stored top row first; flip so the image is upright.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 base = texture(uVideo, uv).rgb;
  if (uHasMask < 0.5) {
    outColor = vec4(base, 1.0);
    return;
  }

  float bn = texture(uNarrow, uv).r;
  float body = smoothstep(0.38, 0.72, bn);
  float glow = texture(uTrail, uv).r;

  // Rim stays on the current silhouette so the edge stays crisp while glow trails.
  float rim = 0.0;
  if (uMode == 0) {
    rim = pow(max(bn * (1.0 - body), 0.0), 1.4) * 0.7;
  } else if (uMode == 2) {
    rim = pow(max(bn * (1.0 - body), 0.0), 1.5) * 0.4;
  }

  float pulse = 0.82 + 0.18 * sin(uTime * 2.2);

  // Scrolling noise: rises like heat, two octaves for soft flame tongues.
  vec2 nUv = vec2(uv.x * 4.2, uv.y * 2.6 - uTime * 1.35);
  float n = valueNoise(nUv);
  n = 0.62 * n + 0.38 * valueNoise(nUv * 2.15 + vec2(5.2, 1.7));
  float flicker = 0.88 + 0.12 * valueNoise(vec2(uTime * 5.5, uv.x * 3.0));
  float flow = (0.70 + 0.30 * n) * flicker;

  vec3 col = base
    + uColor * glow * pulse * flow * uStrength
    + mix(uColor, vec3(1.0), 0.5) * rim * 0.5 * uStrength;

  // Scan bar: only lights up where the person is. Everything else dims.
  if (uScan >= 0.0) {
    float person = smoothstep(0.3, 0.7, bn);
    float dist = uv.y - uScan;
    float line = exp(-dist * dist * 6000.0);
    float trail = exp(-max(-dist, 0.0) * 16.0) * step(dist, 0.0);
    vec3 scanCol = mix(uColor, vec3(1.0), 0.45);
    col *= 1.0 - 0.45 * (1.0 - person);
    col += scanCol * (line * 1.4 + trail * 0.35) * person;
  }
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragSource: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create program.");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragSource));
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function makeTexture(gl: WebGL2RenderingContext) {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Could not create texture.");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

function makeTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = makeTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Could not create framebuffer.");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

function clearTarget(gl: WebGL2RenderingContext, target: Target, w: number, h: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function createAuraRenderer(canvas: HTMLCanvasElement): AuraRenderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
  });
  if (!gl) {
    throw new Error("WebGL2 is not available in this browser.");
  }

  const blurProgram = link(gl, BLUR_FRAG);
  const trailProgram = link(gl, TRAIL_FRAG);
  const compositeProgram = link(gl, COMPOSITE_FRAG);
  const blurStep = gl.getUniformLocation(blurProgram, "uStep");
  const blurTex = gl.getUniformLocation(blurProgram, "uTex");
  const trailU = {
    wide: gl.getUniformLocation(trailProgram, "uWide"),
    narrow: gl.getUniformLocation(trailProgram, "uNarrow"),
    prev: gl.getUniformLocation(trailProgram, "uPrev"),
    mode: gl.getUniformLocation(trailProgram, "uMode"),
    decay: gl.getUniformLocation(trailProgram, "uDecay"),
  };
  const u = {
    video: gl.getUniformLocation(compositeProgram, "uVideo"),
    narrow: gl.getUniformLocation(compositeProgram, "uNarrow"),
    trail: gl.getUniformLocation(compositeProgram, "uTrail"),
    color: gl.getUniformLocation(compositeProgram, "uColor"),
    time: gl.getUniformLocation(compositeProgram, "uTime"),
    strength: gl.getUniformLocation(compositeProgram, "uStrength"),
    mode: gl.getUniformLocation(compositeProgram, "uMode"),
    hasMask: gl.getUniformLocation(compositeProgram, "uHasMask"),
    scan: gl.getUniformLocation(compositeProgram, "uScan"),
  };

  // Full-screen quad (two triangles).
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const videoTex = makeTexture(gl);
  const maskTex = makeTexture(gl);
  const blurTargets: Target[] = [];
  const trailTargets: Target[] = [];
  let trailWrite = 0;
  let maskW = 0;
  let maskH = 0;

  function disposeTargets(list: Target[]) {
    for (const t of list) {
      gl!.deleteTexture(t.tex);
      gl!.deleteFramebuffer(t.fbo);
    }
    list.length = 0;
  }

  function allocTargets(w: number, h: number) {
    disposeTargets(blurTargets);
    disposeTargets(trailTargets);
    for (let i = 0; i < 4; i++) {
      blurTargets.push(makeTarget(gl!, w, h));
    }
    for (let i = 0; i < 2; i++) {
      trailTargets.push(makeTarget(gl!, w, h));
      clearTarget(gl!, trailTargets[i], w, h);
    }
    trailWrite = 0;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  function blurPass(input: WebGLTexture, output: Target, stepX: number, stepY: number) {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, output.fbo);
    gl!.viewport(0, 0, maskW, maskH);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, input);
    gl!.uniform1i(blurTex, 0);
    gl!.uniform2f(blurStep, stepX, stepY);
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  }

  function modeIndex(mode: GlowMode) {
    return mode === "outer" ? 0 : mode === "inner" ? 1 : 2;
  }

  return {
    setMask(data, width, height) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      if (width !== maskW || height !== maskH) {
        maskW = width;
        maskH = height;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
        allocTargets(width, height);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, data);
      }
    },

    render(source, options) {
      const { w, h } = sourceSize(source);
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      gl.bindVertexArray(vao);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

      const hasMask = maskW > 0 && blurTargets.length === 4 && trailTargets.length === 2;
      const mode = modeIndex(options.mode);
      let trailTex = maskTex;

      if (hasMask) {
        gl.useProgram(blurProgram);
        // Wide bloom for the halo; narrow for a soft edge wash.
        const wide = 4.2;
        const narrow = 1.35;
        blurPass(maskTex, blurTargets[0], wide / maskW, 0);
        blurPass(blurTargets[0].tex, blurTargets[1], 0, wide / maskH);
        blurPass(maskTex, blurTargets[2], narrow / maskW, 0);
        blurPass(blurTargets[2].tex, blurTargets[3], 0, narrow / maskH);

        const prev = trailTargets[1 - trailWrite];
        const next = trailTargets[trailWrite];
        gl.useProgram(trailProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo);
        gl.viewport(0, 0, maskW, maskH);
        const bindTrail = (unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(loc, unit);
        };
        bindTrail(0, blurTargets[1].tex, trailU.wide);
        bindTrail(1, blurTargets[3].tex, trailU.narrow);
        bindTrail(2, prev.tex, trailU.prev);
        gl.uniform1i(trailU.mode, mode);
        gl.uniform1f(trailU.decay, TRAIL_DECAY);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        trailTex = next.tex;
        trailWrite = 1 - trailWrite;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(compositeProgram);
      const bind = (unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(loc, unit);
      };
      bind(0, videoTex, u.video);
      bind(1, hasMask ? blurTargets[3].tex : maskTex, u.narrow);
      bind(2, trailTex, u.trail);
      const [r, g, b] = options.color;
      gl.uniform3f(u.color, r / 255, g / 255, b / 255);
      gl.uniform1f(u.time, options.timeSeconds);
      gl.uniform1f(u.strength, options.strength);
      gl.uniform1i(u.mode, mode);
      gl.uniform1f(u.hasMask, hasMask ? 1 : 0);
      gl.uniform1f(u.scan, options.scan ?? -1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },

    dispose() {
      disposeTargets(blurTargets);
      disposeTargets(trailTargets);
      gl.deleteTexture(videoTex);
      gl.deleteTexture(maskTex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(trailProgram);
      gl.deleteProgram(compositeProgram);
    },
  };
}
