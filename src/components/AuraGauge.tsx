import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";

import { COLORS } from "../theme/game";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type AuraGaugeProps = {
  value: number;
  color: string;
  size?: number;
};

export function AuraGauge({ value, color, size = 190 }: AuraGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const progress = useSharedValue(0);
  const strokeWidth = size < 140 ? 10 : 14;
  const radius = (size - strokeWidth) / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const innerRadius = Math.max(18, radius - (size < 140 ? 16 : 24));
  const needleDotRadius = size < 140 ? 4 : 6;
  const gradientId = `auraGaugeGradient${size}${color.replace("#", "")}`;
  const labelFontSize = size < 140 ? 7 : 10;
  const valueFontSize = size < 140 ? 30 : 48;
  const valueLineHeight = size < 140 ? 34 : 56;
  const rangeFontSize = size < 140 ? 8 : 11;

  useEffect(() => {
    progress.value = withTiming(clampedValue / 100, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedValue, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  // We place the indicator on the circle using polar coordinates: angle -> x/y.
  const angle = -90 + clampedValue * 1.8;
  const needleRadius = radius + 2;
  const needleX = size / 2 + Math.cos((angle * Math.PI) / 180) * needleRadius;
  const needleY = size / 2 + Math.sin((angle * Math.PI) / 180) * needleRadius;

  return (
    <View style={styles.wrapper}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="100%" stopColor="#E8DFFF" stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="rgba(255,255,255,0.03)"
        />
        <Circle
          cx={needleX}
          cy={needleY}
          r={needleDotRadius}
          fill={COLORS.text}
        />
      </Svg>

      <View pointerEvents="none" style={styles.centerCopy}>
        <Text style={[styles.scoreLabel, { fontSize: labelFontSize }]}>
          VIBE SCORE
        </Text>
        <Text
          style={[
            styles.scoreValue,
            { fontSize: valueFontSize, lineHeight: valueLineHeight },
          ]}
        >
          {clampedValue}
        </Text>
        <Text style={[styles.scoreRange, { fontSize: rangeFontSize }]}>
          0-100
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerCopy: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreLabel: {
    color: COLORS.textMuted,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  scoreValue: {
    color: COLORS.text,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 2,
  },
  scoreRange: {
    color: COLORS.textMuted,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
});
