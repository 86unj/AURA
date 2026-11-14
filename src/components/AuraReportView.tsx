import { ReactNode, useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { AuraGauge } from "./AuraGauge";
import { ThreatBadge } from "./ThreatBadge";
import { TraitRadar } from "./TraitRadar";
import { COLORS, getRarity } from "../theme/game";
import { AuraReport } from "../types";

type FadeSlideInProps = { delay: number; children: ReactNode };

export function FadeSlideIn({ delay, children }: FadeSlideInProps) {
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

export function hexToRgba(hexColor: string, alpha: number) {
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

type Props = {
  report: AuraReport;
  mode?: "scan" | "saved";
  /** Top padding of the scroll content (the phone screen needs room for its back button). */
  paddingTop?: number;
  /** Rendered below the cards (save / delete / new scan buttons). */
  children?: ReactNode;
};

/** Scrollable report cards, shared by the phone report screen and Aura Lab. */
export function AuraReportView({ report, mode = "scan", paddingTop = 100, children }: Props) {
  const rarity = getRarity(report.vibe_score);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop }]}
      showsVerticalScrollIndicator={false}
    >
      <FadeSlideIn delay={0}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.subjectLabel}>
              {mode === "saved" ? "SAVED REPORT" : "AURA REPORT"}
            </Text>
            {/* <ThreatBadge level={report.threat_level} /> */}
          </View>

          <View style={styles.subjectBlock}>
            <Text style={styles.subjectText}>{report.subject}</Text>
          </View>

          <View style={styles.heroRow}>
            <AuraGauge value={report.vibe_score} color={report.aura_color} />
            <View
              style={[
                styles.rarityPill,
                { backgroundColor: `${rarity.color}1F`, borderColor: `${rarity.color}55` },
              ]}
            >
              <Text style={[styles.rarityPillText, { color: rarity.color }]}>{rarity.label}</Text>
            </View>

            <View style={styles.colorBlock}>
              <View style={[styles.colorSwatch, { backgroundColor: report.aura_color }]} />
              <Text style={styles.colorHex}>{report.aura_color.toUpperCase()}</Text>
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

      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
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
});
