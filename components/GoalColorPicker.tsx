import React from "react";
import { GOAL_PALETTE } from "../utils/goalColors";
import ColorPicker, { ColorPickerProps } from "./ColorPicker";

type GoalColorPickerProps = Omit<ColorPickerProps, "title" | "presets">;

export default function GoalColorPicker(props: GoalColorPickerProps) {
  return (
    <ColorPicker
      {...props}
      presets={GOAL_PALETTE.map((color) => ({ color }))}
      title="Goal color"
    />
  );
}
