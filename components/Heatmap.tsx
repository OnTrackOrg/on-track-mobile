import React, { useRef, useEffect, useMemo } from "react";
import { View, ScrollView, Text } from "react-native";
import Svg, { Rect, Circle, Text as SvgText } from "react-native-svg";
import { addDays, format, subDays, startOfWeek } from "date-fns";
import { useTheme } from "../contexts/ThemeContext";

interface HMProps {
  startOffsetDays?: number; // how many days back to show
  values: Record<string, number>; // yyyy-MM-dd -> count
  referenceDate?: Date;
  valueMode?: "count" | "ratio";
  frozenDateKeys?: Set<string>; // yyyy-MM-dd keys for frozen days
}

export const getHeatmapInitialScrollX = ({
  days,
  referenceDateKey,
  cell,
  gap,
  trailingColumns = 4,
}: {
  days: string[];
  referenceDateKey: string;
  cell: number;
  gap: number;
  trailingColumns?: number;
}) => {
  const focusIndex = days.indexOf(referenceDateKey);

  if (focusIndex === -1) {
    return null;
  }

  const focusColumn = Math.floor(focusIndex / 7);
  return Math.max(0, (focusColumn - trailingColumns) * (cell + gap));
};

export default function Heatmap({
  startOffsetDays = 120,
  values,
  referenceDate = new Date(),
  valueMode = "count",
  frozenDateKeys,
}: HMProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const { theme, isDark } = useTheme();
  const focusDate = referenceDate;
  const today = useMemo(() => new Date(), []);

  // Calculate start date and adjust to the previous Sunday to ensure Sunday is always top row
  const roughStart = subDays(today, startOffsetDays);
  const start = startOfWeek(roughStart, { weekStartsOn: 0 }); // 0 = Sunday

  const days = useMemo(() => {
    const dayKeys: string[] = [];

    for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
      dayKeys.push(format(d, "yyyy-MM-dd"));
    }

    return dayKeys;
  }, [start, today]);

  const cols = Math.ceil(days.length / 7);
  const cell = 14;
  const gap = 2;
  const dayLabelWidth = 20;
  const width = cols * (cell + gap) + gap;
  const height = 7 * (cell + gap) + gap;
  const monthLabelHeight = 20;
  const focusDateKey = format(focusDate, "yyyy-MM-dd");

  useEffect(() => {
    const timer = setTimeout(() => {
      const targetX = getHeatmapInitialScrollX({
        days,
        referenceDateKey: focusDateKey,
        cell,
        gap,
      });

      if (targetX === null) {
        scrollViewRef.current?.scrollToEnd({ animated: false });
        return;
      }

      scrollViewRef.current?.scrollTo({ x: targetX, animated: false });
    }, 100);

    return () => clearTimeout(timer);
  }, [cell, days, focusDateKey, gap]);

  // Day labels (S, M, T, W, T, F, S)
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  // Calculate month boundaries
  const monthPositions: { month: string; x: number }[] = [];
  let currentMonth = "";

  days.forEach((d, i) => {
    const date = new Date(d);
    const monthYear = format(date, "MMM");
    const col = Math.floor(i / 7);

    if (monthYear !== currentMonth) {
      currentMonth = monthYear;
      const x = gap + col * (cell + gap);
      monthPositions.push({ month: monthYear, x });
    }
  });

  const scale = (n: number) => {
    if (n <= 0) return theme.border;

    if (valueMode === "ratio") {
      const normalized = Math.max(0, Math.min(n, 1));
      if (normalized < 0.25) return "#d8f5df";
      if (normalized < 0.5) return "#a6e3b5";
      if (normalized < 0.75) return "#63c97c";
      if (normalized < 1) return "#2ea85a";
      return "#1f7a3f";
    }

    return "#2aed72ff";
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 10,
        padding: 8,
      }}
    >
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "flex-start" }}
      >
        <View style={{ flexDirection: "row" }}>
          {/* Day labels column */}
          <View style={{ width: dayLabelWidth, marginRight: 4 }}>
            {/* Spacer for month labels */}
            <View style={{ height: monthLabelHeight + 4 }} />
            {/* Day labels */}
            {dayLabels.map((day, index) => (
              <View
                key={day + index}
                style={{
                  height: cell + gap,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    color: theme.textSecondary,
                    fontWeight: "500",
                  }}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Heatmap content */}
          <View>
            {/* Month labels */}
            <View
              style={{
                height: monthLabelHeight,
                position: "relative",
                marginBottom: 4,
              }}
            >
              {monthPositions.map((pos, index) => (
                <Text
                  key={`${pos.month}-${index}`}
                  style={{
                    position: "absolute",
                    left: pos.x,
                    fontSize: 10,
                    color: theme.textSecondary,
                    fontWeight: "500",
                  }}
                >
                  {pos.month}
                </Text>
              ))}
            </View>

            {/* Heatmap grid */}
            <Svg width={width} height={height}>
              {days.map((d, i) => {
                const col = Math.floor(i / 7);
                const row = i % 7;
                const x = gap + col * (cell + gap);
                const y = gap + row * (cell + gap);
                const n = values[d] || 0;
                const isFocusDate = d === focusDateKey;

                const isFrozen = frozenDateKeys ? frozenDateKeys.has(d) : false;

                return (
                  <React.Fragment key={d}>
                    <Rect
                      x={x}
                      y={y}
                      width={cell}
                      height={cell}
                      rx={3}
                      fill={
                        isFrozen ? (isDark ? "#1e3a5f" : "#bfdbfe") : scale(n)
                      }
                      stroke={
                        isFocusDate
                          ? theme.primary
                          : isFrozen
                            ? isDark
                              ? "#60a5fa"
                              : "#60a5fa"
                            : "transparent"
                      }
                      strokeWidth={isFocusDate ? 2 : isFrozen ? 1 : 0}
                    />
                    {isFocusDate && !isFrozen && (
                      <Circle
                        cx={x + cell / 2}
                        cy={y + cell / 2}
                        r={2}
                        fill={theme.primary}
                      />
                    )}
                    {isFrozen && (
                      <SvgText
                        x={x + cell / 2}
                        y={y + cell / 2 + 4}
                        fontSize={9}
                        textAnchor="middle"
                        fill={isDark ? "#93c5fd" : "#1d4ed8"}
                      >
                        ❄
                      </SvgText>
                    )}
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
