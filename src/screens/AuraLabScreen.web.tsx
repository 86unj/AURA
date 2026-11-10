import { CSSProperties, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import type { ImageSegmenter, MPMask } from "@mediapipe/tasks-vision";

import { COLORS } from "../theme/game";
import { RootStackParamList } from "../navigation/types";
import { analyzeAura } from "../services/analyzeAura";
import { AuraRenderer, createAuraRenderer, GlowMode } from "../effects/auraRenderer";
import { useAuth } from "../context/AuthContext";
import { PhoneReceiver, ReceiverStatus, startPhoneReceiver } from "../services/phoneReceiver";

type Props = NativeStackScreenProps<RootStackParamList, "AuraLab">;

// Keep these versions in step with the installed @mediapipe/tasks-vision.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

// Metro can't bundle the library's internal dynamic import(), so load the ES
// module from the CDN at runtime. The npm package is used for types only.
const loadVisionModule = new Function("url", "return import(url)") as (
  url: string,
) => Promise<typeof import("@mediapipe/tasks-vision")>;

const AURA_COLORS = [
  { name: "Violet", rgb: [167, 139, 250] },
  { name: "Cyan", rgb: [34, 211, 238] },
  { name: "Pink", rgb: [244, 114, 182] },
  { name: "Gold", rgb: [250, 204, 21] },
] as const;

/** Long side of the frame fed to the segmenter. The mask comes back at this size. */
const SEG_SIZE = 384;
/** Temporal mask smoothing: higher = snappier, lower = steadier. */
const SMOOTHING = 0.6;
/** Width of the photo sent to the AI (same as CameraScreen). */
const CAPTURE_WIDTH = 640;

type Phase = "live" | "frozen" | "analyzing";
type VideoSource = "phone" | "webcam";

const PHONE_STATUS_TEXT: Record<ReceiverStatus, string> = {
  waiting: "Waiting for phone… open Remote camera on your phone (same account).",
  connecting: "Phone found, connecting…",
  connected: "Phone connected, waiting for video…",
  error: "Connection problem.",
};

type RenderSettings = {
  frozen: boolean;
  mode: GlowMode;
  colorIndex: number;
};

type Stats = { fps: number; segMs: number; size: string; delegate: string };

export function AuraLabScreen({ navigation }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settings = useRef<RenderSettings>({ frozen: false, mode: "outer", colorIndex: 0 });
  const frozenFrame = useRef<string | null>(null);
  const analyzeToken = useRef(0);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [stats, setStats] = useState<Stats>({ fps: 0, segMs: 0, size: "", delegate: "" });
  const [phase, setPhase] = useState<Phase>("live");
  const [mode, setMode] = useState<GlowMode>("outer");
  const [colorIndex, setColorIndex] = useState(0);
  const { user } = useAuth();
  const [source, setSource] = useState<VideoSource>("phone");
  const [hasVideo, setHasVideo] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<ReceiverStatus>("waiting");
  const [sourceError, setSourceError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    let segmenter: ImageSegmenter | null = null;
    let renderer: AuraRenderer | null = null;
    let rafId = 0;
    let videoCallbackId = 0;
    let delegate = "";

    // Small 2D canvas the segmenter reads from. Feeding the full 1080p frame
    // makes MediaPipe return a full-size mask, which is what made it slow.
    const segCanvas = document.createElement("canvas");
    const segCtx = segCanvas.getContext("2d", { willReadFrequently: false });

    let smooth: Float32Array | null = null;
    let maskBytes: Uint8Array | null = null;

    let frames = 0;
    let segTotal = 0;
    let lastStat = performance.now();

    function onMasks(masks: MPMask[] | undefined) {
      if (!masks || !renderer) return;
      // Two-class models list background first; single-class gives one mask.
      const mask = masks.length > 1 ? masks[1] : masks[0];
      if (!mask) return;
      const data = mask.getAsFloat32Array();
      if (!smooth || smooth.length !== data.length) {
        smooth = new Float32Array(data);
        maskBytes = new Uint8Array(data.length);
      }
      const s = smooth;
      const out = maskBytes!;
      for (let i = 0; i < data.length; i++) {
        s[i] += (data[i] - s[i]) * SMOOTHING;
        out[i] = s[i] * 255;
      }
      renderer.setMask(out, mask.width, mask.height);
    }

    function renderFrame() {
      if (cancelled || !segmenter || !renderer || !segCtx) return;
      if (settings.current.frozen || video!.readyState < 2) return;
      const w = video!.videoWidth;
      const h = video!.videoHeight;
      if (!w || !h) return;

      // Scale the long side to SEG_SIZE (works for landscape and portrait phones).
      const scale = SEG_SIZE / Math.max(w, h);
      const segW = Math.round(w * scale);
      const segH = Math.round(h * scale);
      if (segCanvas.width !== segW || segCanvas.height !== segH) {
        segCanvas.width = segW;
        segCanvas.height = segH;
      }

      const t0 = performance.now();
      segCtx.drawImage(video!, 0, 0, segW, segH);
      segmenter.segmentForVideo(segCanvas, t0, (result) => {
        onMasks(result.confidenceMasks);
      });
      const t1 = performance.now();

      const { mode: glowMode, colorIndex: ci } = settings.current;
      renderer.render(video!, {
        color: AURA_COLORS[ci].rgb,
        mode: glowMode,
        timeSeconds: t1 / 1000,
        strength: 1,
      });

      frames += 1;
      segTotal += t1 - t0;
      if (t1 - lastStat >= 500) {
        setStats({
          fps: Math.round((frames * 1000) / (t1 - lastStat)),
          segMs: Math.round(segTotal / frames),
          size: `${w}x${h}`,
          delegate,
        });
        frames = 0;
        segTotal = 0;
        lastStat = t1;
      }
    }

    let pending = false;
    function schedule() {
      // Only one callback in flight, even if kicked by several events.
      if (cancelled || pending || !segmenter) return;
      pending = true;
      const tick = () => {
        pending = false;
        renderFrame();
        schedule();
      };
      // Process each new video frame exactly once; fall back to rAF.
      if ("requestVideoFrameCallback" in video!) {
        videoCallbackId = video!.requestVideoFrameCallback(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    }

    // Restart the frame loop whenever a (new) source starts playing.
    // A callback registered before the source changed may never fire, so
    // cancel it and register a fresh one.
    const kick = () => {
      if (pending) {
        if (videoCallbackId && "cancelVideoFrameCallback" in video) {
          video.cancelVideoFrameCallback(videoCallbackId);
        }
        cancelAnimationFrame(rafId);
        pending = false;
      }
      schedule();
    };
    video.addEventListener("playing", kick);
    video.addEventListener("loadeddata", kick);

    async function start() {
      try {
        renderer = createAuraRenderer(canvas!);

        const { FilesetResolver, ImageSegmenter } = await loadVisionModule(BUNDLE_URL);
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const options = {
          runningMode: "VIDEO" as const,
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        };
        try {
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            ...options,
          });
          delegate = "GPU";
        } catch (gpuError) {
          console.warn("GPU delegate failed, using CPU:", gpuError);
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            ...options,
          });
          delegate = "CPU";
        }
        if (cancelled) {
          segmenter.close();
          return;
        }
        setLoadState("ready");
        schedule();
      } catch (error) {
        console.error("Aura lab failed to start:", error);
        setLoadState("error");
        setErrorText(error instanceof Error ? error.message : "Could not start the camera.");
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (videoCallbackId && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(videoCallbackId);
      }
      video.removeEventListener("playing", kick);
      video.removeEventListener("loadeddata", kick);
      segmenter?.close();
      renderer?.dispose();
    };
  }, []);

  // Video source: the phone over WebRTC, or the laptop webcam for testing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let webcam: MediaStream | null = null;
    let receiver: PhoneReceiver | null = null;

    function attach(stream: MediaStream | null) {
      video!.srcObject = stream;
      setHasVideo(Boolean(stream));
      if (stream) video!.play().catch(() => {});
    }

    setSourceError("");
    if (source === "webcam") {
      setPhoneStatus("waiting");
      navigator.mediaDevices
        .getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            facingMode: "user",
          },
          audio: false,
        })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          webcam = stream;
          attach(stream);
        })
        .catch((error) =>
          setSourceError(error instanceof Error ? error.message : "Could not open the webcam."),
        );
    } else if (user) {
      receiver = startPhoneReceiver(user.id, {
        onStream: (stream) => {
          if (!cancelled) attach(stream);
        },
        onStatus: (status, detail) => {
          if (cancelled) return;
          setPhoneStatus(status);
          setSourceError(status === "error" ? detail ?? "Connection error." : "");
        },
      });
    }

    return () => {
      cancelled = true;
      webcam?.getTracks().forEach((track) => track.stop());
      receiver?.stop().catch(() => {});
      video.srcObject = null;
      setHasVideo(false);
    };
  }, [source, user]);

  function captureRawFrame(): string | null {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const out = document.createElement("canvas");
    out.width = CAPTURE_WIDTH;
    out.height = Math.round((video.videoHeight * CAPTURE_WIDTH) / video.videoWidth);
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, out.width, out.height);
    // Raw camera frame (no aura overlay) is what goes to the AI.
    return out.toDataURL("image/jpeg", 0.78).split(",")[1] ?? null;
  }

  /** Step 1: freeze the screen. Nothing is sent yet. */
  function handleCapture() {
    if (phase !== "live" || !ready) return;
    const base64 = captureRawFrame();
    if (!base64) return;
    frozenFrame.current = base64;
    settings.current.frozen = true;
    setPhase("frozen");
  }

  /** Step 2: user confirmed the frozen frame, send it. */
  async function handleAnalyze() {
    const base64 = frozenFrame.current;
    if (phase !== "frozen" || !base64) return;
    setPhase("analyzing");
    const token = ++analyzeToken.current;
    const report = await analyzeAura(base64);
    if (token !== analyzeToken.current) return; // Retake pressed meanwhile.
    handleRetake();
    navigation.navigate("AuraReport", { report });
  }

  function handleRetake() {
    analyzeToken.current += 1;
    frozenFrame.current = null;
    settings.current.frozen = false;
    setPhase("live");
  }

  const canvasStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    // Mirror the selfie webcam only; the phone's back camera is not mirrored.
    transform: source === "webcam" ? "scaleX(-1)" : "none",
    display: "block",
    visibility: hasVideo || phase !== "live" ? "visible" : "hidden",
  };

  const ready = loadState === "ready" && hasVideo;

  function switchSource(next: VideoSource) {
    if (next === source) return;
    handleRetake();
    setSource(next);
  }

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>AURA LAB</Text>
        <Text style={styles.stats}>
          {stats.size} · {stats.fps} fps · seg {stats.segMs} ms · {stats.delegate}
        </Text>
      </View>

      <View style={styles.stage}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        />
        <canvas ref={canvasRef} style={canvasStyle} />

        {loadState === "loading" ? (
          <View style={styles.overlay}>
            <ActivityIndicator color={COLORS.accentMuted} />
            <Text style={styles.overlayText}>Loading aura model…</Text>
          </View>
        ) : null}
        {loadState === "ready" && !hasVideo && phase === "live" ? (
          <View style={styles.overlay}>
            {phoneStatus === "connecting" ? <ActivityIndicator color={COLORS.accentMuted} /> : null}
            <Text style={styles.overlayTitle}>
              {source === "phone" ? "Phone camera" : "Webcam"}
            </Text>
            <Text style={styles.overlayText}>
              {sourceError ||
                (source === "phone" ? PHONE_STATUS_TEXT[phoneStatus] : "Opening webcam…")}
            </Text>
          </View>
        ) : null}
        {loadState === "error" ? (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Could not start</Text>
            <Text style={styles.overlayText}>{errorText}</Text>
          </View>
        ) : null}
        {phase === "analyzing" ? (
          <View style={styles.badge}>
            <ActivityIndicator color={COLORS.accent} size="small" />
            <Text style={styles.badgeText}>Reading aura…</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <View style={styles.row}>
          {AURA_COLORS.map((c, index) => (
            <Pressable
              key={c.name}
              accessibilityRole="button"
              accessibilityLabel={`${c.name} aura`}
              onPress={() => {
                setColorIndex(index);
                settings.current.colorIndex = index;
              }}
              style={[
                styles.swatch,
                { backgroundColor: `rgb(${c.rgb.join(",")})` },
                colorIndex === index && styles.swatchActive,
              ]}
            />
          ))}
          <View style={styles.modeGroup}>
            {(["outer", "inner"] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityLabel={`${m} glow`}
                onPress={() => {
                  setMode(m);
                  settings.current.mode = m;
                }}
                style={[styles.chip, mode === m && styles.chipActive]}
              >
                <Text style={styles.chipText}>{m === "outer" ? "Outer" : "Inner"}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Source</Text>
          {(["phone", "webcam"] as const).map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`Use ${s} camera`}
              onPress={() => switchSource(s)}
              style={[styles.chip, source === s && styles.chipActive]}
            >
              <Text style={styles.chipText}>{s === "phone" ? "Phone" : "Webcam"}</Text>
            </Pressable>
          ))}
          {source === "phone" ? (
            <View style={styles.linkState}>
              <View
                style={[
                  styles.linkDot,
                  {
                    backgroundColor:
                      hasVideo ? "#4ADE80" : phoneStatus === "error" ? "#F87171" : "#FBBF24",
                  },
                ]}
              />
              <Text style={styles.chipText}>{hasVideo ? "Live" : phoneStatus}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.row}>
          {phase === "live" ? (
            <Pressable
              style={[styles.primaryButton, !ready && styles.disabled]}
              onPress={handleCapture}
              disabled={!ready}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Capture</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={styles.secondaryButton}
                onPress={handleRetake}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryText}>Retake</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, phase === "analyzing" && styles.disabled]}
                onPress={handleAnalyze}
                disabled={phase === "analyzing"}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Analyze aura</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backButton: { width: 44, height: 44, justifyContent: "center" },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  stats: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 260,
    textAlign: "right",
  },
  stage: {
    flex: 1,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: "rgba(5,7,12,0.7)",
  },
  overlayTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  overlayText: { color: COLORS.textMuted, fontSize: 14, textAlign: "center" },
  badge: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15,17,26,0.7)",
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  controls: { marginTop: 14, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: { borderColor: "#fff" },
  label: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  linkState: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 },
  linkDot: { width: 8, height: 8, borderRadius: 4 },
  modeGroup: { marginLeft: "auto", flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.surfaceRaised, borderColor: COLORS.accentMuted },
  chipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "700" },
  primaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  primaryText: { color: COLORS.onAccent, fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    height: 52,
    paddingHorizontal: 26,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceRaised,
  },
  secondaryText: { color: COLORS.text, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
