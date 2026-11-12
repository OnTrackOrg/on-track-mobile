import React, { useId, useRef, useState } from "react";
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  View,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { useCustomColors } from "../lib/customColors";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { hexToHsv, hsvToHex } from "../utils/color";
import { card } from "./ui";

export type ColorPickerProps = {
  title: string;
  presets?: readonly { color: string; label?: string }[];
  visible: boolean;
  selected?: string;
  autoColor: string;
  onSelect: (color: string | null) => void;
  onClose: () => void;
};

const normalizeHex = (input: string): string | null => {
  const hex = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return "#" + hex.toLowerCase();
  if (/^[0-9a-f]{3}$/i.test(hex))
    return (
      "#" +
      hex
        .split("")
        .map((digit) => digit + digit)
        .join("")
        .toLowerCase()
    );
  return null;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A touch surface that keeps tracking a drag outside its bounds. */
function ColorControl({
  label,
  value,
  x,
  y = 0.5,
  color,
  field = false,
  onChange,
  onAccessibilityAction,
  children,
}: {
  label: string;
  value: string;
  x: number;
  y?: number;
  color: string;
  field?: boolean;
  onChange: (x: number, y: number) => void;
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
  children: React.ReactNode;
}) {
  const size = useRef({ width: 0, height: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const update = ({ nativeEvent }: GestureResponderEvent) => {
    if (size.current.width <= 0 || size.current.height <= 0) return;
    onChange(
      clamp((nativeEvent.pageX - origin.current.x) / size.current.width),
      clamp((nativeEvent.pageY - origin.current.y) / size.current.height),
    );
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[
        { name: "increment" },
        { name: "decrement" },
        ...(field
          ? [
              { name: "lighter", label: "Increase brightness" },
              { name: "darker", label: "Decrease brightness" },
            ]
          : []),
      ]}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={({ nativeEvent: { layout } }) => {
        size.current = layout;
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        const { pageX, pageY, locationX, locationY } = event.nativeEvent;
        origin.current = { x: pageX - locationX, y: pageY - locationY };
        update(event);
      }}
      onResponderMove={update}
      onResponderRelease={update}
      style={field ? styles.field : styles.hueControl}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {children}
        <View
          style={[
            styles.thumb,
            { left: `${x * 100}%`, top: `${y * 100}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

function PickerContent({
  selected,
  presets = [],
  autoColor,
  onSelect,
  onClose,
  title,
}: Omit<ColorPickerProps, "visible">) {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const columns = Math.min(
    6,
    Math.max(4, Math.floor((Math.min(width - 48, 420) - 44) / 44)),
  );
  const { colors: savedColors, addColor } = useCustomColors();
  const [picked, setPicked] = useState(selected ?? autoColor);
  const [changed, setChanged] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(picked));
  const [hexDraft, setHexDraft] = useState(picked.toUpperCase());
  const validHex = normalizeHex(hexDraft);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const color = hsvToHex(hsv);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const presetColors = presets.map((preset) => preset.color.toLowerCase());
  const customColors = [
    ...new Set([...savedColors, ...(selected ? [selected.toLowerCase()] : [])]),
  ].filter((value) => !presetColors.includes(value));
  const change = (next: Partial<typeof hsv>) => {
    const updated = { ...hsv, ...next };
    setHsv(updated);
    setHexDraft(hsvToHex(updated).toUpperCase());
  };
  const editHex = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) setHsv(hexToHsv(normalized));
  };
  const pick = (value: string) => {
    setPicked(value.toLowerCase());
    setChanged(true);
    setEditing(false);
    Keyboard.dismiss();
    void haptics.toggle();
  };
  const swatch = (value: string, label?: string, named = false) => (
    <Pressable
      key={value}
      accessibilityRole="button"
      accessibilityLabel={label ?? value}
      accessibilityState={{
        selected: picked.toLowerCase() === value.toLowerCase(),
      }}
      onPress={() => pick(value)}
      style={[styles.preset, { width: named ? "25%" : `${100 / columns}%` }]}
    >
      <View
        style={[
          styles.swatchRing,
          {
            borderColor:
              picked.toLowerCase() === value.toLowerCase()
                ? theme.text
                : "transparent",
          },
        ]}
      >
        <View style={[styles.colorDot, { backgroundColor: value }]}>
          {picked.toLowerCase() === value.toLowerCase() ? (
            <Ionicons
              name="checkmark"
              size={18}
              color="#ffffff"
              style={{ textShadowColor: "#000000", textShadowRadius: 3 }}
            />
          ) : null}
        </View>
      </View>
      {label ? (
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.backdrop}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel color selection"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View accessibilityViewIsModal style={[card(theme, isDark), styles.card]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 20 }}
        >
          <View style={styles.row}>
            <Text
              accessibilityRole="header"
              style={{ fontWeight: "700", fontSize: 20, color: theme.text }}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={editing}
              accessibilityState={{ disabled: editing }}
              onPress={() => {
                void haptics.toggle();
                onSelect(changed ? picked : (selected ?? null));
                onClose();
              }}
              style={[
                styles.done,
                {
                  backgroundColor: theme.background,
                  opacity: editing ? 0.4 : 1,
                },
              ]}
            >
              <Text
                style={{ color: theme.text, fontWeight: "600", fontSize: 15 }}
              >
                Done
              </Text>
            </Pressable>
          </View>
          <View style={styles.presets}>
            {presets.map((preset) =>
              swatch(
                preset.color,
                preset.label,
                presets.some((item) => Boolean(item.label)),
              ),
            )}
          </View>
          <View style={{ height: 1, backgroundColor: theme.border }} />
          <View style={{ gap: 10 }}>
            <Text
              style={{
                color: theme.textSecondary,
                fontWeight: "600",
                fontSize: 11,
                letterSpacing: 1,
              }}
            >
              CUSTOM
            </Text>
            <View style={styles.presets}>
              {customColors.map((value) => swatch(value))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add custom color"
                accessibilityState={{ expanded: editing }}
                onPress={() => {
                  setHsv(hexToHsv(picked));
                  setHexDraft(picked.toUpperCase());
                  setEditing(true);
                }}
                style={[styles.add, { width: `${100 / columns}%` }]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={30}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>
          </View>
          {!editing ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: picked,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              />
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {picked.toUpperCase()}
              </Text>
            </View>
          ) : (
            <View key="editor" style={{ gap: 16 }}>
              <View style={styles.row}>
                <Text
                  style={{ color: theme.text, fontWeight: "600", fontSize: 14 }}
                >
                  New custom color
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditing(false);
                    Keyboard.dismiss();
                  }}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingLeft: 12,
                  }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
              <ColorControl
                field
                label="Color saturation and brightness"
                value={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
                x={hsv.s}
                y={1 - hsv.v}
                color={color}
                onChange={(s, y) => change({ s, v: 1 - y })}
                onAccessibilityAction={({ nativeEvent: { actionName } }) => {
                  if (actionName === "lighter" || actionName === "darker") {
                    change({
                      v: clamp(
                        hsv.v + (actionName === "lighter" ? 0.05 : -0.05),
                      ),
                    });
                  } else {
                    change({
                      s: clamp(
                        hsv.s + (actionName === "increment" ? 0.05 : -0.05),
                      ),
                    });
                  }
                }}
              >
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient
                      id={`${id}white`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <Stop offset="0%" stopColor="#ffffff" />
                      <Stop offset="100%" stopColor={hueColor} />
                    </LinearGradient>
                    <LinearGradient
                      id={`${id}black`}
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <Stop offset="0%" stopColor="#000000" stopOpacity={0} />
                      <Stop offset="100%" stopColor="#000000" />
                    </LinearGradient>
                  </Defs>
                  <Rect
                    width="100%"
                    height="100%"
                    rx={12}
                    fill={`url(#${id}white)`}
                  />
                  <Rect
                    width="100%"
                    height="100%"
                    rx={12}
                    fill={`url(#${id}black)`}
                  />
                </Svg>
              </ColorControl>
              <ColorControl
                label="Hue"
                value={`${Math.round(hsv.h)} degrees`}
                x={hsv.h / 360}
                color={hueColor}
                onChange={(x) => change({ h: x * 360 })}
                onAccessibilityAction={({ nativeEvent: { actionName } }) =>
                  change({
                    h:
                      clamp(
                        (hsv.h + (actionName === "increment" ? 5 : -5)) / 360,
                      ) * 360,
                  })
                }
              >
                <Svg width="100%" height="16" style={styles.hueTrack}>
                  <Defs>
                    <LinearGradient
                      id={`${id}hue`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      {[
                        "#ff0000",
                        "#ffff00",
                        "#00ff00",
                        "#00ffff",
                        "#0000ff",
                        "#ff00ff",
                        "#ff0000",
                      ].map((stopColor, index) => (
                        <Stop
                          key={index}
                          offset={`${(index / 6) * 100}%`}
                          stopColor={stopColor}
                        />
                      ))}
                    </LinearGradient>
                  </Defs>
                  <Rect
                    width="100%"
                    height="16"
                    rx={8}
                    fill={`url(#${id}hue)`}
                  />
                </Svg>
              </ColorControl>

              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 11,
                    letterSpacing: 1,
                  }}
                >
                  HEX
                </Text>
                <View
                  style={[
                    styles.preview,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: color, borderColor: theme.border },
                    ]}
                  />
                  <TextInput
                    accessibilityLabel="Hex color"
                    value={hexDraft}
                    onChangeText={editHex}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    spellCheck={false}
                    keyboardAppearance={isDark ? "dark" : "light"}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (validHex) setHexDraft(validHex.toUpperCase());
                    }}
                    selectTextOnFocus
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 44,
                      color: theme.text,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  />
                </View>
                {!validHex ? (
                  <Text
                    accessibilityRole="alert"
                    style={{ color: theme.danger }}
                  >
                    Enter 3 or 6 hex digits.
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!validHex}
                accessibilityState={{ disabled: !validHex }}
                onPress={() => {
                  if (!validHex) return;
                  if (!presetColors.includes(validHex)) addColor(validHex);
                  pick(validHex);
                }}
                style={[
                  styles.save,
                  { backgroundColor: theme.text, opacity: validHex ? 1 : 0.4 },
                ]}
              >
                <Text
                  style={{
                    color: theme.surface,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  Save color
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function ColorPicker(props: ColorPickerProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={props.visible}
      onRequestClose={props.onClose}
    >
      {props.visible ? <PickerContent {...props} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    padding: 22,
    borderRadius: 26,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  field: { width: "100%", aspectRatio: 1.7 },
  hueControl: { width: "100%", height: 44 },
  hueTrack: { position: "absolute", top: 14 },
  thumb: {
    position: "absolute",
    width: 26,
    height: 26,
    marginLeft: -13,
    marginTop: -13,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", rowGap: 10 },
  preset: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  swatchRing: { padding: 3, borderRadius: 24, borderWidth: 2 },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: { width: 28, height: 28, borderRadius: 7, borderWidth: 1 },
  add: {
    width: "16.666%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  done: {
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  save: {
    minHeight: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
