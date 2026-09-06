import React from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// Degrees the shackle swings around its right-hand hinge when open.
// Positive = clockwise on screen, which lifts the left leg out of the body.
const OPEN_ROTATION = 42;
// Hinge point in the 24×24 viewBox: the shackle's right foot, expressed as
// an offset from the view's center (RN transforms pivot on the center).
const HINGE_X = 16 / 24 - 0.5;
const HINGE_Y = 11 / 24 - 0.5;

type PrivacyLockProps = {
  open: boolean;
  size?: number;
  color: string;
};

/**
 * A padlock whose shackle physically swings open (public) or snaps shut
 * (private), so a visibility change is impossible to miss. The shackle is
 * its own layer rotated around the hinge with a spring.
 */
export default function PrivacyLock({
  open,
  size = 18,
  color,
}: PrivacyLockProps) {
  const rotation = useSharedValue(open ? OPEN_ROTATION : 0);

  React.useEffect(() => {
    rotation.value = withSpring(open ? OPEN_ROTATION : 0, {
      damping: 11,
      stiffness: 170,
      mass: 0.6,
    });
  }, [open, rotation]);

  const hingeX = size * HINGE_X;
  const hingeY = size * HINGE_Y;
  const shackleStyle = useAnimatedStyle(() => ({
    transform: [
      // A little lift so the shackle visibly pops out of the body.
      { translateY: -(rotation.value / OPEN_ROTATION) * size * 0.08 },
      { translateX: hingeX },
      { translateY: hingeY },
      { rotate: `${rotation.value}deg` },
      { translateX: -hingeX },
      { translateY: -hingeY },
    ],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            zIndex: 1,
          },
          shackleStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M8 11V7a4 4 0 0 1 8 0v4"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect
          x={4.5}
          y={11}
          width={15}
          height={10}
          rx={2.5}
          stroke={color}
          strokeWidth={2.2}
          fill="none"
        />
        <Rect x={11} y={14.5} width={2} height={3.2} rx={1} fill={color} />
      </Svg>
    </View>
  );
}
