import { useEffect, useRef, useState } from "react";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  CameraType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { ScanningOverlay } from "../components/ScanningOverlay";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { useAuth } from "../context/AuthContext";
// import { useBadgeUnlock } from "../context/BadgeUnlockContext";
import { useProfile } from "../context/ProfileContext";
import { RootStackParamList } from "../navigation/types";
import { analyzeAura, hasAuraAnalysisEndpoint } from "../services/analyzeAura";
// import { evaluateAndUnlockBadges } from "../services/badges";
import {
  hasScannedToday,
  saveDailyReport,
} from "../services/dailyAura";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

type ProcessedPhoto = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

// Lets the scanning overlay play a full sweep before the capture resolves.
const MIN_SCAN_OVERLAY_MS = 4000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function AnalyzeAuraButton({ onPress }: { onPress: () => void }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.4,
    transform: [{ scale: 1 + pulse.value * 0.05 }],
  }));

  const sparkleAStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.7,
    transform: [{ scale: 0.7 + pulse.value * 0.5 }],
  }));

  const sparkleBStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value * 0.7,
    transform: [{ scale: 1.2 - pulse.value * 0.5 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.analyzeButtonWrap,
        pressed && styles.scanButtonPressed,
      ]}
    >
      <Animated.View style={[styles.analyzeGlow, glowStyle]} />
      <LinearGradient
        colors={["#FBF5FF", "#E9D5FF", "#C4B5FD"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.analyzeGradient}
      >
        <Animated.Text
          style={[styles.sparkle, styles.sparkleTopLeft, sparkleAStyle]}
        >
          ✦
        </Animated.Text>
        <Text style={styles.analyzeButtonText}>Analyze aura</Text>
        <Animated.Text
          style={[styles.sparkle, styles.sparkleBottomRight, sparkleBStyle]}
        >
          ✦
        </Animated.Text>
      </LinearGradient>
    </Pressable>
  );
}

