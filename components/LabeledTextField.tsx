import React from "react";
import { Pressable, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

type LabeledTextFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  helpText?: string;
  errorText?: string;
  accessoryLabel?: string;
  onAccessoryPress?: () => void;
} & Pick<
  TextInputProps,
  | "autoCapitalize"
  | "autoCorrect"
  | "autoComplete"
  | "keyboardType"
  | "secureTextEntry"
  | "textContentType"
  | "returnKeyType"
  | "onSubmitEditing"
  | "blurOnSubmit"
  | "contextMenuHidden"
  | "selectTextOnFocus"
  | "editable"
  | "passwordRules"
>;

export default function LabeledTextField({
  label,
  placeholder,
  value,
  onChangeText,
  helpText,
  errorText,
  accessoryLabel,
  onAccessoryPress,
  ...inputProps
}: LabeledTextFieldProps) {
  const { theme, isDark } = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: "700", fontSize: 16, color: theme.text }}>
        {label}
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: errorText ? "#dc2626" : theme.border,
          borderRadius: 8,
          backgroundColor: theme.surface,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 12,
          paddingRight: 8,
        }}
      >
        <TextInput
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          style={{
            flex: 1,
            paddingVertical: 12,
            color: theme.text,
            backgroundColor: "transparent",
          }}
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          underlineColorAndroid="transparent"
          keyboardAppearance={isDark ? "dark" : "light"}
          {...inputProps}
        />
        {onAccessoryPress ? (
          <Pressable
            onPress={onAccessoryPress}
            hitSlop={8}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            accessibilityRole="button"
            accessibilityLabel={accessoryLabel ?? "Toggle field option"}
          >
            <Ionicons
              name={
                accessoryLabel === "Show password"
                  ? "eye-outline"
                  : "eye-off-outline"
              }
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {errorText ? (
        <Text style={{ color: "#dc2626", fontSize: 13, lineHeight: 18 }}>
          {errorText}
        </Text>
      ) : helpText ? (
        <Text
          style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}
        >
          {helpText}
        </Text>
      ) : null}
    </View>
  );
}
