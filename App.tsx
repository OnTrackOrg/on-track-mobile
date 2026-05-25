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
import CompletedGoalsScreen from "./components/CompletedGoalsScreen";
import OverviewScreen from "./components/OverviewScreen";
import PrivacyScreen from "./components/PrivacyScreen";
import InstructionsScreen from "./components/InstructionsScreen";
import IntroductionWizard from "./components/IntroductionWizard";
import AuthScreen from "./components/AuthScreen";
import ImportLocalDataScreen from "./components/ImportLocalDataScreen";
import AccountDeletedScreen from "./components/AccountDeletedScreen";
import { RootStackParamList } from "./navigation";
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
import { fetchRemoteGoalsForUser } from "./lib/dataSync";
import { replaceRemoteGoalsForUser } from "./lib/dataSync";
import { supabase } from "./lib/supabase";

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemedNavigation() {
  const { theme, isDark } = useTheme();
  const goals = useStore((s) => s.goals);
  const setAccount = useStore((s) => s.setAccount);
  const setGoals = useStore((s) => s.setGoals);
  const cloudSyncEnabled = useStore((s) => s.cloudSyncEnabled);
  const setCloudSyncEnabled = useStore((s) => s.setCloudSyncEnabled);
  const syncRevision = useStore((s) => s.syncRevision);
  const lastSyncedRevision = useStore((s) => s.lastSyncedRevision);
  const markGoalsSynced = useStore((s) => s.markGoalsSynced);
  const [showIntroduction, setShowIntroduction] = React.useState(false);
  const [hasCheckedIntroduction, setHasCheckedIntroduction] = React.useState(false);
  const [hasCheckedSession, setHasCheckedSession] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);
  const [authMode, setAuthMode] = React.useState<AuthMode>("sign-up");
  const [authErrorMessage, setAuthErrorMessage] = React.useState<string | null>(null);
  const [authInfoMessage, setAuthInfoMessage] = React.useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = React.useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = React.useState(false);
  const [isImportingLocalData, setIsImportingLocalData] = React.useState(false);
  const [importErrorMessage, setImportErrorMessage] = React.useState<string | null>(null);
  const [hasDismissedImportPrompt, setHasDismissedImportPrompt] = React.useState(false);
  const [showAccountDeletedScreen, setShowAccountDeletedScreen] = React.useState(false);
  const syncInFlightRevisionRef = React.useRef<number | null>(null);
  const totalLocalTaskCount = React.useMemo(
    () => goals.reduce((count, goal) => count + goal.tasks.length, 0),
    [goals]
  );

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

      setShowIntroduction(true);
      setHasCheckedIntroduction(true);
    };

    void hydrateIntroductionState();

    return () => {
      isCancelled = true;
    };
  }, []);

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
          const remoteGoals = await fetchRemoteGoalsForUser(persistedSession.user);
          const existingLocalGoals = useStore.getState().goals;

          if (isActive) {
            setAccount(syncedAccount);

            /**
             * For now we only replace local goals when the server actually has
             * a cloud copy. That protects users who already have purely local
             * device data until the import flow lands in a later slice.
             */
            if (remoteGoals.length > 0) {
              setGoals(remoteGoals);
              setCloudSyncEnabled(true);
            } else {
              setCloudSyncEnabled(existingLocalGoals.length === 0);
            }
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
        setCloudSyncEnabled(false);
        setHasDismissedImportPrompt(false);
        return;
      }

      void Promise.all([
        ensureProfileForUser(nextSession.user),
        fetchRemoteGoalsForUser(nextSession.user),
      ])
        .then(([syncedAccount, remoteGoals]) => {
          const existingLocalGoals = useStore.getState().goals;

          setAccount(syncedAccount);

          if (remoteGoals.length > 0) {
            setGoals(remoteGoals);
            setCloudSyncEnabled(true);
          } else {
            setCloudSyncEnabled(existingLocalGoals.length === 0);
          }

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
  }, [setAccount, setCloudSyncEnabled, setGoals]);

  React.useEffect(() => {
    if (!session?.user || !cloudSyncEnabled) {
      return;
    }

    if (syncRevision <= lastSyncedRevision) {
      return;
    }

    if (syncInFlightRevisionRef.current === syncRevision) {
      return;
    }

    syncInFlightRevisionRef.current = syncRevision;
    const goalsToSync = useStore.getState().goals;
    const revisionToSync = syncRevision;

    /**
     * This effect is the first cloud write bridge. Every local mutation bumps a
     * revision number in the store, and this effect best-effort flushes the
     * latest revision to Supabase whenever cloud sync is enabled.
     *
     * We intentionally do not block the UI on this. AsyncStorage already holds
     * the freshest local copy, so failed network writes can be retried later
     * without making the app feel offline-hostile.
     */
    void replaceRemoteGoalsForUser(session.user, goalsToSync)
      .then(({ goals: syncedGoals, hadLegacyIds }) => {
        if (hadLegacyIds) {
          setGoals(syncedGoals);
        }

        markGoalsSynced(revisionToSync);
      })
      .catch((error) => {
        console.error("Failed to flush local goals to Supabase", error);
      })
      .finally(() => {
        if (syncInFlightRevisionRef.current === revisionToSync) {
          syncInFlightRevisionRef.current = null;
        }
      });
  }, [cloudSyncEnabled, lastSyncedRevision, markGoalsSynced, session, syncRevision]);

  const handleIntroductionDone = React.useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    setShowIntroduction(false);
  }, []);

  const handleImportLocalData = React.useCallback(async () => {
    if (!session?.user) {
      return;
    }

    setIsImportingLocalData(true);
    setImportErrorMessage(null);

    try {
      /**
       * The import flow is intentionally explicit. If the device already had a
       * local-only copy of the user's data, we wait for a yes/no choice here
       * instead of silently uploading that history during sign-in.
       */
      const { goals: importedGoals, hadLegacyIds } = await replaceRemoteGoalsForUser(session.user, goals);

      if (hadLegacyIds) {
        /**
         * Once legacy local ids have been upgraded for the cloud import, we
         * replace the in-memory/local store with the UUID-backed version so all
         * future syncs continue using the server-compatible ids.
         */
        setGoals(importedGoals);
      }

      setCloudSyncEnabled(true);
      markGoalsSynced(syncRevision);
      setHasDismissedImportPrompt(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not import this device's local data yet.";
      setImportErrorMessage(message);
    } finally {
      setIsImportingLocalData(false);
    }
  }, [goals, markGoalsSynced, session, setCloudSyncEnabled, setGoals, syncRevision]);

  const shouldShowImportPrompt = Boolean(
    session &&
    !cloudSyncEnabled &&
    goals.length > 0 &&
    !hasDismissedImportPrompt
  );

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

  if (showAccountDeletedScreen) {
    return (
      <>
        <AccountDeletedScreen />
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

  if (shouldShowImportPrompt) {
    return (
      <>
        <ImportLocalDataScreen
          goalCount={goals.length}
          taskCount={totalLocalTaskCount}
          isImporting={isImportingLocalData}
          errorMessage={importErrorMessage}
          onImport={handleImportLocalData}
          onSkip={() => {
            setImportErrorMessage(null);
            setHasDismissedImportPrompt(true);
          }}
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
        <Stack.Screen name="Home" options={{ title: "OnTrack" }}>
          {(props) => (
            <HomeScreen
              {...props}
              onAccountDeleted={() => {
                setShowAccountDeletedScreen(true);
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Goal" component={GoalScreen} options={{ title: "Goal" }} />
        <Stack.Screen name="NewGoal" component={NewGoalScreen} options={{ title: "New Goal" }} />
        <Stack.Screen name="CompletedGoals" component={CompletedGoalsScreen} options={{ title: "Completed Goals" }} />
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
