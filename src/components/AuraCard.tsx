import { useEffect, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { hexToRgba } from "./AuraReportView";
import { COLORS, Rarity, getRarity } from "../theme/game";
import { AuraReport, AuraTrait } from "../types";

type GradientColors = readonly [string, string, ...string[]];

/** Foil border colors per rarity tier. Edit these to restyle each tier. */
const FOIL: Record<Rarity["key"], GradientColors> = {
  common: ["#E2E8F0", "#64748B", "#CBD5E1", "#475569"],
  rare: ["#BFDBFE", "#3B82F6", "#93C5FD", "#1E3A8A"],
  epic: ["#F5EBFF", "#7C3AED", "#C4B5FD", "#4C1D95"],
  legendary: ["#FEF3C7", "#F59E0B", "#FDE68A", "#92400E"],
  mythic: ["#FDE68A", "#F9A8D4", "#93C5FD", "#C4B5FD", "#F9A8D4"],
};

/** How strong the moving shine is per tier (0 = none). */
const SHEEN_OPACITY: Record<Rarity["key"], number> = {
  common: 0.08,
  rare: 0.14,
  epic: 0.2,
  legendary: 0.28,
  mythic: 0.36,
};

const SERIF = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, 'Times New Roman', serif",
});

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatCardDate(input: string | Date | undefined) {
  const date = input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Stable 4-digit number from the subject, used when no serial is passed. */
function serialFromText(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 10000;
  }
  return String(hash).padStart(4, "0");
}

function useCountUp(target: number, delayMs: number, durationMs = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    let start: number | null = null;
    const timeout = setTimeout(() => {
      const step = (now: number) => {
        if (start === null) start = now;
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(target * eased));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [target, delayMs, durationMs]);

  return value;
}

type MiniBarProps = {
  trait: AuraTrait;
  color: string;
  delay: number;
};

function MiniBar({ trait, color, delay }: MiniBarProps) {
  const value = Math.max(0, Math.min(100, Math.round(trait.value)));
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withDelay(
      delay,
      withTiming(value, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, fill, value]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));

  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>
        {trait.label.toUpperCase()}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { backgroundColor: color }, fillStyle]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

