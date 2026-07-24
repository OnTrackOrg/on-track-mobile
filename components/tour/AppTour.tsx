import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { useTheme } from "../../contexts/ThemeContext";
import { useStore } from "../../store";
import { withAlpha } from "../../utils/color";
import { haptics } from "../../utils/haptics";
import { RootStackParamList } from "../../navigation";
import {
  isLaunchScreenVisible,
  subscribeLaunchScreenVisibility,
} from "../../lib/launchVisibility";
import { AnchorRect, TourAnchorKey, measureAnchor } from "./TourAnchor";
import { TOUR_STEPS } from "./tourSteps";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SPOT_TIMING = { duration: 360, easing: Easing.inOut(Easing.quad) };
// Anchors on a freshly-mounted tab can take a few frames to lay out.
const MEASURE_ATTEMPTS = 24;
const MEASURE_INTERVAL_MS = 50;
const TAB_SWITCH_SETTLE_MS = 90;
const DEFAULT_SPOTLIGHT_PADDING = 8;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const measureFirstAnchor = async (
  anchors: TourAnchorKey[] | undefined,
): Promise<AnchorRect | null> => {
  if (!anchors || anchors.length === 0) {
    return null;
  }
  for (let attempt = 0; attempt < MEASURE_ATTEMPTS; attempt += 1) {
    for (const key of anchors) {
      const rect = await measureAnchor(key);
      if (rect) {
        return rect;
      }
    }
    await delay(MEASURE_INTERVAL_MS);
  }
  return null;
};

type AppTourProps = {
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  onDone: () => void;
};

/**
 * Overlay guided tour of the real UI (issue #151). Dims the app with an SVG
 * mask, cuts a spotlight over the current step's anchor, and walks the tabs.
 * The underlying app stays non-interactive until the tour finishes.
 */
