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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { hexToHsv, hsvToHex } from "../utils/color";
import { card } from "./ui";

export type ColorPickerProps = {
  title: string;
  presets?: readonly { color: string; label?: string }[];
  automaticLabel?: string;
  automaticAccessibilityLabel?: string;
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
  automaticLabel = "Default",
  automaticAccessibilityLabel = "Use default color",
}: Omit<ColorPickerProps, "visible">) {
  const { theme, isDark } = useTheme();
  const [hsv, setHsv] = useState(() => hexToHsv(selected ?? autoColor));
  const [automatic, setAutomatic] = useState(selected === undefined);
  const [custom, setCustom] = useState(
    () =>
      !presets.some(
        (preset) =>
          preset.color.toLowerCase() === (selected ?? autoColor).toLowerCase(),
      ),
  );
  const [hexDraft, setHexDraft] = useState(
    (selected ?? autoColor).toUpperCase(),
  );
  const [pasteError, setPasteError] = useState<string | null>(null);
  const validHex = normalizeHex(hexDraft);
  const editHex = (value: string) => {
    setHexDraft(value);
    setPasteError(null);
    const normalized = normalizeHex(value);
    if (normalized) {
      setHsv(hexToHsv(normalized));
      setAutomatic(false);
    }
  };
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const color = hsvToHex(hsv);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const change = (next: Partial<typeof hsv>) => {
    setAutomatic(false);
    const updated = { ...hsv, ...next };
    setHsv(updated);
    setHexDraft(hsvToHex(updated).toUpperCase());
    setPasteError(null);
  };
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
          contentContainerStyle={{ gap: 16 }}
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
              accessibilityLabel="Close color picker"
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          {presets.length > 0 ? (
            <View style={[styles.tabs, { backgroundColor: theme.background }]}>
              {[false, true].map((isCustom) => (
                <Pressable
                  key={String(isCustom)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: custom === isCustom }}
                  onPress={() => setCustom(isCustom)}
                  style={[
                    styles.tab,
                    custom === isCustom && { backgroundColor: theme.surface },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    {isCustom ? "Custom" : "Presets"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {!custom ? (
            <View key="presets" style={styles.presets}>
              {presets.map((preset) => (
                <Pressable
                  key={preset.color}
                  accessibilityRole="button"
                  accessibilityLabel={preset.label ?? preset.color}
                  accessibilityState={{
                    selected:
                      !automatic && color === preset.color.toLowerCase(),
                  }}
                  onPress={() => {
                    setHsv(hexToHsv(preset.color));
                    setHexDraft(preset.color.toUpperCase());
                    setAutomatic(false);
                    setPasteError(null);
                    void haptics.toggle();
                  }}
                  style={styles.preset}
                >
                  <View
                    style={{
                      padding: 4,
                      borderRadius: 26,
                      borderWidth: 2,
                      borderColor:
                        !automatic && color === preset.color.toLowerCase()
                          ? theme.text
                          : "transparent",
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: preset.color,
                      }}
                    />
                  </View>
                  {preset.label ? (
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                      {preset.label}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <View key="custom" style={{ gap: 16 }}>
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
              <View style={[styles.preview, { borderColor: theme.border }]}>
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Paste hex color"
                  onPress={async () => {
                    try {
                      const value = await Clipboard.getStringAsync();
                      const normalized = normalizeHex(value);
                      if (normalized) editHex(normalized.toUpperCase());
                      else setPasteError("Clipboard needs a valid hex color.");
                    } catch {
                      setPasteError(
                        "Couldn’t read the clipboard. Try pasting into the field.",
                      );
                    }
                  }}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    Paste
                  </Text>
                </Pressable>
              </View>
              {pasteError || !validHex ? (
                <Text
                  accessibilityRole="alert"
                  style={{ color: theme.danger ?? theme.textSecondary }}
                >
                  {pasteError ?? "Enter 3 or 6 hex digits."}
                </Text>
              ) : null}
            </View>
          )}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={automaticAccessibilityLabel}
              accessibilityState={{ selected: automatic }}
              onPress={() => {
                setHsv(hexToHsv(autoColor));
                setHexDraft(autoColor.toUpperCase());
                setPasteError(null);
                setAutomatic(true);
                void haptics.toggle();
              }}
              style={styles.automatic}
            >
              <Text
                style={{
                  color: theme.textSecondary,
                  fontWeight: "600",
                  fontSize: 15,
                }}
              >
                {automaticLabel}
              </Text>
              {automatic ? (
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={theme.textSecondary}
                />
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={custom && !validHex}
              accessibilityState={{ disabled: custom && !validHex }}
              onPress={() => {
                void haptics.toggle();
                onSelect(automatic ? null : color);
                onClose();
              }}
              style={[
                styles.done,
                {
                  backgroundColor: theme.primary,
                  opacity: custom && !validHex ? 0.4 : 1,
                },
              ]}
            >
              <Text
                style={{ color: "#ffffff", fontWeight: "700", fontSize: 16 }}
              >
                Done
              </Text>
            </Pressable>
          </View>
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
    padding: 20,
    gap: 16,
    borderRadius: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  close: {
    width: 44,
    height: 44,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  field: { width: "100%", aspectRatio: 1.35 },
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
    borderWidth: 1,
    borderRadius: 12,
  },
  tabs: { flexDirection: "row", padding: 4, borderRadius: 12 },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  preset: { width: "25%", minHeight: 48, alignItems: "center", gap: 3 },
  swatch: { width: 32, height: 32, borderRadius: 8, borderWidth: 1 },
  automatic: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    minHeight: 44,
  },
  done: {
    paddingHorizontal: 24,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
