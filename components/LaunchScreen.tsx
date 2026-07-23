import React from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeInUp,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../contexts/ThemeContext";
import { withAlpha } from "../utils/color";
import { Quote, fetchRandomQuote, getFallbackQuote } from "../lib/quotes";

// Launch animation 2c from the redesign: a heatmap-shaped grid ripples in a
// diagonal wave in the current accent colour, then a quote fades up. Tap
// anywhere to skip.
const COLS = 10;
const ROWS = 7;
const CELL = 16;
const GAP = 4;
const WAVE_STEP_MS = 90;
const WAVE_DURATION_MS = 1500;
const QUOTE_DELAY_MS = 1800;
const HOLD_MS = 4300;
const REDUCED_HOLD_MS = 2600;
const FADE_OUT_MS = 450;
// A fresh open after this long in the background replays the launch screen.
const RESHOW_AFTER_BACKGROUND_MS = 5 * 60 * 1000;
// A late API response may swap the quote only while it is still invisible
// (it fades in at QUOTE_DELAY_MS).
const QUOTE_SWAP_CUTOFF_MS = 1400;

function WaveCell({ index, reduced }: { index: number; reduced: boolean }) {
  const { theme } = useTheme();
  const progress = useSharedValue(reduced ? 1 : 0);
  const col = index % COLS;
  const row = Math.floor(index / COLS);

  React.useEffect(() => {
    if (reduced) return;
    progress.value = withDelay(
      (col + row) * WAVE_STEP_MS,
      withTiming(1, {
        duration: WAVE_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
    );
  }, [col, progress, reduced, row]);

  const start = withAlpha(theme.primary, 0);
  const hi = withAlpha(theme.primary, 0.55);
  const lo = withAlpha(theme.primary, 0.07);
  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 0.35, 1],
      [start, hi, lo],
    ),
  }));

  return (
    <Animated.View
      style={[{ width: CELL, height: CELL, borderRadius: 4 }, animatedStyle]}
    />
  );
}

function LaunchScreenView({
  quote,
  onDone,
}: {
  quote: Quote;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  const dismissed = React.useRef(false);

  const dismiss = React.useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    opacity.value = withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, [onDone, opacity]);

  React.useEffect(() => {
    const timer = setTimeout(dismiss, reduced ? REDUCED_HOLD_MS : HOLD_MS);
    return () => clearTimeout(timer);
  }, [dismiss, reduced]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
        },
        overlayStyle,
      ]}
    >
      <Pressable
        onPress={dismiss}
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 44,
          paddingHorizontal: 40,
        }}
      >
        <View style={{ gap: GAP }}>
          {Array.from({ length: ROWS }, (_, row) => (
            <View key={row} style={{ flexDirection: "row", gap: GAP }}>
              {Array.from({ length: COLS }, (_, col) => (
                <WaveCell
                  key={col}
                  index={row * COLS + col}
                  reduced={reduced}
                />
              ))}
            </View>
          ))}
        </View>
        <Animated.View
          entering={FadeInUp.duration(900).delay(QUOTE_DELAY_MS)}
          style={{ alignItems: "center", gap: 14 }}
        >
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: theme.text,
              textAlign: "center",
              lineHeight: 30,
            }}
          >
            &ldquo;{quote.text}&rdquo;
          </Text>
          <Text style={{ fontSize: 14, color: theme.textSecondary }}>
            — {quote.author}
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeInUp.duration(900).delay(QUOTE_DELAY_MS)}
          style={{ position: "absolute", bottom: insets.bottom + 40 }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              letterSpacing: 2,
              color: theme.textSecondary,
            }}
          >
            ONTRACK
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Self-managing overlay: plays on cold start, and again when the app comes
 * back to the foreground after a long stay in the background.
 */
export default function LaunchScreen() {
  const [visible, setVisible] = React.useState(true);
  const [quote, setQuote] = React.useState<Quote>(() => getFallbackQuote());
  const shownAt = React.useRef(Date.now());

  React.useEffect(() => {
    let live = true;
    void fetchRandomQuote().then((fresh) => {
      if (
        live &&
        fresh &&
        Date.now() - shownAt.current < QUOTE_SWAP_CUTOFF_MS
      ) {
        setQuote(fresh);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  React.useEffect(() => {
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        backgroundedAt = Date.now();
      } else if (
        nextState === "active" &&
        backgroundedAt !== null &&
        Date.now() - backgroundedAt > RESHOW_AFTER_BACKGROUND_MS
      ) {
        backgroundedAt = null;
        shownAt.current = Date.now();
        setQuote(getFallbackQuote());
        void fetchRandomQuote().then((fresh) => {
          if (fresh && Date.now() - shownAt.current < QUOTE_SWAP_CUTOFF_MS) {
            setQuote(fresh);
          }
        });
        setVisible(true);
      }
    });
    return () => subscription.remove();
  }, []);

  if (!visible) return null;
  return <LaunchScreenView quote={quote} onDone={() => setVisible(false)} />;
}
