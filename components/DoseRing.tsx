import React from "react";
import Svg, { Circle } from "react-native-svg";

const SIZE = 26;
const STROKE = 3;
const GAP = 5;
// Past this many doses the segments get too thin to read; draw one arc.
const MAX_SEGMENTS = 8;

/**
 * The Today check circle for a multi-dose task: one arc segment per dose,
 * filled in the goal colour as doses are logged (mockup 1e).
 */
export default function DoseRing({
  total,
  logged,
  color,
  trackColor,
}: {
  total: number;
  logged: number;
  color: string;
  trackColor: string;
}) {
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = SIZE / 2;

  if (total > MAX_SEGMENTS) {
    const filled = (circumference * Math.min(logged, total)) / total;
    return (
      <Svg
        width={SIZE}
        height={SIZE}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={STROKE}
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </Svg>
    );
  }

  const step = circumference / total;
  const segment = Math.max(1, step - GAP);
  return (
    <Svg
      width={SIZE}
      height={SIZE}
      style={{ transform: [{ rotate: "-90deg" }] }}
    >
      {Array.from({ length: total }, (_, i) => (
        <Circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={i < logged ? color : trackColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${segment} ${circumference - segment}`}
          strokeDashoffset={-(i * step + GAP / 2)}
        />
      ))}
    </Svg>
  );
}