export function CameraScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  // const { showUnlocks } = useBadgeUnlock();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [processedPhoto, setProcessedPhoto] = useState<ProcessedPhoto | null>(
    null,
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const isFocused = useIsFocused();

  const isBusy = isCapturing || isAnalyzing;
  const dailyMode = route.params?.dailyMode === true;
  const canShowCamera = permission?.granted && !capturedUri;
  const scanTone = useAudioPlayer(require("../../assets/scan-tone.wav"));
  const permissionStatus = permission?.status;
  const analysisMode = hasAuraAnalysisEndpoint()
    ? "Live analysis"
    : "Fallback mode";

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: false }).catch((error) => {
      console.warn("Audio mode setup failed:", error);
    });
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setCameraReady(false);
    }
  }, [isFocused]);

  async function handleCapture() {
    if (!cameraRef.current || isBusy) {
      return;
    }

    if (dailyMode) {
      const alreadyScanned = await hasScannedToday();
      if (alreadyScanned) {
        Alert.alert(
          "Drop already claimed",
          "Today's pull is canon. Go touch grass, pull unlocks tomorrow.",
        );
        navigation.navigate("DailyAura");
        return;
      }
    }

    setIsCapturing(true);
    const startedAt = Date.now();

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      scanTone.seekTo(0);
      scanTone.volume = 0.7;
      scanTone.play();

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("Camera did not return a photo.");
      }

      setCapturedUri(photo.uri);

      const resizedPhoto = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 640 } }],
        {
          compress: 0.78,
          format: SaveFormat.JPEG,
          base64: true,
        },
      );

      if (!resizedPhoto.base64) {
        throw new Error("Photo resize did not return base64 data.");
      }

      setProcessedPhoto({
        uri: resizedPhoto.uri,
        base64: resizedPhoto.base64,
        width: resizedPhoto.width,
        height: resizedPhoto.height,
      });

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SCAN_OVERLAY_MS) {
        await wait(MIN_SCAN_OVERLAY_MS - elapsed);
      }
    } catch (error) {
      console.error("Camera capture failed:", error);
      Alert.alert(
        "Capture paused",
        "Aura could not capture or prepare this image. Try again and the camera will stay stable.",
      );
      setCapturedUri(null);
      setProcessedPhoto(null);
    } finally {
      setIsCapturing(false);
    }
  }

  function handleRetake() {
    if (isBusy) {
      return;
    }

    setCapturedUri(null);
    setProcessedPhoto(null);
    setCameraReady(false);
  }

  async function handleAnalyze() {
    if (!processedPhoto || isBusy || !user) {
      return;
    }

    setIsAnalyzing(true);

    try {
      const report = await analyzeAura(processedPhoto.base64);
      if (dailyMode) {
        await saveDailyReport(report);
        // const unlocked = await evaluateAndUnlockBadges({
        //   userId: user.id,
        //   report,
        //   scanTimestamp: new Date(),
        // });
        // if (unlocked.length > 0) {
        //   showUnlocks(unlocked);
        // }
        navigation.navigate("DailyAura");
      } else {
        // const unlocked = await evaluateAndUnlockBadges({
        //   userId: user.id,
        //   report,
        //   scanTimestamp: new Date(),
        // });
        // if (unlocked.length > 0) {
        //   showUnlocks(unlocked);
        // }
        navigation.navigate("AuraReport", { report });
      }
      setCapturedUri(null);
      setProcessedPhoto(null);
      setCameraReady(false);
    } catch (error) {
      console.error("Aura analysis failed:", error);
      Alert.alert(
        "Analysis paused",
        "Aura could not read this photo. Try analyzing again or retake the photo.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleRequestPermission() {
    try {
      await requestPermission();
    } catch (error) {
      console.error("Permission request failed:", error);
      Alert.alert(
        "Permission issue",
        "Aura could not request camera access right now. Open Settings and allow camera access manually.",
      );
    }
  }

  function handleToggleFacing() {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  function handleOpenProfile() {
    if (isBusy || !user) {
      return;
    }
    navigation.navigate("Profile");
  }

  function handleOpenSettings() {
    Linking.openSettings().catch(() => {
      Alert.alert(
        "Settings unavailable",
        "Open the app settings manually and allow camera access.",
      );
    });
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.screenShell}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#C4B5FD" />
          <Text style={styles.stateTitle}>Loading camera permissions</Text>
          <Text style={styles.stateBody}>
            Aura is checking camera access before starting the preview.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (permissionStatus === "undetermined") {
    return (
      <SafeAreaView style={styles.screenShell}>
        <View style={styles.permissionCard}>
          <Text style={styles.brand}>AURA</Text>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>
            To scan an aura, Aura needs the camera. Nothing is saved unless you
            hit Scan.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={handleRequestPermission}
          >
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </Pressable>
          {!dailyMode ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("History")}
            >
              <Text style={styles.secondaryButtonText}>View history</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  if (permissionStatus === "denied") {
    return (
      <SafeAreaView style={styles.screenShell}>
        <View style={styles.permissionCard}>
          <Text style={styles.brand}>AURA</Text>
          <Text style={styles.permissionTitle}>Camera access denied</Text>
          <Text style={styles.permissionBody}>
            Open Settings and allow camera access, then return here.
          </Text>
          <Pressable style={styles.primaryButton} onPress={handleOpenSettings}>
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={handleRequestPermission}
          >
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
          {!dailyMode ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("History")}
            >
              <Text style={styles.secondaryButtonText}>View history</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const cameraStatusLabel = isCapturing
    ? "Capturing"
    : isAnalyzing
      ? "Analyzing"
      : capturedUri
        ? "Frozen"
        : "Live";

  return (
    <SafeAreaView style={styles.screenShell}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>
              {dailyMode ? "DAILY AURA SCAN" : "DEADPAN CAMERA SCAN"}
            </Text>
            <Text style={styles.title}>
              {dailyMode ? "Today's reading." : "Point it at anything."}
            </Text>
          </View>
          {user ? (
            <ProfileAvatar
              userId={user.id}
              profile={profile}
              size="sm"
              onPress={handleOpenProfile}
            />
          ) : null}
        </View>
        {!dailyMode ? (
          <View style={styles.headerNav}>
            <Pressable
              style={styles.dailyLink}
              onPress={() => navigation.navigate("DailyAura")}
            >
              <Text style={styles.dailyLinkText}>Daily</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.navButton,
                pressed && styles.navButtonPressed,
              ]}
              onPress={() => navigation.navigate("History")}
              disabled={isBusy}
            >
              <Text style={styles.navButtonText}>History</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.previewFrame}>
        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={styles.previewImage} />
        ) : isFocused ? (
          <CameraView
            ref={cameraRef}
            style={styles.previewImage}
            facing={facing}
            active={isFocused}
            onCameraReady={() => setCameraReady(true)}
          />
        ) : null}

        <View style={styles.overlay}>
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
        </View>

        {!capturedUri ? (
          <Pressable
            style={({ pressed }) => [
              styles.cameraFlipButton,
              pressed && styles.cameraFlipButtonPressed,
              isBusy && styles.cameraFlipButtonDisabled,
            ]}
            onPress={handleToggleFacing}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={
              facing === "back" ? "Switch to front camera" : "Switch to back camera"
            }
          >
            <Ionicons name="camera-reverse-outline" size={22} color="#F8FAFC" />
          </Pressable>
        ) : null}

        {isCapturing ? <ScanningOverlay /> : null}
      </View>

      <View style={styles.statusBar}>
        <View style={styles.statusBarPrimary}>
          <View
            style={[
              styles.statusDot,
              isCapturing || isAnalyzing
                ? styles.statusDotBusy
                : capturedUri
                  ? styles.statusDotFrozen
                  : styles.statusDotLive,
            ]}
          />
          <Text style={styles.statusBarLabel}>{cameraStatusLabel}</Text>
        </View>
        <Text style={styles.statusBarDetail} numberOfLines={1}>
          {isAnalyzing
            ? analysisMode
            : capturedUri
              ? processedPhoto
                ? `${processedPhoto.width} x ${processedPhoto.height}`
                : "Preparing JPEG"
              : cameraReady
                ? "Camera ready"
                : "Warming up camera"}
        </Text>
      </View>

      <View style={styles.footer}>
        {capturedUri && !isBusy ? (
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.retakeButton,
                pressed && styles.retakeButtonPressed,
              ]}
              onPress={handleRetake}
            >
              <Text style={styles.retakeButtonText}>Retake</Text>
            </Pressable>
            <AnalyzeAuraButton onPress={handleAnalyze} />
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.scanButton,
              pressed && styles.scanButtonPressed,
              isBusy && styles.scanButtonDisabled,
            ]}
            onPress={handleCapture}
            disabled={isBusy || !cameraReady || !!capturedUri}
          >
            {isBusy ? (
              <View style={styles.scanButtonLoadingRow}>
                <ActivityIndicator color="#05070C" />
                <Text style={styles.scanButtonText}>
                  {isAnalyzing ? "Analyzing" : "Capturing"}
                </Text>
              </View>
            ) : (
              <Text style={styles.scanButtonText}>
                {dailyMode ? "Scan daily aura" : "Scan"}
              </Text>
            )}
          </Pressable>
        )}

        <Text style={styles.caption}>
          {dailyMode
            ? "One aura pull per day — no rerolls. Streak it or touch grass tomorrow."
            : "Snap it. We freeze the frame and read whatever aura it's giving."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    flex: 1,
    backgroundColor: "#05070c",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  header: {
    gap: 12,
    marginBottom: 14,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  headerNav: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  kicker: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  dailyLink: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(124, 58, 237, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.35)",
  },
  dailyLinkText: {
    color: "#DDD6FE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusDotLive: {
    backgroundColor: "#4ADE80",
  },
  statusDotBusy: {
    backgroundColor: "#C4B5FD",
  },
  statusDotFrozen: {
    backgroundColor: "#94A3B8",
  },
  previewFrame: {
    flex: 1,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "#0B1020",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  // previewImage: {
  //   ...StyleSheet.absoluteFillObject,
  // },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 12, 0.08)",
  },
  cornerTopLeft: {
    position: "absolute",
    top: 18,
    left: 18,
    width: 56,
    height: 56,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: "rgba(255,255,255,0.84)",
    borderTopLeftRadius: 18,
  },
  cornerTopRight: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 56,
    height: 56,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: "rgba(255,255,255,0.84)",
    borderTopRightRadius: 18,
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: 18,
    left: 18,
    width: 56,
    height: 56,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "rgba(255,255,255,0.84)",
    borderBottomLeftRadius: 18,
  },
  cornerBottomRight: {
    position: "absolute",
    bottom: 18,
    right: 18,
    width: 56,
    height: 56,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "rgba(255,255,255,0.84)",
    borderBottomRightRadius: 18,
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  navButtonText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  cameraFlipButton: {
    position: "absolute",
    top: 22,
    right: 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 10, 18, 0.74)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    zIndex: 2,
  },
  cameraFlipButtonPressed: {
    opacity: 0.7,
  },
  cameraFlipButtonDisabled: {
    opacity: 0.45,
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexShrink: 0,
  },
  statusBarPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  statusBarLabel: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "800",
  },
  statusBarDetail: {
    flex: 1,
    color: "#C7D2FE",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  footer: {
    paddingTop: 10,
    gap: 12,
    flexShrink: 0,
  },
  scanButton: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9D5FF",
  },
  scanButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  scanButtonDisabled: {
    opacity: 0.7,
  },
  scanButtonText: {
    color: "#05070C",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  scanButtonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  retakeButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  retakeButtonText: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  analyzeButtonWrap: {
    flex: 1.7,
    height: 72,
    borderRadius: 22,
  },
  analyzeGlow: {
    ...StyleSheet.absoluteFillObject,
    margin: -8,
    borderRadius: 28,
    backgroundColor: "#C4B5FD",
    shadowColor: "#C4B5FD",
    shadowOpacity: 0.9,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  analyzeGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeButtonText: {
    color: "#05070C",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sparkle: {
    position: "absolute",
    color: "#FFFFFF",
    fontSize: 14,
  },
  sparkleTopLeft: {
    top: 10,
    left: 16,
  },
  sparkleBottomRight: {
    bottom: 10,
    right: 16,
  },
  caption: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  permissionCard: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    borderRadius: 28,
    backgroundColor: "rgba(10, 14, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 14,
  },
  brand: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  permissionTitle: {
    color: "#F8FAFC",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  permissionBody: {
    color: "#CBD5E1",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9D5FF",
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#05070C",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryButtonText: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "800",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800",
  },
  stateBody: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
});
