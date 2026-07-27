import React, { useRef, useEffect, useMemo } from "react";
import { View, ScrollView, Text } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import {
  addDays,
  differenceInCalendarDays,
  format,
  subDays,
  startOfWeek,
} from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { mix, withAlpha } from "../utils/color";

interface HMProps {
  startOffsetDays?: number; // how many days back to show (fallback window)
  // "yyyy-MM-dd" the goal's history starts on. When set, the grid reaches
  // back to this day (however long ago), instead of a fixed window.
  historyStartDay?: string;
  values: Record<string, number>; // yyyy-MM-dd -> count
  referenceDate?: Date;
  valueMode?: "count" | "ratio";
  color?: string; // accent for filled cells; defaults to the legacy greens
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

function Heatmap({
  startOffsetDays = 120,
  historyStartDay,
  values,
  referenceDate = new Date(),
  valueMode = "count",
  color,
}: HMProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const { theme } = useTheme();
  const focusDate = referenceDate;
  const today = useMemo(() => new Date(), []);

  // The grid reaches back to the goal's start day (scrollable all the way),
  // with a minimum window so young goals still show some context. Snap to
  // the previous Sunday so Sunday is always the top row.
  const offsetDays = useMemo(() => {
    if (!historyStartDay) {
      return startOffsetDays;
    }
    const [year, month, day] = historyStartDay.split("-").map(Number);
    const historyStart = new Date(year, month - 1, day);
    return Math.max(
      startOffsetDays,
      differenceInCalendarDays(today, historyStart),
    );
  }, [historyStartDay, startOffsetDays, today]);

  // Built in one memo so `days` is referentially stable across re-renders;
  // a fresh array here would re-fire the autoscroll effect and yank the
  // user back while they are scrolling through history.
  const days = useMemo(() => {
    const roughStart = subDays(today, offsetDays);
    const start = startOfWeek(roughStart, { weekStartsOn: 0 }); // 0 = Sunday
    const dayKeys: string[] = [];

    for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
      dayKeys.push(format(d, "yyyy-MM-dd"));
    }

    return dayKeys;
  }, [offsetDays, today]);

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

  // Calculate month boundaries. Long histories get "Mon 'YY" labels so
  // scrolling years back stays legible.
  const showYears = days.length > 370;
  const monthPositions: { month: string; x: number }[] = [];
  let currentMonth = "";

  days.forEach((d, i) => {
    const date = new Date(d);
    const monthYear = format(date, showYears ? "MMM ''yy" : "MMM");
    const col = Math.floor(i / 7);

    if (monthYear !== currentMonth) {
      currentMonth = monthYear;
      const x = gap + col * (cell + gap);
      const previous = monthPositions[monthPositions.length - 1];
      // A month that starts in the grid's first column can leave the
      // previous label less than a column of room — drop the cramped one.
      if (previous && x - previous.x < 30) {
        monthPositions.pop();
      }
      monthPositions.push({ month: monthYear, x });
    }
  });

  const scale = (n: number) => {
    if (n <= 0) return theme.border;

    // Goal-accent scale from the redesign: blend the accent into the surface
    // by intensity.
    if (color) {
      const normalized =
        valueMode === "ratio" ? Math.max(0, Math.min(n, 1)) : 1;
      return mix(color, 0.25 + normalized * 0.75, theme.surface);
    }

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
                // Week-alignment padding before the goal existed.
                const preHistory =
                  historyStartDay !== undefined && d < historyStartDay;

                return (
                  <React.Fragment key={d}>
                    <Rect
                      x={x}
                      y={y}
                      width={cell}
                      height={cell}
                      rx={3}
                      fill={
                        // Backfilled completions stay visible even before
                        // the goal's official start day.
                        preHistory && n <= 0
                          ? withAlpha(theme.border, 0.35)
                          : scale(n)
                      }
                      stroke={isFocusDate ? theme.primary : "transparent"}
                      strokeWidth={isFocusDate ? 2 : 0}
                    />
                    {isFocusDate && (
                      <Circle
                        cx={x + cell / 2}
                        cy={y + cell / 2}
                        r={2}
                        fill={theme.primary}
                      />
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

// ~1000+ SVG cells for long histories: skip re-renders when inputs match.
export default React.memo(Heatmap);
