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
import { useTheme } from "../contexts/ThemeContext";
import LabeledTextField from "./LabeledTextField";
import {
  buildDefaultUsername,
  getAccountDraftErrors,
  isValidEmail,
  sanitizeUsernameInput,
} from "../account";
import { AuthMode } from "../lib/auth";

type AuthScreenProps = {
  mode: AuthMode;
  pendingVerificationEmail?: string | null;
  hasExistingData: boolean;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  infoMessage?: string | null;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (input: {
    displayName: string;
    username: string;
    email: string;
    password: string;
  }) => void;
  onResendVerification?: (email: string) => void;
  onPasswordResetRequest?: (email: string) => void;
};

export default function AuthScreen({
  mode,
  pendingVerificationEmail,
  hasExistingData,
  isSubmitting = false,
  errorMessage,
  infoMessage,
  onModeChange,
  onSubmit,
  onResendVerification,
  onPasswordResetRequest,
}: AuthScreenProps) {
  const { theme } = useTheme();
  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = React.useState(false);

  const isSignUp = mode === "sign-up";
  const passwordFieldTextContentType =
    Platform.OS === "ios" && showPassword
      ? "oneTimeCode"
      : isSignUp
        ? "newPassword"
        : "password";
  const confirmPasswordTextContentType =
    Platform.OS === "ios" && showConfirmPassword ? "oneTimeCode" : "password";
  const signUpErrors = getAccountDraftErrors(
    displayName,
    username,
    email,
    password,
    confirmPassword,
  );
  const signInEmailError = isValidEmail(email)
    ? ""
    : "Enter a valid email address.";
  const signInPasswordError = password.length > 0 ? "" : "Enter your password.";
  const isSignUpValid = Object.values(signUpErrors).every((error) => !error);
  const isSignInValid = isValidEmail(email) && password.length > 0;
  const isValid = isSignUp ? isSignUpValid : isSignInValid;

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
              <Ionicons
                name="cloud-done-outline"
                size={42}
                color={theme.primary}
              />
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
                {isSignUp
                  ? "Welcome! Let’s set up your account."
                  : "Welcome back"}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 15,
                  lineHeight: 22,
                  textAlign: "center",
                }}
              >
                {isSignUp
                  ? hasExistingData
                    ? "Create your account first. We’ll ask before importing existing device data into the cloud."
                    : "Create your account now so your OnTrack data can sync and back up across devices."
                  : "Sign in to restore your synced OnTrack data on this device."}
              </Text>
            </View>

            {pendingVerificationEmail ? (
              <View
                style={{
                  gap: 10,
                  padding: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                }}
              >
                <Text
                  style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}
                >
                  Check your email to finish signup
                </Text>
                <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
                  We created your account for {pendingVerificationEmail}.
                  Supabase is set to require email verification before the first
                  sign in.
                </Text>
                {onResendVerification ? (
                  <Pressable
                    onPress={() =>
                      onResendVerification(pendingVerificationEmail)
                    }
                  >
                    <Text style={{ color: theme.primary, fontWeight: "700" }}>
                      Resend verification email
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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

            {infoMessage ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
                  {infoMessage}
                </Text>
              </View>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                backgroundColor: theme.surface,
                borderRadius: 999,
                padding: 4,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              {(
                [
                  { key: "sign-up", label: "Sign up" },
                  { key: "sign-in", label: "Sign in" },
                ] as const
              ).map((option) => {
                const active = option.key === mode;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => onModeChange(option.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: active ? theme.primary : "transparent",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: active ? theme.background : theme.textSecondary,
                        fontWeight: "700",
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: 14 }}>
              {isSignUp ? (
                <>
                  <LabeledTextField
                    label="Display name"
                    value={displayName}
                    onChangeText={(text) => {
                      setDisplayName(text);
                      if (!username.trim()) {
                        setUsername(buildDefaultUsername(text));
                      }
                    }}
                    placeholder="Adam"
                    autoCapitalize="words"
                    textContentType="name"
                    returnKeyType="next"
                    editable={!isSubmitting}
                    errorText={
                      attemptedSubmit ? signUpErrors.displayName : undefined
                    }
                  />
                  <LabeledTextField
                    label="Username"
                    value={username}
                    onChangeText={(text) =>
                      setUsername(sanitizeUsernameInput(text))
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="adam"
                    textContentType="username"
                    autoComplete="username"
                    returnKeyType="next"
                    editable={!isSubmitting}
                    helpText="3-32 characters. Letters, numbers, periods, underscores, and hyphens are allowed."
                    errorText={
                      attemptedSubmit ? signUpErrors.username : undefined
                    }
                  />
                </>
              ) : null}

              <LabeledTextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="adam@example.com"
                textContentType="emailAddress"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                editable={!isSubmitting}
                errorText={
                  attemptedSubmit
                    ? isSignUp
                      ? signUpErrors.email
                      : signInEmailError
                    : undefined
                }
              />
              <LabeledTextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={
                  isSignUp ? "Choose a password" : "Enter your password"
                }
                textContentType={passwordFieldTextContentType}
                autoComplete={isSignUp ? "new-password" : "password"}
                passwordRules="minlength: 10; required: lower; required: upper; required: digit;"
                secureTextEntry={!showPassword}
                returnKeyType={isSignUp ? "next" : "done"}
                selectTextOnFocus={Platform.OS === "ios"}
                contextMenuHidden={false}
                editable={!isSubmitting}
                helpText={
                  isSignUp
                    ? "Use at least 10 characters with at least one letter and one number."
                    : undefined
                }
                errorText={
                  attemptedSubmit
                    ? isSignUp
                      ? signUpErrors.password
                      : signInPasswordError
                    : undefined
                }
                accessoryLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                onAccessoryPress={() => setShowPassword((current) => !current)}
              />

              {isSignUp ? (
                <LabeledTextField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Re-enter your password"
                  textContentType={confirmPasswordTextContentType}
                  autoComplete="off"
                  secureTextEntry={!showConfirmPassword}
                  returnKeyType="done"
                  selectTextOnFocus={Platform.OS === "ios"}
                  contextMenuHidden={false}
                  editable={!isSubmitting}
                  errorText={
                    attemptedSubmit ? signUpErrors.confirmPassword : undefined
                  }
                  accessoryLabel={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                  onAccessoryPress={() =>
                    setShowConfirmPassword((current) => !current)
                  }
                />
              ) : null}
            </View>

            {!isSignUp && onPasswordResetRequest ? (
              <Pressable
                onPress={() => {
                  setAttemptedSubmit(true);
                  if (!isValidEmail(email) || isSubmitting) {
                    return;
                  }

                  onPasswordResetRequest(email);
                }}
                disabled={isSubmitting}
                style={{
                  alignSelf: "center",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: theme.primary, fontWeight: "700" }}>
                  Forgot password?
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                setAttemptedSubmit(true);
                if (!isValid || isSubmitting) {
                  return;
                }

                onSubmit({ displayName, username, email, password });
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
                {isSignUp ? "Create account" : "Sign in"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
