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
import * as AppleAuthentication from "expo-apple-authentication";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import LabeledTextField from "./LabeledTextField";
import BrandMark from "./BrandMark";
import { isValidEmail, isValidPassword } from "../account";
import { AuthMode } from "../lib/auth";

type AuthScreenProps = {
  mode: AuthMode;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  infoMessage?: string | null;
  appleAvailable: boolean;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (input: { email: string; password: string }) => void;
  onAppleSignIn: () => void;
  onPasswordResetRequest?: (email: string) => void;
};

/**
 * Sign-in is provider-first: Apple takes one tap and needs no form. Email + password stays as the fallback below the divider. Names
 * and usernames are derived and editable later from Profile, so nothing
 * here asks for them.
 */
export default function AuthScreen({
  mode,
  isSubmitting = false,
  errorMessage,
  infoMessage,
  appleAvailable,
  onModeChange,
  onSubmit,
  onAppleSignIn,
  onPasswordResetRequest,
}: AuthScreenProps) {
  const { theme, isDark } = useTheme();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = React.useState(false);

  const isSignUp = mode === "sign-up";
  const emailError = isValidEmail(email) ? "" : "Enter a valid email address.";
  const passwordError = isSignUp
    ? isValidPassword(password)
      ? ""
      : "At least 10 characters with a letter and a number."
    : password.length > 0
      ? ""
      : "Enter your password.";
  const isValid = !emailError && !passwordError;

  const submit = () => {
    setAttemptedSubmit(true);
    if (!isValid || isSubmitting) {
      void haptics.error();
      return;
    }
    void haptics.press();
    onSubmit({ email, password });
  };

  const appleSignIn = () => {
    if (isSubmitting) return;
    void haptics.press();
    onAppleSignIn();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingVertical: 32,
            justifyContent: "center",
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={{ alignItems: "center", gap: 12, marginBottom: 32 }}>
            <BrandMark size={76} />
            <Text
              style={{
                color: theme.text,
                fontSize: 15,
                fontWeight: "800",
                letterSpacing: 4,
              }}
            >
              ONTRACK
            </Text>
          </View>

          {/* Apple first; email is the fallback below the divider. */}
          {appleAvailable ? (
            <>
              <AppleAuthentication.AppleAuthenticationButton
                // The native label only updates on remount.
                key={mode}
                buttonType={
                  isSignUp
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={999}
                style={{ height: 50, opacity: isSubmitting ? 0.6 : 1 }}
                onPress={appleSignIn}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginVertical: 22,
                }}
              >
                <View
                  style={{ flex: 1, height: 1, backgroundColor: theme.border }}
                />
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  or
                </Text>
                <View
                  style={{ flex: 1, height: 1, backgroundColor: theme.border }}
                />
              </View>
            </>
          ) : null}

          <View style={{ gap: 12 }}>
            <LabeledTextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              editable={!isSubmitting}
              errorText={attemptedSubmit ? emailError : undefined}
            />
            <LabeledTextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={isSignUp ? "Choose a password" : "Your password"}
              // Without a webcredentials associated domain iOS can't save a
              // generated strong password for us, so sign-up opts out of its
              // yellow strong-password cover ("oneTimeCode" is the only type
              // that does). Never swap the type while the field is in use:
              // iOS then strands its yellow fill over an emptied field.
              textContentType={
                isSignUp
                  ? Platform.OS === "ios"
                    ? "oneTimeCode"
                    : "newPassword"
                  : "password"
              }
              autoComplete={isSignUp ? "new-password" : "password"}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={submit}
              selectTextOnFocus={Platform.OS === "ios"}
              contextMenuHidden={false}
              editable={!isSubmitting}
              errorText={attemptedSubmit ? passwordError : undefined}
              accessoryLabel={showPassword ? "Hide password" : "Show password"}
              onAccessoryPress={() => setShowPassword((current) => !current)}
            />

            {errorMessage ? (
              <Text
                style={{ color: theme.danger, fontSize: 13, lineHeight: 18 }}
              >
                {errorMessage}
              </Text>
            ) : infoMessage ? (
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                {infoMessage}
              </Text>
            ) : null}

            <Pressable
              onPress={submit}
              style={{
                height: 50,
                borderRadius: 999,
                backgroundColor:
                  isValid && !isSubmitting ? theme.primary : theme.border,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                marginTop: 4,
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
                {isSignUp ? "Create account" : "Sign in"}
              </Text>
            </Pressable>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 16,
                marginTop: 6,
              }}
            >
              <Pressable
                onPress={() => {
                  void haptics.toggle();
                  setAttemptedSubmit(false);
                  onModeChange(isSignUp ? "sign-in" : "sign-up");
                }}
                disabled={isSubmitting}
                hitSlop={8}
              >
                <Text style={{ color: theme.primary, fontWeight: "700" }}>
                  {isSignUp ? "I have an account" : "Create an account"}
                </Text>
              </Pressable>
              {!isSignUp && onPasswordResetRequest ? (
                <>
                  <View
                    style={{
                      width: 1,
                      height: 14,
                      backgroundColor: theme.border,
                    }}
                  />
                  <Pressable
                    onPress={() => {
                      if (!isValidEmail(email) || isSubmitting) {
                        setAttemptedSubmit(true);
                        void haptics.error();
                        return;
                      }
                      void haptics.tap();
                      onPasswordResetRequest(email);
                    }}
                    disabled={isSubmitting}
                    hitSlop={8}
                  >
                    <Text
                      style={{ color: theme.textSecondary, fontWeight: "600" }}
                    >
                      Forgot password?
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
