import React from "react";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

// The Ember Grid logo (Claude Design refresh, concept 1a): a 3×3 heatmap
// grid warming from ember brown to amber, with the last cell glowing. Drawn
// in code so it can sit on any background at any size.
const RAMP = [
  "#5c3a12",
  "#7a4d17",
  "#a3661f",
  "#7a4d17",
  "#a3661f",
  "#c8792a",
  "#a3661f",
  "#c8792a",
  "#e8a33c",
] as const;

type BrandMarkProps = {
  size?: number;
  // Draw the dark rounded ground behind the grid (app-icon look).
  ground?: boolean;
};

export default function BrandMark({
  size = 72,
  ground = false,
}: BrandMarkProps) {
  const cell = 22;
  const gap = 6;
  const pad = ground ? 14 : 0;
  const grid = cell * 3 + gap * 2;
  const box = grid + pad * 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#f5b453" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#f5b453" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {ground ? (
        <Rect width={box} height={box} rx={box * 0.22} fill="#100d0a" />
      ) : null}
      {RAMP.map((fill, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = pad + col * (cell + gap);
        const y = pad + row * (cell + gap);
        const isStreak = index === 8;
        return (
          <React.Fragment key={index}>
            {isStreak ? (
              <Rect
                x={x - cell * 0.6}
                y={y - cell * 0.6}
                width={cell * 2.2}
                height={cell * 2.2}
                fill="url(#glow)"
              />
            ) : null}
            <Rect
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={6}
              fill={fill}
              stroke={isStreak ? "#f8d68a" : "none"}
              strokeWidth={isStreak ? 1.8 : 0}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
