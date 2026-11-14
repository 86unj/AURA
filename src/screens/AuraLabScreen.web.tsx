import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { ImageSegmenter, MPMask } from "@mediapipe/tasks-vision";

import { COLORS } from "../theme/game";
import { RootStackParamList } from "../navigation/types";
import { analyzeAura } from "../services/analyzeAura";
import { AuraRenderer, createAuraRenderer } from "../effects/auraRenderer";
import { AuraReportView, hexToRgba } from "../components/AuraReportView";
import { GameButton } from "../components/GameButton";
import { useAuth } from "../context/AuthContext";
import { PhoneReceiver, ReceiverStatus, startPhoneReceiver } from "../services/phoneReceiver";
import { AuraReport } from "../types";

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

type AuraRgb = readonly [number, number, number];

/** Starting idle glow; each completed scan picks a new one on return. */
const DEFAULT_AURA_COLOR: AuraRgb = [167, 139, 250];
const GLOW_MODE = "both" as const;

/** Saturated mid-lightness RGB so the glow stays vivid on dark video. */
function randomAuraColor(avoid?: AuraRgb): AuraRgb {
  for (let attempt = 0; attempt < 8; attempt++) {
    const h = Math.random();
    const s = 0.65 + Math.random() * 0.3;
    const l = 0.52 + Math.random() * 0.18;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const next: AuraRgb = [
      Math.round(hue2rgb(h + 1 / 3) * 255),
      Math.round(hue2rgb(h) * 255),
      Math.round(hue2rgb(h - 1 / 3) * 255),
    ];
    if (
      !avoid ||
      Math.abs(next[0] - avoid[0]) +
        Math.abs(next[1] - avoid[1]) +
        Math.abs(next[2] - avoid[2]) >
        120
    ) {
      return next;
    }
  }
  return DEFAULT_AURA_COLOR;
}

/** Long side of the frame fed to the segmenter. The mask comes back at this size. */
const SEG_SIZE = 640;
/** Temporal mask smoothing: higher = snappier, lower = steadier. */
const SMOOTHING = 0.6;
/** Width of the photo sent to the AI (same as CameraScreen). */
const CAPTURE_WIDTH = 640;
/** Seconds for the scan bar to sweep down and back up. */
const SCAN_PERIOD = 2.4;
/** Below this window width the two halves stack vertically. */
const SPLIT_MIN_WIDTH = 820;

type Phase = "live" | "frozen" | "analyzing" | "result";
type VideoSource = "phone" | "webcam";

const PHONE_STATUS_TEXT: Record<ReceiverStatus, string> = {
  waiting: "Waiting for phone… open Remote camera on your phone (same account).",
  connecting: "Phone found, connecting…",
  connected: "Phone connected, waiting for video…",
  error: "Connection problem.",
};

type RenderSettings = {
  /** Live rendering paused (frozen / analyzing / result). */
  frozen: boolean;
  /** Full-resolution snapshot taken at capture; the scan animation renders this. */
  frozenSource: HTMLCanvasElement | null;
  scanning: boolean;
};