export default function AppTour({ navigationRef, onDone }: AppTourProps) {
  const { theme, isDark } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const goals = useStore((s) => s.goals);
  const sharedGoals = useStore((s) => s.sharedGoals);
  const hasActiveGoals = React.useMemo(
    () =>
      [...goals, ...sharedGoals].some((goal) => goal.completedAt === undefined),
    [goals, sharedGoals],
  );

  const [launchGone, setLaunchGone] = React.useState(
    () => !isLaunchScreenVisible(),
  );
  const [stepIndex, setStepIndex] = React.useState(0);
  const [rect, setRect] = React.useState<AnchorRect | null>(null);
  const [measuredStepKey, setMeasuredStepKey] = React.useState<string | null>(
    null,
  );

  const holeX = useSharedValue(windowWidth / 2);
  const holeY = useSharedValue(windowHeight / 2);
  const holeW = useSharedValue(0);
  const holeH = useSharedValue(0);
  const holeR = useSharedValue(0);
  const ringOpacity = useSharedValue(0);

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  React.useEffect(
    () =>
      subscribeLaunchScreenVisibility((visible) => {
        if (!visible) {
          setLaunchGone(true);
        }
      }),
    [],
  );

  React.useEffect(() => {
    if (!launchGone) {
      return;
    }
    let cancelled = false;

    const showStep = async () => {
      if (step.tab && navigationRef.isReady()) {
        navigationRef.navigate("Tabs", { screen: step.tab });
        await delay(TAB_SWITCH_SETTLE_MS);
      }

      const measured = await measureFirstAnchor(step.anchors);
      if (cancelled) {
        return;
      }

      if (measured) {
        const padding = step.spotlightPadding ?? DEFAULT_SPOTLIGHT_PADDING;
        const x = Math.max(4, measured.x - padding);
        const y = Math.max(4, measured.y - padding);
        const right = Math.min(
          windowWidth - 4,
          measured.x + measured.width + padding,
        );
        const bottom = Math.min(
          windowHeight,
          measured.y + measured.height + padding,
        );
        const width = right - x;
        const height = bottom - y;

        holeX.value = withTiming(x, SPOT_TIMING);
        holeY.value = withTiming(y, SPOT_TIMING);
        holeW.value = withTiming(width, SPOT_TIMING);
        holeH.value = withTiming(height, SPOT_TIMING);
        holeR.value = withTiming(
          Math.min(step.spotlightRadius ?? 16, width / 2, height / 2),
          SPOT_TIMING,
        );
        ringOpacity.value = withTiming(1, SPOT_TIMING);
        setRect({ x, y, width, height });
      } else {
        holeX.value = withTiming(windowWidth / 2, SPOT_TIMING);
        holeY.value = withTiming(windowHeight / 2, SPOT_TIMING);
        holeW.value = withTiming(0, SPOT_TIMING);
        holeH.value = withTiming(0, SPOT_TIMING);
        holeR.value = withTiming(0, SPOT_TIMING);
        ringOpacity.value = withTiming(0, SPOT_TIMING);
        setRect(null);
      }
      setMeasuredStepKey(step.key);
    };

    void showStep();
    return () => {
      cancelled = true;
    };
  }, [
    launchGone,
    navigationRef,
    step,
    windowWidth,
    windowHeight,
    holeX,
    holeY,
    holeW,
    holeH,
    holeR,
    ringOpacity,
  ]);

  const dimProps = useAnimatedProps(() => {
    const x = holeX.value;
    const y = holeY.value;
    const w = holeW.value;
    const h = holeH.value;
    const r = Math.min(holeR.value, w / 2, h / 2);
    const right = x + w;
    const bottom = y + h;
    return {
      // Outer window rect + inner rounded rect; evenodd turns the inner one
      // into a transparent spotlight. Zero-radius arcs degrade to lines, so
      // the "no anchor" state (w = h = 0) is just a full dim.
      d:
        `M0 0H${windowWidth}V${windowHeight}H0Z` +
        `M${x + r} ${y}H${right - r}A${r} ${r} 0 0 1 ${right} ${y + r}` +
        `V${bottom - r}A${r} ${r} 0 0 1 ${right - r} ${bottom}H${x + r}` +
        `A${r} ${r} 0 0 1 ${x} ${bottom - r}V${y + r}` +
        `A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    left: holeX.value - 3,
    top: holeY.value - 3,
    width: holeW.value + 6,
    height: holeH.value + 6,
    borderRadius: Math.min(
      holeR.value + 3,
      (holeW.value + 6) / 2,
      (holeH.value + 6) / 2,
    ),
    opacity: ringOpacity.value,
  }));

  const finish = React.useCallback(() => {
    if (navigationRef.isReady()) {
      navigationRef.navigate("Tabs", { screen: "Today" });
    }
    onDone();
  }, [navigationRef, onDone]);

  const goNext = () => {
    void haptics.tap();
    if (isLast) {
      finish();
    } else {
      setStepIndex((index) => index + 1);
    }
  };

  const goBack = () => {
    void haptics.tap();
    setStepIndex((index) => Math.max(0, index - 1));
  };

  const skip = () => {
    void haptics.tap();
    finish();
  };

  if (!launchGone) {
    return null;
  }

  const cardIsVisible = measuredStepKey === step.key;
  const cardText =
    !hasActiveGoals && step.textWhenEmpty ? step.textWhenEmpty : step.text;

  // Anchored steps place the card on the emptier half of the screen.
  const cardPlacement: { top?: number; bottom?: number; centered: boolean } =
    (() => {
      if (!rect) {
        return { centered: true };
      }
      if (rect.y + rect.height < windowHeight * 0.52) {
        return { centered: false, top: rect.y + rect.height + 18 };
      }
      return { centered: false, bottom: windowHeight - rect.y + 18 };
    })();

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      {/* Dim + spotlight. Tapping the dim advances the tour. */}
      <Pressable
        onPress={goNext}
        accessibilityLabel="Next tour step"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Svg width={windowWidth} height={windowHeight}>
          <AnimatedPath
            animatedProps={dimProps}
            fill={withAlpha("#020617", isDark ? 0.74 : 0.62)}
            fillRule="evenodd"
          />
        </Svg>
      </Pressable>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            borderWidth: 2,
            borderColor: withAlpha(theme.primary, 0.95),
            shadowColor: theme.primary,
            shadowOpacity: 0.45,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
          },
          ringStyle,
        ]}
      />

      {cardIsVisible ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            justifyContent: cardPlacement.centered ? "center" : undefined,
            alignItems: "center",
          }}
        >
          <Animated.View
            key={step.key}
            entering={FadeInDown.duration(300)}
            style={{
              position: cardPlacement.centered ? "relative" : "absolute",
              top: cardPlacement.top,
              bottom: cardPlacement.bottom,
              width: Math.min(windowWidth - 40, 380),
              backgroundColor: theme.surface,
              borderRadius: 20,
              padding: 20,
              gap: 10,
              ...(isDark
                ? { borderWidth: 1, borderColor: theme.border }
                : {
                    shadowColor: "#0f172a",
                    shadowOpacity: 0.18,
                    shadowRadius: 24,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 8,
                  }),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
                marginBottom: 2,
              }}
            >
              {TOUR_STEPS.map((item, index) => (
                <View
                  key={item.key}
                  style={{
                    width: index === stepIndex ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      index === stepIndex ? theme.primary : theme.border,
                  }}
                />
              ))}
            </View>

            <Text
              style={{ color: theme.text, fontSize: 19, fontWeight: "800" }}
            >
              {step.title}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 14.5,
                lineHeight: 21,
              }}
            >
              {cardText}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              {!isLast ? (
                <Pressable
                  onPress={skip}
                  style={{ paddingVertical: 6, paddingRight: 12 }}
                >
                  <Text
                    style={{ color: theme.textSecondary, fontWeight: "600" }}
                  >
                    Skip
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }} />
              {stepIndex > 0 ? (
                <Pressable
                  onPress={goBack}
                  style={{ paddingVertical: 6, paddingHorizontal: 12 }}
                >
                  <Text
                    style={{ color: theme.textSecondary, fontWeight: "700" }}
                  >
                    Back
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={goNext}
                style={{
                  backgroundColor: theme.primary,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  marginLeft: 6,
                }}
              >
                <Text style={{ color: "#ffffff", fontWeight: "700" }}>
                  {isLast ? "Let's go" : "Next"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </Animated.View>
  );
}
