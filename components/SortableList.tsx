import React from "react";
import { LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { haptics } from "../utils/haptics";
import { isSameIdList, moveId } from "../lib/personalOrder";

/**
 * A vertical list whose rows can be reordered by pressing and holding, then
 * dragging. It lives inside a normal ScrollView (rows keep their natural
 * layout and heights, which may differ per row) and only takes over once the
 * long press fires, so taps and swipes on the row's own content keep working.
 *
 * While a row is lifted the parent should stop scrolling: pass
 * `onDragActiveChange` and set `scrollEnabled={!dragging}` on the ScrollView.
 *
 * The list never mutates its input. Dropping a row in a new place reports the
 * full id order through `onReorder`; the parent is expected to re-render with
 * `items` in that order, at which point the rows snap to their new slots.
 */
type SortableListProps<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onReorder: (orderedIds: string[]) => void;
  onDragActiveChange?: (active: boolean) => void;
  /** Vertical space between rows; must match what the rows expect. */
  gap?: number;
  disabled?: boolean;
  longPressMs?: number;
};

const NO_INDEX = -1;
const SHIFT_MS = 160;

export default function SortableList<T>({
  items,
  keyOf,
  renderItem,
  onReorder,
  onDragActiveChange,
  gap = 12,
  disabled = false,
  longPressMs = 320,
}: SortableListProps<T>) {
  const ids = React.useMemo(() => items.map(keyOf), [items, keyOf]);

  // Row heights by index, mirrored into a shared value for the UI thread.
  const heightsRef = React.useRef<number[]>([]);
  const heights = useSharedValue<number[]>([]);
  const activeIndex = useSharedValue(NO_INDEX);
  const targetIndex = useSharedValue(NO_INDEX);
  const dragY = useSharedValue(0);

  // Set when a drop changed the order: the shared values are reset only
  // after the parent has re-rendered rows in the new order, so nothing jumps.
  const awaitingCommitRef = React.useRef(false);
  const commitFallbackRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const resetDrag = React.useCallback(() => {
    awaitingCommitRef.current = false;
    if (commitFallbackRef.current) {
      clearTimeout(commitFallbackRef.current);
      commitFallbackRef.current = null;
    }
    activeIndex.value = NO_INDEX;
    targetIndex.value = NO_INDEX;
    dragY.value = 0;
    onDragActiveChange?.(false);
  }, [activeIndex, dragY, onDragActiveChange, targetIndex]);

  React.useLayoutEffect(() => {
    heightsRef.current = heightsRef.current.slice(0, items.length);
    heights.value = [...heightsRef.current];
    if (awaitingCommitRef.current) {
      resetDrag();
    }
  }, [heights, items, resetDrag]);

  React.useEffect(
    () => () => {
      if (commitFallbackRef.current) clearTimeout(commitFallbackRef.current);
    },
    [],
  );

  const setRowHeight = React.useCallback(
    (index: number, height: number) => {
      if (heightsRef.current[index] === height) return;
      heightsRef.current[index] = height;
      heights.value = [...heightsRef.current];
    },
    [heights],
  );

  const handlePickUp = React.useCallback(() => {
    void haptics.press();
    onDragActiveChange?.(true);
  }, [onDragActiveChange]);

  const handleCross = React.useCallback(() => {
    void haptics.tap();
  }, []);

  const handleDrop = React.useCallback(
    (from: number, to: number) => {
      const next = moveId(ids, from, to);
      if (isSameIdList(next, ids)) {
        resetDrag();
        return;
      }
      void haptics.toggle();
      awaitingCommitRef.current = true;
      // If the parent never re-renders (it rejected the order), still let go.
      commitFallbackRef.current = setTimeout(resetDrag, 400);
      onReorder(next);
    },
    [ids, onReorder, resetDrag],
  );

  return (
    <View style={{ gap }}>
      {items.map((item, index) => (
        <SortableRow
          key={ids[index]}
          index={index}
          gap={gap}
          disabled={disabled || items.length < 2}
          longPressMs={longPressMs}
          heights={heights}
          activeIndex={activeIndex}
          targetIndex={targetIndex}
          dragY={dragY}
          onLayoutHeight={setRowHeight}
          onPickUp={handlePickUp}
          onCross={handleCross}
          onDrop={handleDrop}
        >
          {renderItem(item, index)}
        </SortableRow>
      ))}
    </View>
  );
}