export function AuraLabScreen({ navigation }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settings = useRef<RenderSettings>({ frozen: false, frozenSource: null, scanning: false });
  const auraColorRef = useRef<AuraRgb>(DEFAULT_AURA_COLOR);
  const frozenFrame = useRef<string | null>(null);
  const frozenUri = useRef<string | null>(null);
  const analyzeToken = useRef(0);
  const sourceRef = useRef<VideoSource>("phone");
  const { width } = useWindowDimensions();
  const stacked = width < SPLIT_MIN_WIDTH;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [phase, setPhase] = useState<Phase>("live");
  const { user } = useAuth();
  const [source, setSource] = useState<VideoSource>("phone");
  const [hasVideo, setHasVideo] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<ReceiverStatus>("waiting");
  const [sourceError, setSourceError] = useState("");
  const [result, setResult] = useState<AuraReport | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const receiverRef = useRef<PhoneReceiver | null>(null);
  // Always call the latest capture handlers from the phone control channel.
  const actionsRef = useRef({
    capture: () => {},
    analyze: async () => {},
    retake: () => {},
  });
  // Capture/analyze live on the phone when Phone source is selected.
  const phoneOwnsControls = source === "phone";
  sourceRef.current = source;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    let segmenter: ImageSegmenter | null = null;
    let renderer: AuraRenderer | null = null;
    let rafId = 0;
    let scanRafId = 0;
    let videoCallbackId = 0;

    // Small 2D canvas the segmenter reads from. Feeding the full 1080p frame
    // makes MediaPipe return a full-size mask, which is what made it slow.
    const segCanvas = document.createElement("canvas");
    const segCtx = segCanvas.getContext("2d", { willReadFrequently: false });

    let smooth: Float32Array | null = null;
    let maskBytes: Uint8Array | null = null;

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
      const vw = video!.videoWidth;
      const vh = video!.videoHeight;
      if (!vw || !vh) return;

      // Scale the long side to SEG_SIZE (works for landscape and portrait phones).
      const scale = SEG_SIZE / Math.max(vw, vh);
      const segW = Math.round(vw * scale);
      const segH = Math.round(vh * scale);
      if (segCanvas.width !== segW || segCanvas.height !== segH) {
        segCanvas.width = segW;
        segCanvas.height = segH;
      }

      const t0 = performance.now();
      segCtx.drawImage(video!, 0, 0, segW, segH);
      segmenter.segmentForVideo(segCanvas, t0, (result) => {
        onMasks(result.confidenceMasks);
      });

      renderer.render(video!, {
        color: auraColorRef.current,
        mode: GLOW_MODE,
        timeSeconds: performance.now() / 1000,
        strength: 1,
      });
    }

    // While analyzing, the live loop is paused. This loop redraws the captured
    // snapshot with a scan bar that sweeps over the person only.
    function scanLoop() {
      if (cancelled) return;
      const s = settings.current;
      if (s.scanning && s.frozenSource && renderer) {
        const t = performance.now() / 1000;
        renderer.render(s.frozenSource, {
          color: auraColorRef.current,
          mode: GLOW_MODE,
          timeSeconds: t,
          strength: 1,
          scan: 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / SCAN_PERIOD),
        });
      }
      scanRafId = requestAnimationFrame(scanLoop);
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
        } catch (gpuError) {
          console.warn("GPU delegate failed, using CPU:", gpuError);
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            ...options,
          });
        }
        if (cancelled) {
          segmenter.close();
          return;
        }
        setLoadState("ready");
        schedule();
        scanLoop();
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
      cancelAnimationFrame(scanRafId);
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
        onControl: (action) => {
          if (cancelled) return;
          if (action === "capture") actionsRef.current.capture();
          else if (action === "analyze") void actionsRef.current.analyze();
          else if (action === "retake") actionsRef.current.retake();
        },
      });
      receiverRef.current = receiver;
    }

    return () => {
      cancelled = true;
      receiverRef.current = null;
      webcam?.getTracks().forEach((track) => track.stop());
      receiver?.stop().catch(() => {});
      video.srcObject = null;
      setHasVideo(false);
    };
  }, [source, user]);

  // Keep the phone shutter UI in sync with Aura Lab's capture phase.
  // The phone's own page has no "result" state: it goes back to live.
  useEffect(() => {
    if (source !== "phone") return;
    receiverRef.current?.sendPhase(phase === "result" ? "live" : phase);
  }, [phase, source, hasVideo, phoneStatus]);

  function captureRawFrame(): string | null {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Stream from the phone is already gravity-upright; send that to the API.
    const out = document.createElement("canvas");
    out.width = CAPTURE_WIDTH;
    out.height = Math.round((vh * CAPTURE_WIDTH) / vw);
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, out.width, out.height);
    // Raw camera frame (no aura overlay) is what goes to the AI.
    return out.toDataURL("image/jpeg", 0.78).split(",")[1] ?? null;
  }

  /** Full-resolution copy of the current frame: scan animation source + result photo. */
  function snapshotFrame(): HTMLCanvasElement | null {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const snap = document.createElement("canvas");
    snap.width = video.videoWidth;
    snap.height = video.videoHeight;
    const ctx = snap.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return snap;
  }

  function syncPhonePhase(next: "live" | "frozen" | "analyzing") {
    if (sourceRef.current === "phone") {
      receiverRef.current?.sendPhase(next);
    }
  }

  /** Step 1: freeze the screen. Nothing is sent yet. */
  function handleCapture() {
    if (phase !== "live" || !ready) {
      syncPhonePhase(phase === "live" ? "live" : phase === "result" ? "live" : phase);
      return;
    }
    const base64 = captureRawFrame();
    const snap = snapshotFrame();
    if (!base64 || !snap) {
      syncPhonePhase("live");
      return;
    }
    frozenFrame.current = base64;
    frozenUri.current = snap.toDataURL("image/jpeg", 0.9);
    settings.current.frozenSource = snap;
    settings.current.frozen = true;
    setPhase("frozen");
    syncPhonePhase("frozen");
  }

  /** Step 2: user confirmed the frozen frame, send it. */
  async function handleAnalyze() {
    const base64 = frozenFrame.current;
    if (phase !== "frozen" || !base64) {
      syncPhonePhase(phase === "result" ? "live" : phase);
      return;
    }
    setPhase("analyzing");
    syncPhonePhase("analyzing");
    settings.current.scanning = true;
    const token = ++analyzeToken.current;
    let report: AuraReport;
    try {
      report = await analyzeAura(base64);
    } catch (error) {
      console.error("Aura analysis failed:", error);
      if (token === analyzeToken.current) {
        settings.current.scanning = false;
        setPhase("frozen");
        syncPhonePhase("frozen");
      }
      return;
    }
    if (token !== analyzeToken.current) return; // Retake pressed meanwhile.

    settings.current.scanning = false;
    setCapturedUri(frozenUri.current);
    setResult(report);
    setPhase("result");
    // The phone opens the normal report screen; this screen shows it beside the photo.
    if (sourceRef.current === "phone") {
      receiverRef.current?.sendReport(report);
    }
  }

  function handleRetake() {
    // Fresh idle glow after a finished scan; mid-flow retakes keep the same color.
    if (phase === "result") {
      auraColorRef.current = randomAuraColor(auraColorRef.current);
    }
    analyzeToken.current += 1;
    frozenFrame.current = null;
    frozenUri.current = null;
    settings.current.frozen = false;
    settings.current.frozenSource = null;
    settings.current.scanning = false;
    setResult(null);
    setCapturedUri(null);
    setPhase("live");
    syncPhonePhase("live");
  }

  actionsRef.current = {
    capture: handleCapture,
    analyze: handleAnalyze,
    retake: handleRetake,
  };

  const mirrored = source === "webcam";
  const canvasStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    // Mirror the selfie webcam only; the phone's back camera is not mirrored.
    transform: mirrored ? "scaleX(-1)" : "none",
    display: "block",
    visibility: hasVideo || phase !== "live" ? "visible" : "hidden",
  };
  const photoStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transform: mirrored ? "scaleX(-1)" : "none",
    display: "block",
  };

  const ready = loadState === "ready" && hasVideo;
  const showResult = phase === "result" && result !== null;

  function switchSource(next: VideoSource) {
    if (next === source) return;
    handleRetake();
    setSource(next);
  }

  const linkColor = hasVideo ? "#4ADE80" : phoneStatus === "error" ? "#F87171" : "#FBBF24";

  return (
    <SafeAreaView style={styles.shell}>
      {/* Frame source only; never shown. Kept outside the stage so hiding it can't pause playback. */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      <View style={[styles.split, stacked && styles.splitStacked]}>
        {/* Left half: the camera, then the captured photo once there is a report. */}
        <View style={[styles.pane, styles.leftPane]}>
          {showResult && capturedUri ? (
            <View style={styles.photoFrame}>
              <img src={capturedUri} alt="Captured photo" style={photoStyle} />
            </View>
          ) : null}

          <View style={[styles.stage, showResult && styles.hidden]}>
            <canvas ref={canvasRef} style={canvasStyle} />

            {loadState === "loading" ? (
              <View style={styles.overlay}>
                <ActivityIndicator color={COLORS.accentMuted} />
                <Text style={styles.overlayText}>Loading aura model…</Text>
              </View>
            ) : null}
            {loadState === "ready" && !hasVideo && phase === "live" ? (
              <View style={styles.overlay}>
                {phoneStatus === "connecting" ? (
                  <ActivityIndicator color={COLORS.accentMuted} />
                ) : null}
                <Text style={styles.overlayTitle}>
                  {source === "phone" ? "Phone camera" : "Webcam"}
                </Text>
                <Text style={styles.overlayText}>
                  {sourceError ||
                    (source === "phone"
                      ? PHONE_STATUS_TEXT[phoneStatus]
                      : "Opening webcam…")}
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

          {!phoneOwnsControls && !showResult ? (
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
          ) : null}
        </View>

        <View style={[styles.pane, styles.rightPane]}>
          {showResult && result ? (
            <LinearGradient
              colors={[hexToRgba(result.aura_color, 0.22), COLORS.bg, COLORS.bg]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.reportPanel}
            >
              <AuraReportView report={result} paddingTop={20}>
                <GameButton label="Scan again" onPress={handleRetake} />
              </AuraReportView>
            </LinearGradient>
          ) : (
            <View style={styles.hero}>
              <Text style={[styles.heroTitle, stacked && styles.heroTitleStacked]}>
                AURA
              </Text>
              <Text style={styles.heroSubtitle}>
                Step in front of the camera and let the aura do the talking.
              </Text>
              <View style={styles.sourceRow}>
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
                    <View style={[styles.linkDot, { backgroundColor: linkColor }]} />
                    <Text style={styles.chipText}>{hasVideo ? "Live" : phoneStatus}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </View>

      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={10}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  split: {
    flex: 1,
    flexDirection: "row",
    gap: 24,
    padding: 24,
    // Room for the back button above the camera.
    paddingTop: 72,
  },
  splitStacked: { flexDirection: "column" },
  pane: { flex: 1, minHeight: 0, gap: 14 },
  leftPane: { justifyContent: "center" },
  rightPane: { justifyContent: "center" },
  hidden: { display: "none" },
  backButton: {
    position: "absolute",
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,17,26,0.6)",
  },
  hero: { paddingHorizontal: 32, gap: 20, flex: 1, justifyContent: "center" },
  heroTitle: {
    color: COLORS.text,
    fontSize: 120,
    lineHeight: 112,
    fontWeight: "900",
    letterSpacing: -4,
  },
  heroTitleStacked: { fontSize: 64, lineHeight: 62, letterSpacing: -2 },
  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    maxWidth: 420,
  },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  photoFrame: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stage: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reportPanel: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
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
    bottom: 14,
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
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  linkState: { marginLeft: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  linkDot: { width: 8, height: 8, borderRadius: 4 },
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
