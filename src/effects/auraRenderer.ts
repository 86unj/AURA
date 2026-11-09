/**
 * WebGL2 aura renderer (web only).
 *
 * Per frame:
 *   1. Upload the camera frame as a texture (full resolution).
 *   2. Upload the low-res person mask (R8).
 *   3. Blur the mask twice (wide bloom + tight glow) at mask resolution.
 *   4. Composite at full resolution: video + tinted glow + thin rim.
 *
 * All heavy work is on the GPU, so the cost barely depends on video size.
 */

export type GlowMode = "outer" | "inner";

export type AuraFrameOptions = {
  color: readonly [number, number, number]; // 0-255
  mode: GlowMode;
  timeSeconds: number;
  strength: number;
};

export type AuraRenderer = {
  setMask(data: Uint8Array, width: number, height: number): void;
  render(video: HTMLVideoElement, options: AuraFrameOptions): void;
  dispose(): void;
};

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

const COMPOSITE_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform sampler2D uWide;
uniform sampler2D uNarrow;
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
uniform int uMode;
uniform float uHasMask;
void main() {
  // Textures are stored top row first; flip so the image is upright.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 base = texture(uVideo, uv).rgb;
  if (uHasMask < 0.5) {
    outColor = vec4(base, 1.0);
    return;
  }

  // Low-res mask. A 4-neighbor max expands the silhouette by ~1 mask px
  // so the outline sits on the body edge instead of inside it.
  vec2 texel = 1.0 / vec2(textureSize(uMask, 0));
  float raw = texture(uMask, uv).r;
  float dilated = max(
    max(raw, texture(uMask, uv + vec2(texel.x, 0.0)).r),
    max(
      max(texture(uMask, uv - vec2(texel.x, 0.0)).r, texture(uMask, uv + vec2(0.0, texel.y)).r),
      texture(uMask, uv - vec2(0.0, texel.y)).r
    )
  );
  float m = smoothstep(0.40, 0.56, dilated);
  float bw = texture(uWide, uv).r;
  float bn = texture(uNarrow, uv).r;

  float glow;
  if (uMode == 0) {
    // Soft bloom outside, tighter near-edge fill from the narrow blur.
    glow = (bw * 0.7 + bn * 1.05) * (1.0 - m);
  } else {
    glow = ((1.0 - bw) * 0.55 + (1.0 - bn) * 0.95) * m;
  }

  // Rim from the narrow blur ring (not the soft confidence band) so it
  // follows the silhouette cleanly instead of looking blotchy.
  float rim = smoothstep(0.12, 0.48, bn) * (1.0 - m);
  rim *= rim; // concentrate into a thin bright edge
  float pulse = 0.85 + 0.15 * sin(uTime * 2.8);
  float flow = 0.82 + 0.18 * sin(uv.y * 16.0 - uTime * 3.0 + uv.x * 5.0);

  vec3 col = base
    + uColor * glow * pulse * flow * uStrength
    + mix(uColor, vec3(1.0), 0.55) * rim * 0.85 * uStrength;
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
  const compositeProgram = link(gl, COMPOSITE_FRAG);
  const blurStep = gl.getUniformLocation(blurProgram, "uStep");
  const blurTex = gl.getUniformLocation(blurProgram, "uTex");
  const u = {
    video: gl.getUniformLocation(compositeProgram, "uVideo"),
    mask: gl.getUniformLocation(compositeProgram, "uMask"),
    wide: gl.getUniformLocation(compositeProgram, "uWide"),
    narrow: gl.getUniformLocation(compositeProgram, "uNarrow"),
    color: gl.getUniformLocation(compositeProgram, "uColor"),
    time: gl.getUniformLocation(compositeProgram, "uTime"),
    strength: gl.getUniformLocation(compositeProgram, "uStrength"),
    mode: gl.getUniformLocation(compositeProgram, "uMode"),
    hasMask: gl.getUniformLocation(compositeProgram, "uHasMask"),
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
  const targets: Target[] = [];
  let maskW = 0;
  let maskH = 0;

  function allocTargets(w: number, h: number) {
    for (const t of targets) {
      gl!.deleteTexture(t.tex);
      gl!.deleteFramebuffer(t.fbo);
    }
    targets.length = 0;
    for (let i = 0; i < 4; i++) {
      const tex = makeTexture(gl!);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.R8, w, h, 0, gl!.RED, gl!.UNSIGNED_BYTE, null);
      const fbo = gl!.createFramebuffer();
      if (!fbo) throw new Error("Could not create framebuffer.");
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
      targets.push({ tex, fbo });
    }
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

    render(video, options) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      gl.bindVertexArray(vao);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      const hasMask = maskW > 0 && targets.length === 4;
      if (hasMask) {
        gl.useProgram(blurProgram);
        // Same 4 blur passes; slightly larger narrow radius for a cleaner rim.
        const wide = 3.2;
        const narrow = 1.25;
        blurPass(maskTex, targets[0], wide / maskW, 0);
        blurPass(targets[0].tex, targets[1], 0, wide / maskH);
        blurPass(maskTex, targets[2], narrow / maskW, 0);
        blurPass(targets[2].tex, targets[3], 0, narrow / maskH);
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
      bind(1, maskTex, u.mask);
      bind(2, hasMask ? targets[1].tex : maskTex, u.wide);
      bind(3, hasMask ? targets[3].tex : maskTex, u.narrow);
      const [r, g, b] = options.color;
      gl.uniform3f(u.color, r / 255, g / 255, b / 255);
      gl.uniform1f(u.time, options.timeSeconds);
      gl.uniform1f(u.strength, options.strength);
      gl.uniform1i(u.mode, options.mode === "outer" ? 0 : 1);
      gl.uniform1f(u.hasMask, hasMask ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },

    dispose() {
      for (const t of targets) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      gl.deleteTexture(videoTex);
      gl.deleteTexture(maskTex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(blurProgram);
      gl.deleteProgram(compositeProgram);
    },
  };
}
