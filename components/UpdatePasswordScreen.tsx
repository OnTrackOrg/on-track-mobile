import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getAccountDraftErrors } from "../account";
import { useTheme } from "../contexts/ThemeContext";
import LabeledTextField from "./LabeledTextField";

type UpdatePasswordScreenProps = {
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (password: string) => void;
};

export default function UpdatePasswordScreen({
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: UpdatePasswordScreenProps) {
  const { theme } = useTheme();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = React.useState(false);
  const errors = getAccountDraftErrors(
    "Reset User",
    "reset-user",
    "reset@example.com",
    password,
    confirmPassword,
  );
  const isValid = !errors.password && !errors.confirmPassword;
  const passwordTextContentType =
    Platform.OS === "ios" && showPassword ? "oneTimeCode" : "newPassword";
  const confirmPasswordTextContentType =
    Platform.OS === "ios" && showConfirmPassword ? "oneTimeCode" : "password";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            justifyContent: "center",
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={{ gap: 18 }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                alignSelf: "center",
              }}
            >
              <Ionicons name="key-outline" size={42} color={theme.primary} />
            </View>

            <View style={{ gap: 10 }}>
              <Text
                style={{
                  color: theme.text,
                  fontSize: 28,
                  fontWeight: "800",
                  textAlign: "center",
                }}
              >
                Choose a new password
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 15,
                  lineHeight: 22,
                  textAlign: "center",
                }}
              >
                Enter a new password for your OnTrack account.
              </Text>
            </View>

            {errorMessage ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: "#7f1d1d",
                }}
              >
                <Text style={{ color: "#fecaca", lineHeight: 20 }}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: 14 }}>
              <LabeledTextField
                label="New password"
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Choose a new password"
                textContentType={passwordTextContentType}
                autoComplete="new-password"
                passwordRules="minlength: 10; required: lower; required: upper; required: digit;"
                secureTextEntry={!showPassword}
                returnKeyType="next"
                editable={!isSubmitting}
                helpText="Use at least 10 characters with at least one letter and one number."
                errorText={attemptedSubmit ? errors.password : undefined}
                accessoryLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                onAccessoryPress={() => setShowPassword((current) => !current)}
              />

              <LabeledTextField
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Re-enter your password"
                textContentType={confirmPasswordTextContentType}
                autoComplete="off"
                secureTextEntry={!showConfirmPassword}
                returnKeyType="done"
                editable={!isSubmitting}
                errorText={attemptedSubmit ? errors.confirmPassword : undefined}
                accessoryLabel={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
                onAccessoryPress={() =>
                  setShowConfirmPassword((current) => !current)
                }
              />
            </View>

            <Pressable
              onPress={() => {
                setAttemptedSubmit(true);
                if (!isValid || isSubmitting) {
                  return;
                }

                onSubmit(password);
              }}
              style={{
                backgroundColor:
                  isValid && !isSubmitting ? theme.primary : theme.border,
                borderRadius: 999,
                paddingHorizontal: 18,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: 8,
                flexDirection: "row",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.background} />
              ) : null}
              <Text
                style={{
                  color: theme.background,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                Update password
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
