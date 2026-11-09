import React from "react";
import ColorPicker, { ColorPickerProps } from "./ColorPicker";

type GoalColorPickerProps = Omit<
  ColorPickerProps,
  "title" | "automaticLabel" | "automaticAccessibilityLabel"
>;

export default function GoalColorPicker(props: GoalColorPickerProps) {
  return (
    <ColorPicker
      {...props}
      title="Goal color"
      automaticLabel="Automatic"
      automaticAccessibilityLabel="Use automatic goal color"
    />
  );
}
