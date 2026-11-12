import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORAGE_KEYS } from "./persistence";

const normalizeColors = (colors: unknown): string[] =>
  Array.isArray(colors)
    ? [
        ...new Set(
          colors
            .filter(
              (color): color is string =>
                typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color),
            )
            .map((color) => color.toLowerCase()),
        ),
      ]
    : [];

type CustomColors = {
  colors: string[];
  addColor: (color: string) => void;
};

/** A device-local roster shared by goal and Appearance pickers. */
export const useCustomColors = create<CustomColors>()(
  persist(
    (set) => ({
      colors: [],
      addColor: (color) =>
        set((state) => ({
          colors: normalizeColors([...state.colors, color]),
        })),
    }),
    {
      name: STORAGE_KEYS.customColors,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ colors: state.colors }),
      // Keep colors added while asynchronous hydration was still in flight.
      merge: (persisted, current) => ({
        ...current,
        colors: normalizeColors([
          ...normalizeColors(
            (persisted as Partial<CustomColors> | undefined)?.colors,
          ),
          ...current.colors,
        ]),
      }),
    },
  ),
);