function OrbPlaceholder({ color, id }: { color: string; id: string }) {
  return (
    <View style={styles.orbPlaceholder}>
      <Svg width={180} height={180}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="25%" stopColor={color} stopOpacity={0.95} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={90} cy={90} r={90} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Strongest traits first, so the card shows the ones that define the aura. */
function topTraits(traits: AuraTrait[], count: number) {
  return [...traits].sort((a, b) => b.value - a.value).slice(0, count);
}

/** Long subjects get smaller type so they still fit in three lines. */
function subjectFontSize(subject: string) {
  if (subject.length > 48) return 21;
  if (subject.length > 28) return 25;
  return 30;
}

type Props = {
  report: AuraReport;
  /** Captured photo. Without it the card shows a glowing aura orb. */
  photoUri?: string | null;
  /** How many traits to show (strongest first). The full set stays in the report data. */
  maxTraits?: number;
  /** Card number shown in the header. Defaults to a number derived from the subject. */
  serial?: string | number;
  /** Date shown in the header. Defaults to today. */
  date?: string | Date;
  /** Play the flip-in, count-up and bar animations. */
  animate?: boolean;
  /** Show the recommendation line at the bottom. */
  showRecommendation?: boolean;
};

/**
 * Collectible trading-card version of an aura report.
 * Self-contained: not wired into any screen yet.
 */
export function AuraCard({
  report,
  photoUri,
  maxTraits = 3,
  serial,
  date,
  animate = true,
  showRecommendation = true,
}: Props) {
  const rarity = getRarity(report.vibe_score);
  const foil = FOIL[rarity.key];
  const sheenOpacity = SHEEN_OPACITY[rarity.key];
  const idSuffix = report.aura_color.replace("#", "");
  const serialText = String(serial ?? serialFromText(report.subject)).padStart(4, "0");
  const barColors = [report.aura_color, rarity.color, COLORS.accentMuted];
  const traits = topTraits(report.traits, maxTraits);
  const subjectSize = subjectFontSize(report.subject);

  const score = useCountUp(Math.round(report.vibe_score), animate ? 350 : 0, animate ? 900 : 1);

  const [cardWidth, setCardWidth] = useState(320);
  const enter = useSharedValue(animate ? 0 : 1);
  const sheen = useSharedValue(0);

  useEffect(() => {
    if (animate) {
      enter.value = 0;
      enter.value = withSpring(1, { damping: 14, stiffness: 90, mass: 0.9 });
    }
  }, [animate, enter]);

  useEffect(() => {
    if (sheenOpacity === 0) return;
    sheen.value = withRepeat(
      withSequence(
        withDelay(900, withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) })),
        withDelay(2200, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [sheen, sheenOpacity]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.6),
    transform: [
      { perspective: 900 },
      { rotateY: `${(1 - enter.value) * -28}deg` },
      { scale: 0.9 + enter.value * 0.1 },
    ],
  }));

  const sheenWidth = cardWidth * 0.55;
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -sheenWidth * 1.5 + sheen.value * (cardWidth + sheenWidth * 3) },
      { rotate: "18deg" },
    ],
  }));

  function handleLayout(event: LayoutChangeEvent) {
    setCardWidth(event.nativeEvent.layout.width);
  }

  // Plain View when not animating — Reanimated perspective/transform breaks
  // html-to-image (SVG foreignObject) and produces solid blank PNGs.
  const Root = animate ? Animated.View : View;

  return (
    <Root style={[styles.wrap, animate ? enterStyle : null]} onLayout={handleLayout}>
      {/* Outer glow in the aura color */}
      <View
        pointerEvents="none"
        style={[styles.glow, { shadowColor: report.aura_color, backgroundColor: hexToRgba(report.aura_color, 0.12) }]}
      />

      <LinearGradient colors={foil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.foil}>
        <LinearGradient
          colors={[hexToRgba(report.aura_color, 0.38), "#0F0A18", "#09070F"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.inner}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.kicker, { color: rarity.color }]}>
              ✦ {rarity.label.toUpperCase()} · No. {serialText}
            </Text>
            <Text style={styles.kickerMuted}>{formatCardDate(date)}</Text>
          </View>

          {/* Photo or orb */}
          <View style={[styles.photoFrame, { borderColor: hexToRgba(rarity.color, 0.45) }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <OrbPlaceholder color={report.aura_color} id={`cardOrb${idSuffix}`} />
            )}

            {/* Nameplate: subject sits on the photo, over a dark fade, like a card name. */}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(9,7,15,0)", "rgba(9,7,15,0.72)", "rgba(9,7,15,0.94)"]}
              locations={[0, 0.5, 1]}
              style={styles.nameplate}
            >
              <View style={[styles.nameAccent, { backgroundColor: rarity.color }]} />
              <Text
                style={[
                  styles.subject,
                  {
                    fontSize: subjectSize,
                    lineHeight: subjectSize * 1.08,
                    textShadowColor: hexToRgba(report.aura_color, 0.9),
                  },
                ]}
                numberOfLines={3}
              >
                {report.subject}
              </Text>
            </LinearGradient>
          </View>

          {/* Score + strongest traits side by side */}
          <View style={styles.statsRow}>
            <View style={styles.scoreBlock}>
              <Text style={styles.score}>{score}</Text>
              <Text style={styles.scoreLabel}>VIBE SCORE</Text>
            </View>
            <View style={styles.bars}>
              {traits.map((trait, index) => (
                <MiniBar
                  key={`${trait.label}-${index}`}
                  trait={trait}
                  color={barColors[index % barColors.length]}
                  delay={animate ? 500 + index * 90 : 0}
                />
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Verdict */}
          <Text style={styles.verdict}>“{report.verdict}”</Text>

          {showRecommendation ? (
            <View style={styles.recoBlock}>
              <Text style={styles.kickerMuted}>PRESCRIPTION</Text>
              <Text style={styles.reco}>{report.recommendation}</Text>
            </View>
          ) : null}

          {/* Footer */}
          <View style={styles.footerRow}>
            <Text style={styles.wordmark}>AURA</Text>
            <View style={styles.hexChip}>
              <View style={[styles.hexDot, { backgroundColor: report.aura_color }]} />
              <Text style={styles.hexText}>{report.aura_color.toUpperCase()}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Moving foil shine (skip animated sheen during static capture). */}
        {animate && sheenOpacity > 0 ? (
          <View pointerEvents="none" style={styles.sheenClip}>
            <Animated.View style={[styles.sheen, { width: sheenWidth, opacity: sheenOpacity }, sheenStyle]}>
              <LinearGradient
                colors={["rgba(255,255,255,0)", "#FFFFFF", "rgba(255,255,255,0)"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        ) : null}
      </LinearGradient>
    </Root>
  );
}

const RADIUS = 26;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
  },
  glow: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  foil: {
    borderRadius: RADIUS,
    padding: 3,
    overflow: "hidden",
  },
  inner: {
    borderRadius: RADIUS - 3,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  kickerMuted: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  photoFrame: {
    height: 260,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  orbPlaceholder: {
    flex: 1,
    paddingBottom: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  nameplate: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 56,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  nameAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
  },
  subject: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: -0.8,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  scoreBlock: {
    alignItems: "flex-start",
  },
  score: {
    color: COLORS.text,
    fontSize: 64,
    lineHeight: 66,
    fontWeight: "900",
    letterSpacing: -4,
    fontVariant: ["tabular-nums"],
  },
  scoreLabel: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2.4,
    marginTop: 2,
  },
  bars: {
    flex: 1,
    gap: 9,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  barLabel: {
    width: 74,
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  barValue: {
    width: 22,
    textAlign: "right",
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  verdict: {
    color: COLORS.accent,
    fontFamily: SERIF,
    fontStyle: "italic",
    fontSize: 16,
    lineHeight: 22,
  },
  recoBlock: {
    gap: 4,
  },
  reco: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  wordmark: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 6,
  },
  hexChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hexDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  hexText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  sheenClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS,
    overflow: "hidden",
  },
  sheen: {
    position: "absolute",
    top: -80,
    bottom: -80,
  },
});
