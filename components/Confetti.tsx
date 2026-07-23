import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Short confetti burst from the center of the progress ring when every task
// for the day is done (redesign mockup 1e). Remount (via key) to replay.
const COLORS = [
  "#ef4444",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
];
const PIECE_COUNT = 16;

function Piece({ index, size }: { index: number; size: number }) {
  const progress = useSharedValue(0);

  const angle = (index / PIECE_COUNT) * Math.PI * 2 + (index % 3) * 0.4;
  const distance = 46 + (index % 4) * 16;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance - 14;
  const rotation = index % 2 ? 220 : -200;

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 650 + (index % 5) * 90,
      easing: Easing.bezier(0.15, 0.6, 0.4, 1),
    });
  }, [index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.7, 1], [1, 1, 0]),
    transform: [
      { translateX: progress.value * dx },
      { translateY: progress.value * dy },
      { rotate: `${progress.value * rotation}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: size / 2 - 3,
          top: size / 2 - 5,
          width: 6,
          height: 10,
          borderRadius: 2,
          backgroundColor: COLORS[index % COLORS.length],
        },
        animatedStyle,
      ]}
    />
  );
}

export default function Confetti({ size }: { size: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, zIndex: 3 }}
    >
      {Array.from({ length: PIECE_COUNT }, (_, index) => (
        <Piece key={index} index={index} size={size} />
      ))}
    </View>
  );
}
