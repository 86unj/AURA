import { useCallback, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
// import ViewShot from "react-native-view-shot";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AuraGauge } from "../components/AuraGauge";
// import { ShareAuraCard } from "../components/ShareAuraCard";
import { ThreatBadge } from "../components/ThreatBadge";
import { TraitRadar } from "../components/TraitRadar";
// import { useBadgeUnlock } from "../context/BadgeUnlockContext";
// import { useAuth } from "../context/AuthContext";
import { SAMPLE_AURA_REPORT } from "../data/sampleAuraReport";
import { RootStackParamList } from "../navigation/types";
import { deleteReport, hasSaveEndpoint, saveAuraReport } from "../services/auraReports";
// import { evaluateAndUnlockBadges } from "../services/badges";
// import { captureAndShare } from "../services/share";
import { SavedAuraReport } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "AuraReport">;

// Each card fades in and slides up from 24px below its final position.
// delay controls when each card's animation starts (ms after screen focus).
type FadeSlideInProps = { delay: number; children: React.ReactNode };

function FadeSlideIn({ delay, children }: FadeSlideInProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(80);
  const scale = useSharedValue(0.88);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    // Low stiffness + low damping = travels far, bounces slightly before settling
    translateY.value = withDelay(delay, withSpring(0, { damping: 13, stiffness: 60, mass: 1.2 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 13, stiffness: 60, mass: 1.2 }));
  }, [delay]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

function hexToRgba(hexColor: string, alpha: number) {
  const normalized = hexColor.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function AuraReportScreen({ route, navigation }: Props) {
  const { width } = useWindowDimensions();
  const report = route.params?.report ?? SAMPLE_AURA_REPORT;
  const mode = route.params?.mode ?? "scan";
  const chartWidth = Math.max(220, Math.min(320, width - 48));
  const auraTint = hexToRgba(report.aura_color, 0.32);
  const canSave = mode === "scan" && hasSaveEndpoint();
  const reportId = (report as SavedAuraReport).id;
  const canDelete = mode === "saved" && typeof reportId === "string";
  const sparkleTone = useAudioPlayer(require("../../assets/sparkle-tone.wav"));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // const [sharing, setSharing] = useState(false);
  // const shareRef = useRef<ViewShot>(null);
  // const { showUnlocks } = useBadgeUnlock();
  // const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAudioModeAsync({ playsInSilentMode: false })
        .then(() => {
          sparkleTone.seekTo(0);
          sparkleTone.volume = 0.8;
          sparkleTone.play();
        }).catch(() => {});
    }, [sparkleTone]),
  );

  function handleDelete() {
    Alert.alert(
      "Delete report?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteReport(reportId);
              navigation.goBack();
            } catch (error) {
              console.error("Delete failed:", error);
              Alert.alert("Delete failed", "Could not remove this report. Try again.");
            }
          },
        },
      ],
    );
  }

  async function handleSave() {
    if (saving || saved) {
      return;
    }

    setSaving(true);

    try {
      await saveAuraReport(report);
      setSaved(true);
      // const unlocked = await evaluateAndUnlockBadges({
      //   userId: user?.id,
      //   report,
      //   scanTimestamp: new Date(),
      // });
      // if (unlocked.length > 0) {
      //   showUnlocks(unlocked);
      // }
    } catch (error) {
      console.error("Save aura report failed:", error);
      Alert.alert(
        "Save failed",
        "This aura report could not be saved. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  }

  // async function handleShare() {
  //   if (sharing) {
  //     return;
  //   }
  //
  //   setSharing(true);
  //   try {
  //     await captureAndShare(shareRef, "Send this diagnosis to the group chat");
  //     await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  //   } catch (error) {
  //     console.warn("Aura share failed:", error);
  //     Alert.alert("Share failed", "The aura refused to leave the building. Try again.");
  //   } finally {
  //     setSharing(false);
  //   }
  // }

  return (
    <LinearGradient
      colors={[auraTint, "#090D16", "#05070C"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.background}
    >
      <View style={[styles.topGlow, { backgroundColor: report.aura_color }]} />
      <View style={styles.bottomGlow} />

      <Pressable
        style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <FadeSlideIn delay={0}>
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.kickerPill}>
                <Text style={styles.kickerText}>
                  {mode === "saved" ? "SAVED AURA" : "AURA SCAN"}
                </Text>
              </View>
              <ThreatBadge level={report.threat_level} />
            </View>

            <Text style={styles.subjectLabel}>SUBJECT</Text>
            <Text style={styles.subjectText}>{report.subject}</Text>

            <View style={styles.heroRow}>
              <View style={styles.scoreBlock}>
                <AuraGauge value={report.vibe_score} color={report.aura_color} />
              </View>
              <View style={styles.colorCard}>
                <Text style={styles.colorLabel}>AURA COLOR</Text>
                <View
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: report.aura_color },
                  ]}
                />
                <Text style={styles.colorHex}>
                  {report.aura_color.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={300}>
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>TRAIT RADAR</Text>
              <Text style={styles.sectionNote}>Five-point diagnostic sweep</Text>
            </View>
            <TraitRadar
              traits={report.traits}
              color={report.aura_color}
              size={chartWidth}
            />
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={600}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>VERDICT</Text>
            <Text style={styles.bodyText}>{report.verdict}</Text>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={900}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>RECOMMENDATION</Text>
            <Text style={styles.bodyText}>{report.recommendation}</Text>
          </View>
        </FadeSlideIn>

        {canSave ? (
          <FadeSlideIn delay={1100}>
            <TouchableOpacity
              style={[styles.saveButton, saved && styles.saveButtonSaved]}
              onPress={handleSave}
              disabled={saving || saved}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#05070C" />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    saved && styles.saveButtonTextSaved,
                  ]}
                >
                  {saved ? "Saved to history" : "Save aura"}
                </Text>
              )}
            </TouchableOpacity>
          </FadeSlideIn>
        ) : null}

        {canDelete ? (
          <FadeSlideIn delay={1100}>
            <Pressable
              style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
              onPress={handleDelete}
            >
              <Text style={styles.deleteButtonText}>Delete report</Text>
            </Pressable>
          </FadeSlideIn>
        ) : null}

        {/* <FadeSlideIn delay={1200}>
          <Pressable
            style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
            onPress={() => void handleShare()}
            disabled={sharing}
          >
            {sharing ? (
              <ActivityIndicator color="#E9D5FF" />
            ) : (
              <Text style={styles.shareButtonText}>Leak to group chat</Text>
            )}
          </Pressable>
        </FadeSlideIn> */}
      </ScrollView>

      {/* <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={shareRef} options={{ format: "png", quality: 1 }}>
          <ShareAuraCard report={report} />
        </ViewShot>
      </View> */}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  topGlow: {
    position: "absolute",
    top: -120,
    right: -100,
    width: 260,
    height: 260,
    borderRadius: 260,
    opacity: 0.18,
  },
  bottomGlow: {
    position: "absolute",
    bottom: -140,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(123, 108, 246, 0.10)",
    opacity: 0.8,
  },
  backButton: {
    position: "absolute",
    top: 52,
    left: 20,
    zIndex: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backButtonText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    backgroundColor: "rgba(10, 14, 26, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 28,
    padding: 18,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kickerPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  kickerText: {
    color: "#C7D2FE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  subjectLabel: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
  },
  subjectText: {
    color: "#F8FAFC",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  scoreBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  colorCard: {
    width: 104,
    alignSelf: "stretch",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  colorLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textAlign: "center",
  },
  colorSwatch: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  colorHex: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  sectionCard: {
    backgroundColor: "rgba(10, 14, 26, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 24,
    padding: 18,
    gap: 16,
  },
  sectionTitleRow: {
    gap: 4,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sectionNote: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
    fontWeight: "600",
  },
  bodyText: {
    color: "#E2E8F0",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  saveButton: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9D5FF",
  },
  saveButtonSaved: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  saveButtonText: {
    color: "#05070C",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  saveButtonTextSaved: {
    color: "#E9D5FF",
  },
  deleteButton: {
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.30)",
  },
  deleteButtonPressed: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  // shareButton: {
  //   height: 50,
  //   borderRadius: 18,
  //   alignItems: "center",
  //   justifyContent: "center",
  //   backgroundColor: "rgba(123, 108, 246, 0.18)",
  //   borderWidth: 1,
  //   borderColor: "rgba(196, 181, 253, 0.35)",
  // },
  // shareButtonPressed: {
  //   opacity: 0.75,
  // },
  // shareButtonText: {
  //   color: "#E9D5FF",
  //   fontSize: 14,
  //   fontWeight: "800",
  //   letterSpacing: 1.2,
  // },
  // offscreen: {
  //   position: "absolute",
  //   left: -9999,
  //   top: 0,
  // },
});
