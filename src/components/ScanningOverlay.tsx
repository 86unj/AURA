import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const MESSAGES = [
  "Detecting unresolved childhood decisions...",
  "Calibrating ego output...",
  "Measuring unsolicited opinion radius...",
  "Cross-referencing known red flags...",
  "Consulting the astral spreadsheet...",
  "Scanning for main character syndrome...",
  "Quantifying ambient chaos levels...",
  "Mapping emotional blast radius...",
  "Checking for unread notifications energy...",
  "Estimating WiFi password withholding score...",
];

export function ScanningOverlay() {
  const [containerHeight, setContainerHeight] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const lineY = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  useEffect(() => {
    if (containerHeight === 0) return;
    lineY.value = 0;
    lineY.value = withRepeat(
      withTiming(containerHeight, {
        duration: 2000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [containerHeight, lineY]);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lineY.value }],
    opacity: 0.5 + pulse.value * 0.5,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.7 + pulse.value * 0.6 }],
  }));

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <Animated.View style={[styles.scanLine, lineStyle]} />

      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.dot, dotStyle]} />
        <Text style={styles.title}>READING AURA</Text>
        <Text style={styles.subtitle}>{MESSAGES[msgIndex]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(5, 7, 12, 0.72)",
    overflow: "hidden",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#C4B5FD",
    // soft glow behind the line
    shadowColor: "#C4B5FD",
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#C4B5FD",
    marginBottom: 8,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  subtitle: {
    color: "#C4B5FD",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    opacity: 0.85,
  },
});
