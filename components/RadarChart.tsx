import React from "react";
import { View, Text } from "react-native";
import Svg, { Polygon, Line, Circle, Text as SvgText } from "react-native-svg";
import { Goal, Task } from "../types";
import {
  endOfDay,
  isAfter,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  differenceInCalendarDays,
} from "date-fns";
import { useTheme } from "../contexts/ThemeContext";
import { getCustomFrequencyProgress } from "../store";

export type RadarChartMode = "current" | "trend";

interface RadarChartProps {
  goals: Goal[];
  size?: number;
  referenceDate?: Date;
  mode?: RadarChartMode;
  emptyTitle?: string;
  emptyHelperText?: string;
}

const CHART_TITLE = "Goal Radar";

export const getCurrentModeTaskScore = (
  task: Task,
  completionsThroughReferenceDate: Date[],
  normalizedReferenceDate: Date,
): number => {
  const weekStart = startOfWeek(normalizedReferenceDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(normalizedReferenceDate, { weekStartsOn: 0 });
  const completionsThisWeek = completionsThroughReferenceDate.filter(
    (completionDate) =>
      isWithinInterval(completionDate, { start: weekStart, end: weekEnd }),
  ).length;

  if (task.frequency === "daily") {
    return Math.min(1, completionsThisWeek / 7);
  }

  if (task.frequency === "weekly") {
    return Math.min(1, completionsThisWeek);
  }

  const progress = getCustomFrequencyProgress(task, normalizedReferenceDate);
  return progress.target > 0
    ? Math.min(1, progress.completed / progress.target)
    : 0;
};

export const getDailyTrendScore = (
  completionDates: Date[],
  startDate: Date,
  referenceDate: Date,
) => {
  const days = Math.max(
    1,
    differenceInCalendarDays(referenceDate, startDate) + 1,
  );
  return Math.min(1, completionDates.length / days);
};

export const getWeeklyTrendScore = (
  completionDates: Date[],
  startDate: Date,
  referenceDate: Date,
) => {
  const days = Math.max(
    1,
    differenceInCalendarDays(referenceDate, startDate) + 1,
  );
  const expectedWeeks = Math.max(1, Math.ceil(days / 7));
  return Math.min(1, completionDates.length / expectedWeeks);
};

export const getCustomTrendScore = (
  completionDates: Date[],
  target: number,
  periodType: "weekly" | "monthly",
  startDate: Date,
  referenceDate: Date,
) => {
  if (target <= 0) return 0;

  const days = Math.max(
    1,
    differenceInCalendarDays(referenceDate, startDate) + 1,
  );
  const expectedPeriods =
    periodType === "weekly"
      ? Math.max(1, Math.ceil(days / 7))
      : Math.max(1, Math.ceil(days / 30));

  return Math.min(1, completionDates.length / (target * expectedPeriods));
};

export default function RadarChart({
  goals,
  size = 200,
  referenceDate = new Date(),
  mode = "current",
  emptyTitle,
  emptyHelperText,
}: RadarChartProps) {
  const { theme, isDark } = useTheme();

  const renderChartContainer = (children: React.ReactNode) => (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 10,
        padding: 16,
        backgroundColor: theme.surface,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          marginBottom: 12,
          color: theme.text,
        }}
      >
        {CHART_TITLE}
      </Text>

      {children}
    </View>
  );

  const renderEmptyChart = (message: string, helperText: string) =>
    renderChartContainer(
      <View
        style={{
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
          {message}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          {helperText}
        </Text>
      </View>,
    );

  if (goals.length === 0) {
    return renderEmptyChart(
      emptyTitle ?? "No goals yet",
      emptyHelperText ?? "Create goals to see radar chart",
    );
  }

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 20; // Reduced margin since no labels

  // Color palette for different goals
  const colors = [
    "#3b82f6", // Blue
    "#10b981", // Green
    "#f59e0b", // Orange
    "#ef4444", // Red
    "#8b5cf6", // Purple
    "#06b6d4", // Cyan
    "#84cc16", // Lime
    "#f97316", // Orange-red
  ];

  const normalizedReferenceDate = endOfDay(referenceDate);

  const goalData = goals
    .map((goal) => {
      const recurringTasks = goal.tasks.filter(
        (task) => task.frequency !== "once",
      );

      const allCompletionDates = recurringTasks.flatMap((task) =>
        task.completions.filter(
          (completionDate) => !isAfter(completionDate, normalizedReferenceDate),
        ),
      );

      const firstCompletionDate =
        allCompletionDates.length > 0
          ? new Date(
              Math.min(
                ...allCompletionDates.map((completionDate) =>
                  completionDate.getTime(),
                ),
              ),
            )
          : null;

      if (!firstCompletionDate) {
        return null;
      }

      if (recurringTasks.length === 0) {
        return { title: goal.title, percentage: 0 };
      }

      const taskScores = recurringTasks.map((task) => {
        const completionsThroughReferenceDate = task.completions.filter(
          (completionDate) => !isAfter(completionDate, normalizedReferenceDate),
        );

        if (completionsThroughReferenceDate.length === 0) {
          return 0;
        }

        if (mode === "current") {
          return getCurrentModeTaskScore(
            task,
            completionsThroughReferenceDate,
            normalizedReferenceDate,
          );
        }

        if (task.frequency === "daily") {
          return getDailyTrendScore(
            completionsThroughReferenceDate,
            firstCompletionDate,
            normalizedReferenceDate,
          );
        }

        if (task.frequency === "weekly") {
          return getWeeklyTrendScore(
            completionsThroughReferenceDate,
            firstCompletionDate,
            normalizedReferenceDate,
          );
        }

        if (task.customFrequency) {
          return getCustomTrendScore(
            completionsThroughReferenceDate,
            task.customFrequency.target,
            task.customFrequency.type,
            firstCompletionDate,
            normalizedReferenceDate,
          );
        }

        return 0;
      });

      const percentage =
        taskScores.reduce((sum, score) => sum + score, 0) /
        recurringTasks.length;
      return { title: goal.title, percentage };
    })
    .filter(
      (goal): goal is { title: string; percentage: number } => goal !== null,
    );

  if (goalData.length === 0) {
    return renderEmptyChart(
      "No goals for this date",
      "Try a later date to see the radar chart",
    );
  }

  const angleStep = (2 * Math.PI) / goalData.length;

  // Generate points for the data polygon
  const dataPoints = goalData.map((data, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    const distance = data.percentage * radius;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    return { x, y, angle, distance, ...data };
  });

  // Generate grid circles (50%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const labeledLevels = [0.5, 1.0]; // Only show labels for 50% and 100%

  // Generate axis lines and labels
  const axisPoints = goalData.map((data, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const endX = centerX + Math.cos(angle) * radius;
    const endY = centerY + Math.sin(angle) * radius;

    // Calculate label position (slightly outside the circle)
    const labelRadius = radius + 15;
    const labelX = centerX + Math.cos(angle) * labelRadius;
    const labelY = centerY + Math.sin(angle) * labelRadius;

    return {
      endX,
      endY,
      labelX,
      labelY,
      angle,
      title: data.title,
    };
  });

  // Create polygon path string
  const polygonPoints = dataPoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return renderChartContainer(
    <>
      <Svg width={size} height={size}>
        {/* Grid circles */}
        {gridLevels.map((level, index) => (
          <Circle
            key={index}
            cx={centerX}
            cy={centerY}
            r={radius * level}
            fill="transparent"
            stroke={theme.border}
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {axisPoints.map((axis, index) => (
          <Line
            key={`axis-${index}`}
            x1={centerX}
            y1={centerY}
            x2={axis.endX}
            y2={axis.endY}
            stroke={theme.border}
            strokeWidth={1}
          />
        ))}

        {/* Data polygon */}
        {dataPoints.length >= 3 && (
          <Polygon
            points={polygonPoints}
            fill={
              isDark ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.2)"
            }
            stroke={theme.primary}
            strokeWidth={2}
          />
        )}

        {/* Data points */}
        {dataPoints.map((point, index) => (
          <Circle
            key={`point-${index}`}
            cx={point.x}
            cy={point.y}
            r={5}
            fill={colors[index % colors.length]}
            stroke={theme.surface}
            strokeWidth={2}
          />
        ))}

        {/* Percentage labels on grid - only 50% and 100% */}
        {labeledLevels.map((level, index) => (
          <SvgText
            key={`grid-label-${index}`}
            x={centerX + 5}
            y={centerY - radius * level}
            fontSize="10"
            fill={theme.textSecondary}
            textAnchor="start"
          >
            {Math.round(level * 100)}%
          </SvgText>
        ))}
      </Svg>

      {/* Legend */}
      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {goalData.map((data, index) => (
          <View
            key={index}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginHorizontal: 6,
              marginVertical: 2,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                backgroundColor: colors[index % colors.length],
                borderRadius: 5,
                borderWidth: 1,
                borderColor: theme.surface,
                marginRight: 4,
              }}
            />
            <Text style={{ fontSize: 10, color: theme.textSecondary }}>
              {data.title}: {Math.round(data.percentage * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </>,
  );
}
