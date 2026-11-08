import { StyleSheet, Text, View } from "react-native";

import { ThreatLevel } from "../types";

const THREAT_STYLES: Record<ThreatLevel, { label: string; color: string }> = {
  low: { label: "Low threat", color: "#5EEAD4" },
  moderate: { label: "Moderate threat", color: "#FDE68A" },
  elevated: { label: "Elevated threat", color: "#FDBA74" },
  cosmic: { label: "Cosmic threat", color: "#F9A8D4" },
};

type ThreatBadgeProps = {
  level: ThreatLevel;
};

export function ThreatBadge({ level }: ThreatBadgeProps) {
  const style = THREAT_STYLES[level];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: `${style.color}1F`, borderColor: `${style.color}55` },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: style.color }]} />
      <Text style={[styles.label, { color: style.color }]}>{style.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
