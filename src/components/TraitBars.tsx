import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "../theme/game";
import { AuraTrait } from "../types";

type TraitBarProps = {
  trait: AuraTrait;
  index: number;
  startDelay: number;
  color: string;
};

function TraitBar({ trait, index, startDelay, color }: TraitBarProps) {
  const fill = useSharedValue(0);
  const value = Math.max(0, Math.min(100, Math.round(trait.value)));

  useEffect(() => {
    fill.value = withDelay(
      startDelay + index * 80,
      withTiming(value, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );
  }, [fill, index, startDelay, value]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, fill.value)}%`,
  }));

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{trait.label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      </View>
    </View>
  );
}

type TraitBarsProps = {
  traits: AuraTrait[];
  startDelay?: number;
  color?: string;
};

export function TraitBars({ traits, startDelay = 0, color = COLORS.accentMuted }: TraitBarsProps) {
  return (
    <View style={styles.list}>
      {traits.map((trait, index) => (
        <TraitBar
          key={`${trait.label}-${index}`}
          trait={trait}
          index={index}
          startDelay={startDelay}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 14,
  },
  row: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceRaised,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
});
