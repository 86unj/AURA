import { useCallback, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
// import ViewShot from "react-native-view-shot";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { AuraGauge } from "../components/AuraGauge";
import { GameButton } from "../components/GameButton";
// import { ShareAuraCard } from "../components/ShareAuraCard";
import { ThreatBadge } from "../components/ThreatBadge";
import { TraitRadar } from "../components/TraitRadar";
import { COLORS, getRarity } from "../theme/game";
// import { useBadgeUnlock } from "../context/BadgeUnlockContext";
// import { useAuth } from "../context/AuthContext";
import { SAMPLE_AURA_REPORT } from "../data/sampleAuraReport";
import { RootStackParamList } from "../navigation/types";
import { deleteReport, hasSaveEndpoint, saveAuraReport } from "../services/auraReports";
// import { evaluateAndUnlockBadges } from "../services/badges";
// import { captureAndShare } from "../services/share";
import { SavedAuraReport } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "AuraReport">;

type FadeSlideInProps = { delay: number; children: React.ReactNode };

function FadeSlideIn({ delay, children }: FadeSlideInProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    const timing = { duration: 450, easing: Easing.out(Easing.cubic) };
    opacity.value = withDelay(delay, withTiming(1, timing));
    translateY.value = withDelay(delay, withTiming(0, timing));
  }, [delay]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
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
  const report = route.params?.report ?? SAMPLE_AURA_REPORT;
  const mode = route.params?.mode ?? "scan";
  const rarity = getRarity(report.vibe_score);
  const auraTint = hexToRgba(report.aura_color, 0.22);
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

  const playSparkle = useCallback(() => {
    setAudioModeAsync({ playsInSilentMode: false })
      .then(() => {
        sparkleTone.seekTo(0);
        sparkleTone.volume = 0.6;
        sparkleTone.play();
      })
      .catch(() => {});
  }, [sparkleTone]);

  useFocusEffect(
    useCallback(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (mode === "scan") {
        playSparkle();
      }
    }, [mode, playSparkle]),
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
      colors={[auraTint, COLORS.bg, COLORS.bg]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.background}
    >
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
              <View
                style={[
                  styles.rarityPill,
                  { backgroundColor: `${rarity.color}1F`, borderColor: `${rarity.color}55` },
                ]}
              >
                <Text style={[styles.rarityPillText, { color: rarity.color }]}>
                  {rarity.label}
                </Text>
              </View>
              <ThreatBadge level={report.threat_level} />
            </View>

            <View style={styles.subjectBlock}>
              <Text style={styles.subjectLabel}>
                {mode === "saved" ? "SAVED REPORT" : "AURA REPORT"}
              </Text>
              <Text style={styles.subjectText}>{report.subject}</Text>
            </View>

            <View style={styles.heroRow}>
              <AuraGauge value={report.vibe_score} color={report.aura_color} />
              <View style={styles.colorBlock}>
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

        <FadeSlideIn delay={120}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>TRAITS</Text>
            <TraitRadar traits={report.traits} color={report.aura_color} />
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={240}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>VERDICT</Text>
            <Text style={styles.bodyText}>{report.verdict}</Text>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={360}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>RECOMMENDATION</Text>
            <Text style={styles.bodyText}>{report.recommendation}</Text>
          </View>
        </FadeSlideIn>

        {canSave ? (
          <FadeSlideIn delay={480}>
            <GameButton
              label={saved ? "Saved to history" : "Save report"}
              onPress={handleSave}
              loading={saving}
              disabled={saved}
            />
          </FadeSlideIn>
        ) : null}

        {canDelete ? (
          <FadeSlideIn delay={480}>
            <GameButton
              label="Delete report"
              onPress={handleDelete}
              variant="danger"
            />
          </FadeSlideIn>
        ) : null}

        {/* <FadeSlideIn delay={600}>
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
  backButton: {
    position: "absolute",
    top: 52,
    left: 20,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 40,
    gap: 14,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 28,
    padding: 20,
    gap: 18,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  rarityPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rarityPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  subjectBlock: {
    gap: 4,
  },
  subjectLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  subjectText: {
    color: COLORS.text,
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
  colorBlock: {
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  colorSwatch: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  colorHex: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  bodyText: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
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
