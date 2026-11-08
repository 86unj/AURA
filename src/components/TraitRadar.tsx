import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon } from "react-native-svg";

import { COLORS } from "../theme/game";
import { AuraTrait } from "../types";

type TraitRadarProps = {
  traits: AuraTrait[];
  color: string;
};

type Point = {
  x: number;
  y: number;
};

const LABEL_HEIGHT = 18;

export function TraitRadar({ traits, color }: TraitRadarProps) {
  const [boxWidth, setBoxWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setBoxWidth((current) => (current === nextWidth ? current : nextWidth));
  }

  const chart = useMemo(() => {
    if (boxWidth <= 0 || traits.length === 0) {
      return null;
    }

    const labelGutter = Math.min(78, Math.max(64, Math.round(boxWidth * 0.24)));
    const verticalGutter = 24;
    const diameter = Math.max(120, boxWidth - labelGutter * 2);
    const radius = diameter / 2;
    const chartHeight = diameter + verticalGutter * 2;
    const centerX = boxWidth / 2;
    const centerY = chartHeight / 2;
    const localCenter = radius;

    const pointsForLevel = (level: number) =>
      traits
        .map((_, index) =>
          polarPoint(index, level * radius, traits.length, localCenter),
        )
        .map(pointToString)
        .join(" ");

    const traitPoints = traits
      .map((trait, index) =>
        polarPoint(
          index,
          (Math.max(0, Math.min(100, trait.value)) / 100) * radius,
          traits.length,
          localCenter,
        ),
      )
      .map(pointToString)
      .join(" ");

    const axisLines = traits.map((_, index) => ({
      key: index,
      end: polarPoint(index, radius, traits.length, localCenter),
    }));

    const labels = traits.map((trait, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / traits.length;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const anchorX = centerX + cos * (radius + 6);
      const anchorY = centerY + sin * (radius + 6);

      let textAlign: "left" | "center" | "right" = "center";
      let left = anchorX - labelGutter / 2;

      if (cos >= 0.35) {
        textAlign = "left";
        left = anchorX;
      } else if (cos <= -0.35) {
        textAlign = "right";
        left = anchorX - labelGutter;
      }

      return {
        key: `${trait.label}-${index}`,
        label: trait.label,
        left: Math.max(0, Math.min(left, boxWidth - labelGutter)),
        top: anchorY - LABEL_HEIGHT / 2,
        width: labelGutter,
        textAlign,
      };
    });

    return {
      chartHeight,
      diameter,
      localCenter,
      svgLeft: centerX - radius,
      svgTop: centerY - radius,
      pointsForLevel,
      traitPoints,
      axisLines,
      labels,
    };
  }, [boxWidth, traits]);

  return (
    <View style={styles.container}>
      <View
        style={[styles.chartWrap, { height: chart?.chartHeight ?? 220 }]}
        onLayout={handleLayout}
      >
        {chart ? (
          <>
            <Svg
              width={chart.diameter}
              height={chart.diameter}
              style={[styles.chart, { left: chart.svgLeft, top: chart.svgTop }]}
            >
              {[0.25, 0.5, 0.75, 1].map((level) => (
                <Polygon
                  key={level}
                  points={chart.pointsForLevel(level)}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                />
              ))}

              {chart.axisLines.map(({ key, end }) => (
                <Line
                  key={key}
                  x1={chart.localCenter}
                  y1={chart.localCenter}
                  x2={end.x}
                  y2={end.y}
                  stroke="rgba(255,255,255,0.10)"
                  strokeWidth={1}
                />
              ))}

              <Polygon
                points={chart.traitPoints}
                fill={`${color}33`}
                stroke={color}
                strokeWidth={2.2}
                strokeLinejoin="round"
              />

              <Circle
                cx={chart.localCenter}
                cy={chart.localCenter}
                r={5}
                fill={color}
              />
            </Svg>

            {chart.labels.map((label) => (
              <Text
                key={label.key}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[
                  styles.axisLabel,
                  {
                    left: label.left,
                    top: label.top,
                    width: label.width,
                    textAlign: label.textAlign,
                  },
                ]}
              >
                {label.label}
              </Text>
            ))}
          </>
        ) : null}
      </View>

      <View style={styles.legend}>
        {traits.map((trait) => (
          <View key={trait.label} style={styles.legendRow}>
            <Text style={styles.legendLabel}>{trait.label}</Text>
            <Text style={styles.legendValue}>{trait.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function polarPoint(
  index: number,
  radius: number,
  total: number,
  center: number,
): Point {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
}

function pointToString(point: Point) {
  return `${point.x},${point.y}`;
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  chartWrap: {
    width: "100%",
  },
  chart: {
    position: "absolute",
  },
  axisLabel: {
    position: "absolute",
    height: LABEL_HEIGHT,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: LABEL_HEIGHT,
    fontWeight: "800",
    includeFontPadding: false,
  },
  legend: {
    gap: 8,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    paddingBottom: 8,
  },
  legendLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  legendValue: {
    color: COLORS.accentMuted,
    fontSize: 13,
    fontWeight: "800",
  },
});
