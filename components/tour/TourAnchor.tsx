import React from "react";
import { View, ViewProps } from "react-native";

export type TourAnchorKey =
  | "tab-today"
  | "tab-goals"
  | "tab-search"
  | "tab-profile"
  | "goals-card"
  | "goals-new-button"
  | "today-task"
  | "today-summary";

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Anchors register into a module-level map instead of a context so screens
// deep inside the navigator don't need any provider plumbing.
const nodes = new Map<TourAnchorKey, View>();

export const measureAnchor = (key: TourAnchorKey): Promise<AnchorRect | null> =>
  new Promise((resolve) => {
    const node = nodes.get(key);
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      const values = [x, y, width, height];
      if (
        values.some((v) => !Number.isFinite(v)) ||
        width <= 0 ||
        height <= 0
      ) {
        resolve(null);
        return;
      }
      resolve({ x, y, width, height });
    });
  });

type TourAnchorProps = ViewProps & { anchorKey: TourAnchorKey };

/** Wraps a piece of real UI so the app tour can spotlight it by key. */
export function TourAnchor({ anchorKey, children, ...rest }: TourAnchorProps) {
  const ref = React.useRef<View | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (node) {
      nodes.set(anchorKey, node);
    }
    return () => {
      if (nodes.get(anchorKey) === node) {
        nodes.delete(anchorKey);
      }
    };
  }, [anchorKey]);

  return (
    <View ref={ref} collapsable={false} {...rest}>
      {children}
    </View>
  );
}
