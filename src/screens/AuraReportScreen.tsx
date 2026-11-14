import { useCallback, useState } from "react";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
// import ViewShot from "react-native-view-shot";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AuraReportView, FadeSlideIn, hexToRgba } from "../components/AuraReportView";
import { GameButton } from "../components/GameButton";
// import { ShareAuraCard } from "../components/ShareAuraCard";
import { COLORS } from "../theme/game";
// import { useBadgeUnlock } from "../context/BadgeUnlockContext";
// import { useAuth } from "../context/AuthContext";
import { SAMPLE_AURA_REPORT } from "../data/sampleAuraReport";
import { RootStackParamList } from "../navigation/types";
import { deleteReport, hasSaveEndpoint, saveAuraReport } from "../services/auraReports";
// import { evaluateAndUnlockBadges } from "../services/badges";
// import { captureAndShare } from "../services/share";
import { SavedAuraReport } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "AuraReport">;

export function AuraReportScreen({ route, navigation }: Props) {
  const report = route.params?.report ?? SAMPLE_AURA_REPORT;
  const mode = route.params?.mode ?? "scan";
  const auraTint = hexToRgba(report.aura_color, 0.22);
  const canSave = mode === "scan" && hasSaveEndpoint();
  const reportId = (report as SavedAuraReport).id;
  const canDelete = mode === "saved" && typeof reportId === "string";
  const sparkleTone = useAudioPlayer(require("../../assets/sparkle-tone.wav"));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

      <AuraReportView report={report} mode={mode}>
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
            <GameButton label="Delete report" onPress={handleDelete} variant="danger" />
          </FadeSlideIn>
        ) : null}
      </AuraReportView>
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
});
