import { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type ParticleSpec = {
  id: number;
  x: number;
  startY: number;
  travel: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  swayFreq: number;
  swayPhase: number;
  wobbleFreq: number;
  wobbleAmp: number;
  opacity: number;
  tint: "primary" | "secondary" | "soft";
};

type ParticleProps = {
  spec: ParticleSpec;
  height: number;
  color: string;
  secondaryColor: string;
};

function Particle({ spec, height, color, secondaryColor }: ParticleProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: spec.duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [progress, spec.delay, spec.duration]);

  const fill =
    spec.tint === "secondary" ? secondaryColor : spec.tint === "soft" ? "#E9D5FF" : color;

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const y = height * (spec.startY - t * spec.travel);
    const sway =
      Math.sin(t * Math.PI * 2 * spec.swayFreq + spec.swayPhase) * spec.drift +
      Math.sin(t * Math.PI * 2 * spec.wobbleFreq + spec.swayPhase * 1.7) * spec.wobbleAmp;
    const fade =
      t < 0.1 ? t / 0.1 : t > 0.82 ? Math.max(0, (1 - t) / 0.18) : 1;

    return {
      opacity: spec.opacity * fade,
      transform: [{ translateX: spec.x + sway }, { translateY: y }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: fill,
          shadowColor: fill,
        },
        style,
      ]}
    />
  );
}

type Props = {
  /** Primary particle tint (usually the aura color). */
  color: string;
  /** Accent tint for a subset of particles. */
  secondaryColor?: string;
};

/**
 * Soft floating particles for the Aura Lab right pane.
 * Intentionally no pane-fill bloom — the screen backdrop carries the glow.
 */
export function AuraPaneGlow({ color, secondaryColor }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const accent = secondaryColor ?? color;

  const particles = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return [] as ParticleSpec[];
    const count = Math.min(40, Math.max(22, Math.floor((size.width * size.height) / 16000)));
    return Array.from({ length: count }, (_, id) => {
      const roll = Math.random();
      return {
        id,
        x: Math.random() * size.width,
        // Start anywhere from below the fold to mid pane so they don't rise in a row.
        startY: 0.55 + Math.random() * 0.7,
        travel: 0.75 + Math.random() * 0.7,
        size: 1.6 + Math.random() * 3.4,
        duration: 5500 + Math.random() * 11000,
        delay: Math.random() * 6500,
        drift: 14 + Math.random() * 42,
        swayFreq: 0.35 + Math.random() * 1.8,
        swayPhase: Math.random() * Math.PI * 2,
        wobbleFreq: 1.2 + Math.random() * 2.8,
        wobbleAmp: 4 + Math.random() * 16,
        opacity: 0.18 + Math.random() * 0.5,
        tint: (roll > 0.7 ? "secondary" : roll > 0.38 ? "primary" : "soft") as ParticleSpec["tint"],
      };
    });
  }, [size.height, size.width]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    if (width === size.width && height === size.height) return;
    setSize({ width, height });
  }

  return (
    <View pointerEvents="none" onLayout={onLayout} style={styles.fill}>
      {particles.map((spec) => (
        <Particle
          key={spec.id}
          spec={spec}
          height={size.height}
          color={color}
          secondaryColor={accent}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  particle: {
    position: "absolute",
    top: 0,
    left: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
});