type SortableRowProps = {
  index: number;
  gap: number;
  disabled: boolean;
  longPressMs: number;
  heights: SharedValue<number[]>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onLayoutHeight: (index: number, height: number) => void;
  onPickUp: () => void;
  onCross: () => void;
  onDrop: (from: number, to: number) => void;
  children: React.ReactNode;
};

const SortableRow = ({
  index,
  gap,
  disabled,
  longPressMs,
  heights,
  activeIndex,
  targetIndex,
  dragY,
  onLayoutHeight,
  onPickUp,
  onCross,
  onDrop,
  children,
}: SortableRowProps) => {
  const onLayout = React.useCallback(
    (event: LayoutChangeEvent) =>
      onLayoutHeight(index, event.nativeEvent.layout.height),
    [index, onLayoutHeight],
  );

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .activateAfterLongPress(longPressMs)
        .onStart(() => {
          activeIndex.value = index;
          targetIndex.value = index;
          dragY.value = 0;
          runOnJS(onPickUp)();
        })
        .onUpdate((event) => {
          const active = activeIndex.value;
          if (active === NO_INDEX) return;
          dragY.value = event.translationY;

          const sizes = heights.value;
          let top = 0;
          for (let i = 0; i < active; i += 1) top += (sizes[i] ?? 0) + gap;
          const center = top + (sizes[active] ?? 0) / 2 + event.translationY;

          // Where the lifted row's centre falls among the other rows.
          let cursor = 0;
          let target = 0;
          for (let i = 0; i < sizes.length; i += 1) {
            if (i === active) continue;
            const size = (sizes[i] ?? 0) + gap;
            if (center > cursor + size / 2) target += 1;
            cursor += size;
          }
          if (target !== targetIndex.value) {
            targetIndex.value = target;
            runOnJS(onCross)();
          }
        })
        .onEnd(() => {
          const from = activeIndex.value;
          const to = targetIndex.value;
          if (from === NO_INDEX) return;
          if (from === to) {
            // Slide home, then release the lift.
            dragY.value = withTiming(0, { duration: SHIFT_MS }, () => {
              activeIndex.value = NO_INDEX;
              targetIndex.value = NO_INDEX;
              runOnJS(onDrop)(from, to);
            });
            return;
          }
          runOnJS(onDrop)(from, to);
        })
        .onFinalize((_event, success) => {
          // A cancelled gesture (e.g. an incoming call) never reaches onEnd.
          if (!success && activeIndex.value !== NO_INDEX) {
            const from = activeIndex.value;
            activeIndex.value = NO_INDEX;
            targetIndex.value = NO_INDEX;
            dragY.value = 0;
            runOnJS(onDrop)(from, from);
          }
        }),
    [
      activeIndex,
      disabled,
      dragY,
      gap,
      heights,
      index,
      longPressMs,
      onCross,
      onDrop,
      onPickUp,
      targetIndex,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIndex.value;
    if (active === NO_INDEX) {
      return {
        transform: [{ translateY: 0 }, { scale: withTiming(1, { duration: SHIFT_MS }) }],
        zIndex: 0,
        shadowOpacity: withTiming(0, { duration: SHIFT_MS }),
      };
    }
    if (index === active) {
      return {
        transform: [
          { translateY: dragY.value },
          { scale: withTiming(1.03, { duration: SHIFT_MS }) },
        ],
        zIndex: 10,
        shadowOpacity: withTiming(0.18, { duration: SHIFT_MS }),
      };
    }
    const shift = (heights.value[active] ?? 0) + gap;
    const target = targetIndex.value;
    let translateY = 0;
    if (active < index && index <= target) translateY = -shift;
    else if (target <= index && index < active) translateY = shift;
    return {
      transform: [
        { translateY: withTiming(translateY, { duration: SHIFT_MS }) },
        { scale: 1 },
      ],
      zIndex: 0,
      shadowOpacity: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayout}
        style={[
          {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 16,
          },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
};
