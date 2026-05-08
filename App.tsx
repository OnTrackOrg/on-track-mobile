import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session } from "@supabase/supabase-js";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import HomeScreen from "./components/HomeScreen";
import GoalScreen from "./components/GoalScreen";
import NewGoalScreen from "./components/NewGoalScreen";
import OverviewScreen from "./components/OverviewScreen";
import PrivacyScreen from "./components/PrivacyScreen";
import InstructionsScreen from "./components/InstructionsScreen";
import IntroductionWizard from "./components/IntroductionWizard";
import AuthScreen from "./components/AuthScreen";
import { ONBOARDING_STORAGE_KEY, shouldShowOnboarding } from "./onboarding";
import { useStore } from "./store";
import {
  AuthMode,
  ensureProfileForUser,
  getPersistedSession,
  resendSignupVerification,
  signInWithEmail,
  signUpWithEmail,
} from "./lib/auth";
import { supabase } from "./lib/supabase";

type RootStackParamList = {
  Home: undefined;
  Goal: { goalId: string };
  NewGoal: undefined;
  Consistency: { goalId: string };
  Privacy: undefined;
  Instructions: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemedNavigation() {
  const { theme, isDark } = useTheme();
  const goals = useStore((s) => s.goals);
  const seedDemoData = useStore((s) => s.seedDemoData);
  const setAccount = useStore((s) => s.setAccount);
  const [showIntroduction, setShowIntroduction] = React.useState(false);
  const [hasCheckedIntroduction, setHasCheckedIntroduction] = React.useState(false);
  const [hasCheckedSession, setHasCheckedSession] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);
  const [authMode, setAuthMode] = React.useState<AuthMode>("sign-up");
  const [authErrorMessage, setAuthErrorMessage] = React.useState<string | null>(null);
  const [authInfoMessage, setAuthInfoMessage] = React.useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = React.useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = React.useState(false);

  React.useEffect(() => {
    let isCancelled = false;

    const hydrateIntroductionState = async () => {
      await useStore.persist.rehydrate();

      const hasCompletedOnboarding = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      const hasExistingGoals = useStore.getState().goals.length > 0;

      if (isCancelled) {
        return;
      }

      const shouldIntroduceUser = shouldShowOnboarding({
        hasCompletedOnboarding: Boolean(hasCompletedOnboarding),
        hasExistingGoals,
      });

      if (!shouldIntroduceUser) {
        setShowIntroduction(false);
        setHasCheckedIntroduction(true);
        return;
      }

      seedDemoData();
      setShowIntroduction(true);
      setHasCheckedIntroduction(true);
    };

    void hydrateIntroductionState();

    return () => {
      isCancelled = true;
    };
  }, [seedDemoData]);

  React.useEffect(() => {
    let isActive = true;

    const hydrateSession = async () => {
      try {
        /**
         * Session bootstrap is separate from the Zustand rehydrate above.
         * Zustand restores the app's cached local state, while Supabase restores
         * the auth token pair that keeps the user signed in across launches.
         */
        const persistedSession = await getPersistedSession();

        if (!isActive) {
          return;
        }

        setSession(persistedSession);

        if (persistedSession?.user) {
          const syncedAccount = await ensureProfileForUser(persistedSession.user);
          if (isActive) {
            setAccount(syncedAccount);
          }
        }
      } catch (error) {
        if (isActive) {
          console.error("Failed to hydrate Supabase session", error);
          setAuthErrorMessage("We could not restore your account session. You can sign in again below.");
        }
      } finally {
        if (isActive) {
          setHasCheckedSession(true);
        }
      }
    };

    void hydrateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession?.user) {
        setAccount(null);
        return;
      }

      void ensureProfileForUser(nextSession.user)
        .then((syncedAccount) => {
          setAccount(syncedAccount);
          setAuthErrorMessage(null);
          setPendingVerificationEmail(null);
          setAuthMode("sign-in");
        })
        .catch((error) => {
          console.error("Failed to sync profile after auth state change", error);
          setAuthErrorMessage("We signed you in, but could not finish syncing your profile yet.");
        });
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [setAccount]);

  const handleIntroductionDone = React.useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setShowIntroduction(false);
  }, []);

  const handleAuthSubmit = React.useCallback(async ({
    displayName,
    username,
    email,
    password,
  }: {
    displayName: string;
    username: string;
    email: string;
    password: string;
  }) => {
    setIsSubmittingAuth(true);
    setAuthErrorMessage(null);
    setAuthInfoMessage(null);

    try {
      if (authMode === "sign-up") {
        const result = await signUpWithEmail({ displayName, username, email, password });

        setPendingVerificationEmail(email.trim().toLowerCase());
        setAuthMode("sign-in");
        setAuthInfoMessage(
          result.session
            ? "Your account was created and you are signed in."
            : "Your account was created. Check your inbox, verify your email, then sign in."
        );
        return;
      }

      await signInWithEmail({ email, password });
      setAuthInfoMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while contacting Supabase.";
      setAuthErrorMessage(message);
    } finally {
      setIsSubmittingAuth(false);
    }
  }, [authMode]);

  const handleResendVerification = React.useCallback(async (email: string) => {
    setIsSubmittingAuth(true);
    setAuthErrorMessage(null);

    try {
      await resendSignupVerification(email);
      setAuthInfoMessage(`We sent another verification email to ${email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not resend the verification email.";
      setAuthErrorMessage(message);
    } finally {
      setIsSubmittingAuth(false);
    }
  }, []);

  if (!hasCheckedIntroduction || !hasCheckedSession) {
    return null;
  }

  if (showIntroduction) {
    return (
      <>
        <IntroductionWizard onDone={handleIntroductionDone} />
        <StatusBar style={isDark ? "light" : "dark"} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          mode={authMode}
          pendingVerificationEmail={pendingVerificationEmail}
          hasExistingData={goals.length > 0}
          isSubmitting={isSubmittingAuth}
          errorMessage={authErrorMessage}
          infoMessage={authInfoMessage}
          onModeChange={(mode) => {
            setAuthMode(mode);
            setAuthErrorMessage(null);
            setAuthInfoMessage(null);
          }}
          onSubmit={handleAuthSubmit}
          onResendVerification={handleResendVerification}
        />
        <StatusBar style={isDark ? "light" : "dark"} />
      </>
    );
  }
  
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.surface,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "OnTrack" }} />
        <Stack.Screen name="Goal" component={GoalScreen} options={{ title: "Goal" }} />
        <Stack.Screen name="NewGoal" component={NewGoalScreen} options={{ title: "New Goal" }} />
        <Stack.Screen name="Consistency" component={OverviewScreen} options={{ title: "Consistency" }} />
        <Stack.Screen name="Instructions" component={InstructionsScreen} options={{ title: "How It Works" }} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: "Privacy & Data" }} />
      </Stack.Navigator>
      <StatusBar style={isDark ? "light" : "dark"} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedNavigation />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
