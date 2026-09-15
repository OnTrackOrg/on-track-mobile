import React from "react";
import { AppState, Linking } from "react-native";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import LaunchScreen from "./components/LaunchScreen";
import TodayScreen from "./components/TodayScreen";
import GoalsScreen from "./components/GoalsScreen";
import ProfileScreen from "./components/ProfileScreen";
import FriendScreen from "./components/FriendScreen";
import GoalMembersScreen from "./components/GoalMembersScreen";
import FindPeopleScreen from "./components/FindPeopleScreen";
import GoalScreen from "./components/GoalScreen";
import NewGoalScreen from "./components/NewGoalScreen";
import PrivacyScreen from "./components/PrivacyScreen";
import InstructionsScreen from "./components/InstructionsScreen";
import AppTour from "./components/tour/AppTour";
import { TourAnchor, TourAnchorKey } from "./components/tour/TourAnchor";
import AuthScreen from "./components/AuthScreen";
import UpdatePasswordScreen from "./components/UpdatePasswordScreen";
import ImportLocalDataScreen from "./components/ImportLocalDataScreen";
import AccountDeletedScreen from "./components/AccountDeletedScreen";
import { RootStackParamList, TabParamList } from "./navigation";
import { APP_TOUR_STORAGE_KEY, shouldShowAppTour } from "./onboarding";
import { useStore } from "./store";
import { haptics } from "./utils/haptics";
import {
  AuthMode,
  exchangeAuthCodeForSession,
  ensureProfileForUser,
  isAppleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
  SsoCancelledError,
  SsoProvider,
  getPersistedSession,
  requestPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  updateCurrentUserPassword,
} from "./lib/auth";
import {
  fetchAccessibleGoals,
  flushSharedCompletionsForUser,
  replaceRemoteGoalsForUser,
} from "./lib/dataSync";
import { importLocalDataToCloud, pruneDroppedTaskIds } from "./lib/importLocal";
import { fetchPersonalOrder, pushPersonalOrder } from "./lib/orderSync";
import { fetchSocialGraph } from "./lib/social";
import { setAccountDeletedHandler } from "./lib/accountDeleted";
import { supabase } from "./lib/supabase";
import { reconcileAvatarWithProfile } from "./lib/avatar";
import { registerPushTokenForCurrentUser } from "./lib/pushNotifications";
import { useWidgetSync } from "./lib/widgetSync";
import { WidgetLink, parseWidgetLink } from "./lib/widgetLinks";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Lets the app tour drive tab switches from outside the navigator tree.
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const TAB_ICONS: Record<
  keyof TabParamList,
  [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]
> = {
  Today: ["sparkles", "sparkles-outline"],
  Goals: ["flag", "flag-outline"],
  Search: ["search", "search-outline"],
  Profile: ["person", "person-outline"],
};

const TAB_TOUR_ANCHORS: Record<keyof TabParamList, TourAnchorKey> = {
  Today: "tab-today",
  Goals: "tab-goals",
  Search: "tab-search",
  Profile: "tab-profile",
};

function MainTabs() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      // Every tab switch gets a selection tick.
      screenListeners={{
        tabPress: () => {
          void haptics.navigate();
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
        tabBarIcon: ({ focused, color, size }) => (
          <TourAnchor anchorKey={TAB_TOUR_ANCHORS[route.name]}>
            <Ionicons
              name={TAB_ICONS[route.name][focused ? 0 : 1]}
              size={size}
              color={color}
            />
          </TourAnchor>
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      {/* Search (people/goal discovery) is hidden until there are public
          goals worth discovering; SearchScreen stays in the codebase. */}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function ThemedNavigation() {
  const { theme, isDark } = useTheme();
  const goals = useStore((s) => s.goals);
  const setAccount = useStore((s) => s.setAccount);
  const setGoals = useStore((s) => s.setGoals);
  const setSharedGoals = useStore((s) => s.setSharedGoals);
  const setFriendGoals = useStore((s) => s.setFriendGoals);
  const setSocialGraph = useStore((s) => s.setSocialGraph);
  const claimLocalData = useStore((s) => s.claimLocalData);
  const cloudSyncEnabled = useStore((s) => s.cloudSyncEnabled);
  const setCloudSyncEnabled = useStore((s) => s.setCloudSyncEnabled);
  const syncRevision = useStore((s) => s.syncRevision);
  const lastSyncedRevision = useStore((s) => s.lastSyncedRevision);
  const markGoalsSynced = useStore((s) => s.markGoalsSynced);
  const personalOrderRevision = useStore((s) => s.personalOrderRevision);
  const personalOrderSyncedRevision = useStore(
    (s) => s.personalOrderSyncedRevision,
  );
  const adoptPersonalOrder = useStore((s) => s.adoptPersonalOrder);
  const markPersonalOrderSynced = useStore((s) => s.markPersonalOrderSynced);
  const [showAppTour, setShowAppTour] = React.useState(false);
  const [hasHydratedStore, setHasHydratedStore] = React.useState(false);
  const [hasCheckedSession, setHasCheckedSession] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);
  const [authMode, setAuthMode] = React.useState<AuthMode>("sign-up");
  const [appleAvailable, setAppleAvailable] = React.useState(false);

  React.useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  // Home/lock-screen widgets mirror the store once it has hydrated.
  useWidgetSync(hasHydratedStore);

  // A widget tap can arrive before the navigator exists (cold start, or
  // while signed out); it is held until the container reports ready.
  const pendingWidgetLinkRef = React.useRef<WidgetLink | null>(null);
  const openWidgetLink = React.useCallback((link: WidgetLink) => {
    if (!navigationRef.isReady()) {
      pendingWidgetLinkRef.current = link;
      return;
    }
    pendingWidgetLinkRef.current = null;
    const { goals: ownGoals, sharedGoals } = useStore.getState();
    if (
      link.screen === "goal" &&
      [...ownGoals, ...sharedGoals].some((goal) => goal.id === link.goalId)
    ) {
      navigationRef.navigate("Goal", { goalId: link.goalId });
      return;
    }
    navigationRef.navigate("Tabs", {
      screen: link.screen === "today" ? "Today" : "Goals",
    });
  }, []);
  const [authErrorMessage, setAuthErrorMessage] = React.useState<string | null>(
    null,
  );
  const [authInfoMessage, setAuthInfoMessage] = React.useState<string | null>(
    null,
  );
  const [isSubmittingAuth, setIsSubmittingAuth] = React.useState(false);
  const [showPasswordUpdate, setShowPasswordUpdate] = React.useState(false);
  const [passwordUpdateErrorMessage, setPasswordUpdateErrorMessage] =
    React.useState<string | null>(null);
  const [isImportingLocalData, setIsImportingLocalData] = React.useState(false);
  const [importErrorMessage, setImportErrorMessage] = React.useState<
    string | null
  >(null);
  const [hasDismissedImportPrompt, setHasDismissedImportPrompt] =
    React.useState(false);
  const [showAccountDeletedScreen, setShowAccountDeletedScreen] =
    React.useState(false);
  const flushChainRef = React.useRef<Promise<boolean>>(Promise.resolve(true));
  const totalLocalTaskCount = React.useMemo(
    () => goals.reduce((count, goal) => count + goal.tasks.length, 0),
    [goals],
  );

  /**
   * Flush the local revision to Supabase if there is anything unsynced.
   * Returns false on failure; local state is kept and retried on the next
   * mutation or app foreground (social-model.md invariant 3).
   */
  const flushLocalGoals = React.useCallback(
    async (user: User): Promise<boolean> => {
      const s = useStore.getState();
      if (s.syncRevision <= s.lastSyncedRevision) {
        return true;
      }
      const revisionToSync = s.syncRevision;

      try {
        const { droppedTaskIds } = await replaceRemoteGoalsForUser(
          user,
          s.goals,
          s.sharedGoals,
        );
        pruneDroppedTaskIds(droppedTaskIds);
        markGoalsSynced(revisionToSync);
        return true;
      } catch (error) {
        console.error("Failed to flush local goals to Supabase", error);
        return false;
      }
    },
    [markGoalsSynced],
  );

  /**
   * Every flush is serialized through one promise chain so two
   * replaceRemoteGoalsForUser calls can never interleave (the delete+insert
   * of the same completion rows would collide). flushLocalGoals re-reads
   * the store and no-ops when clean, so queued calls always upload the
   * latest state or do nothing.
   */
  const flushSerialized = React.useCallback(
    (user: User): Promise<boolean> => {
      const next = flushChainRef.current.then(() => flushLocalGoals(user));
      flushChainRef.current = next.catch(() => false);
      return next;
    },
    [flushLocalGoals],
  );

  /**
   * Flush-then-fetch (social-model.md invariants 3-5). Local state is only
   * replaced when nothing is left unsynced, and cloud sync / goal
   * replacement / the import prompt are gated on OWNED remote goals only.
   */
  const syncWithRemote = React.useCallback(
    async (user: User) => {
      const preSync = useStore.getState();
      if (preSync.cloudSyncEnabled) {
        await flushSerialized(user);
      } else if (preSync.syncRevision > preSync.lastSyncedRevision) {
        /**
         * Owned goals stay local until the user explicitly imports, but my
         * completion toggles on shared goals still have to reach the server
         * (invariant 1) before the fetch below may replace sharedGoals.
         */
        const revisionToSync = preSync.syncRevision;
        try {
          await flushSharedCompletionsForUser(user, preSync.sharedGoals);
          markGoalsSynced(revisionToSync);
        } catch (error) {
          console.error("Failed to flush shared completions", error);
        }
      }

      const { owned, shared, friendsPublic } = await fetchAccessibleGoals(user);
      // Friends' public goals are never written from this device, so they
      // can always be replaced regardless of the dirty check below.
      setFriendGoals(friendsPublic);

      /**
       * Personal goal/task order: adopt the server copy unless this device
       * has an unsynced reorder (the flush effect below pushes that first).
       * Best-effort, so a missing table or a network blip never blocks goals.
       */
      const orderState = useStore.getState();
      if (
        orderState.personalOrderRevision <= orderState.personalOrderSyncedRevision
      ) {
        try {
          const remoteOrder = await fetchPersonalOrder(user.id);
          if (remoteOrder) {
            adoptPersonalOrder(remoteOrder);
          }
        } catch (error) {
          console.error("Failed to fetch personal order", error);
        }
      }
      const s = useStore.getState();
      // Replace nothing while something is still unsynced (invariants 3-4);
      // a failed flush keeps local state and retries on the next foreground.
      const dirty = s.syncRevision > s.lastSyncedRevision;

      if (s.cloudSyncEnabled) {
        if (!dirty) {
          setGoals(owned);
          setSharedGoals(shared);
        }
      } else if (owned.length > 0) {
        if (!dirty) {
          // Owned cloud data exists, so the cloud copy wins (pre-social behavior).
          setGoals(owned);
          setSharedGoals(shared);
          setCloudSyncEnabled(true);
        }
      } else {
        if (!dirty) {
          setSharedGoals(shared);
        }
        setCloudSyncEnabled(s.goals.length === 0);
      }
    },
    [
      adoptPersonalOrder,
      flushSerialized,
      markGoalsSynced,
      setCloudSyncEnabled,
      setFriendGoals,
      setGoals,
      setSharedGoals,
    ],
  );

  // Push a reordered personal order whenever it changes (last write wins).
  React.useEffect(() => {
    if (!session?.user) {
      return;
    }
    if (personalOrderRevision <= personalOrderSyncedRevision) {
      return;
    }
    const revisionToSync = personalOrderRevision;
    const userId = session.user.id;
    pushPersonalOrder(userId, useStore.getState().personalOrder)
      .then(() => markPersonalOrderSynced(revisionToSync))
      .catch((error) => {
        console.error("Failed to push personal order", error);
      });
  }, [
    markPersonalOrderSynced,
    personalOrderRevision,
    personalOrderSyncedRevision,
    session,
  ]);

  // Best-effort: offline is fine, the persisted cache stays until it works.
  const refreshSocialGraph = React.useCallback(
    (userId: string) => {
      fetchSocialGraph(userId)
        .then(({ friends, friendRequests, sentRequestUserIds }) =>
          setSocialGraph(friends, friendRequests, sentRequestUserIds),
        )
        .catch(() => {});
    },
    [setSocialGraph],
  );

  React.useEffect(() => {
    setAccountDeletedHandler(() => setShowAccountDeletedScreen(true));
    return () => setAccountDeletedHandler(null);
  }, []);

  // Avatars are shared via profiles.avatar_uri; reconcile the device photo
  // with the profile once per sign-in (upload local-only, adopt remote-only).
  React.useEffect(() => {
    if (!session?.user) {
      return;
    }
    void reconcileAvatarWithProfile(session.user.id).catch(() => {});
  }, [session]);

  React.useEffect(() => {
    if (!session?.user) {
      return;
    }
    void registerPushTokenForCurrentUser().catch((error) => {
      console.warn("Push notification registration failed", error);
    });
  }, [session]);

  React.useEffect(() => {
    if (!session?.user) {
      return;
    }
    const user = session.user;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }
      void syncWithRemote(user).catch((error) => {
        console.error("Foreground refresh failed", error);
      });
      refreshSocialGraph(user.id);
    });

    return () => subscription.remove();
  }, [refreshSocialGraph, session, syncWithRemote]);

  React.useEffect(() => {
    let isCancelled = false;

    const hydrateTourState = async () => {
      await useStore.persist.rehydrate();

      const hasCompletedTour = await AsyncStorage.getItem(APP_TOUR_STORAGE_KEY);

      if (isCancelled) {
        return;
      }

      setShowAppTour(
        shouldShowAppTour({ hasCompletedTour: hasCompletedTour !== null }),
      );
      setHasHydratedStore(true);
    };

    void hydrateTourState();

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
          claimLocalData(persistedSession.user.id);

          const syncedAccount = await ensureProfileForUser(
            persistedSession.user,
          );

          if (isActive) {
            setAccount(syncedAccount);
          }

          await syncWithRemote(persistedSession.user);
          refreshSocialGraph(persistedSession.user.id);
        }
      } catch (error) {
        if (isActive) {
          console.error("Failed to hydrate Supabase session", error);
          setAuthErrorMessage(
            "We could not restore your account session. You can sign in again below.",
          );
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
        // Sign-out keeps the local copy (ProfileScreen promises it); a later
        // sign-in by a DIFFERENT account wipes it via claimLocalData below.
        setAccount(null);
        setCloudSyncEnabled(false);
        setHasDismissedImportPrompt(false);
        return;
      }

      /**
       * Synchronously, before the import prompt (or anything else) can read
       * the store: signing in as a different account than the one that
       * wrote the persisted goals/social slices wipes them, so user B never
       * sees or uploads user A's data.
       */
      claimLocalData(nextSession.user.id);

      void ensureProfileForUser(nextSession.user)
        .then(async (syncedAccount) => {
          setAccount(syncedAccount);

          await syncWithRemote(nextSession.user);
          refreshSocialGraph(nextSession.user.id);

          setAuthErrorMessage(null);
          setAuthMode("sign-in");
        })
        .catch((error) => {
          console.error(
            "Failed to sync profile after auth state change",
            error,
          );
          setAuthErrorMessage(
            "We signed you in, but could not finish syncing your profile yet.",
          );
        });
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [
    claimLocalData,
    refreshSocialGraph,
    setAccount,
    setCloudSyncEnabled,
    syncWithRemote,
  ]);

  const handleAuthCallbackUrl = React.useCallback(async (url: string) => {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      return;
    }

    // ontrack://auth/callback in builds; exp://host/--/auth/callback in
    // Expo Go. Anything else is not ours.
    if (
      !`${parsedUrl.hostname}${parsedUrl.pathname}`.includes("auth/callback")
    ) {
      return;
    }

    const code = parsedUrl.searchParams.get("code");
    const callbackType = parsedUrl.searchParams.get("type");

    if (!code) {
      return;
    }

    setAuthErrorMessage(null);
    setPasswordUpdateErrorMessage(null);

    try {
      const nextSession = await exchangeAuthCodeForSession(code);
      setSession(nextSession);

      if (callbackType === "recovery") {
        setShowPasswordUpdate(true);
        return;
      }

      setAuthMode("sign-in");
      setAuthInfoMessage("Your email is verified. You can sign in now.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We could not finish opening that account link.";
      setAuthErrorMessage(message);
    }
  }, []);

  React.useEffect(() => {
    const handleUrl = (url: string) => {
      const widgetLink = parseWidgetLink(url);
      if (widgetLink) {
        openWidgetLink(widgetLink);
        return;
      }
      void handleAuthCallbackUrl(url);
    };

    void Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl(url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleAuthCallbackUrl, openWidgetLink]);

  React.useEffect(() => {
    if (!session?.user || !cloudSyncEnabled) {
      return;
    }

    if (syncRevision <= lastSyncedRevision) {
      return;
    }

    /**
     * Every local mutation bumps a revision number in the store, and this
     * effect best-effort flushes the latest revision to Supabase whenever
     * cloud sync is enabled. We intentionally do not block the UI on this:
     * AsyncStorage already holds the freshest local copy, so failed network
     * writes are retried later without making the app feel offline-hostile.
     * The shared promise chain serializes this against foreground/hydrate
     * flushes, and a queued run that finds nothing unsynced is a no-op.
     */
    void flushSerialized(session.user);
  }, [
    cloudSyncEnabled,
    flushSerialized,
    lastSyncedRevision,
    session,
    syncRevision,
  ]);

  const handleAppTourDone = React.useCallback(() => {
    setShowAppTour(false);
    void AsyncStorage.setItem(APP_TOUR_STORAGE_KEY, "true");
  }, []);

  const handleImportLocalData = React.useCallback(async () => {
    if (!session?.user) {
      return;
    }

    setIsImportingLocalData(true);
    setImportErrorMessage(null);

    try {
      await importLocalDataToCloud(session.user);
      setHasDismissedImportPrompt(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "We could not import this device's local data yet.";
      setImportErrorMessage(message);
    } finally {
      setIsImportingLocalData(false);
    }
  }, [session]);

  const shouldShowImportPrompt = Boolean(
    session &&
    !cloudSyncEnabled &&
    goals.length > 0 &&
    !hasDismissedImportPrompt,
  );

  const handleAuthSubmit = React.useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      setIsSubmittingAuth(true);
      setAuthErrorMessage(null);
      setAuthInfoMessage(null);

      try {
        if (authMode === "sign-up") {
          const result = await signUpWithEmail({ email, password });

          if (!result.session) {
            setAuthMode("sign-in");
            setAuthInfoMessage("Check your inbox to confirm, then sign in.");
          }
          return;
        }

        await signInWithEmail({ email, password });
        setAuthInfoMessage(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Something went wrong. Try again.";
        setAuthErrorMessage(message);
      } finally {
        setIsSubmittingAuth(false);
      }
    },
    [authMode],
  );

  const handleSso = React.useCallback(async (provider: SsoProvider) => {
    setIsSubmittingAuth(true);
    setAuthErrorMessage(null);
    setAuthInfoMessage(null);

    try {
      if (provider === "apple") {
        await signInWithApple();
      } else {
        await signInWithGoogle();
      }
    } catch (error) {
      if (error instanceof SsoCancelledError) return;
      setAuthErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }, []);

  const handlePasswordResetRequest = React.useCallback(
    async (email: string) => {
      setIsSubmittingAuth(true);
      setAuthErrorMessage(null);
      setAuthInfoMessage(null);

      try {
        await requestPasswordReset(email);
        setAuthInfoMessage(
          `We sent a password reset link to ${email.trim().toLowerCase()}.`,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "We could not send the password reset email.";
        setAuthErrorMessage(message);
      } finally {
        setIsSubmittingAuth(false);
      }
    },
    [],
  );

  const handlePasswordUpdateSubmit = React.useCallback(
    async (password: string) => {
      setIsSubmittingAuth(true);
      setPasswordUpdateErrorMessage(null);

      try {
        await updateCurrentUserPassword(password);
        await signOut();
        setSession(null);
        setShowPasswordUpdate(false);
        setAuthMode("sign-in");
        setAuthInfoMessage(
          "Your password was updated. Sign in with your new password.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "We could not update your password.";
        setPasswordUpdateErrorMessage(message);
      } finally {
        setIsSubmittingAuth(false);
      }
    },
    [],
  );

  if (!hasHydratedStore || !hasCheckedSession) {
    return null;
  }

  if (showAccountDeletedScreen) {
    return (
      <>
        <AccountDeletedScreen />
        <StatusBar style={isDark ? "light" : "dark"} />
      </>
    );
  }

  if (showPasswordUpdate) {
    return (
      <>
        <UpdatePasswordScreen
          isSubmitting={isSubmittingAuth}
          errorMessage={passwordUpdateErrorMessage}
          onSubmit={handlePasswordUpdateSubmit}
        />
        <StatusBar style={isDark ? "light" : "dark"} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen
          mode={authMode}
          isSubmitting={isSubmittingAuth}
          errorMessage={authErrorMessage}
          infoMessage={authInfoMessage}
          appleAvailable={appleAvailable}
          onModeChange={(mode) => {
            setAuthMode(mode);
            setAuthErrorMessage(null);
            setAuthInfoMessage(null);
          }}
          onSubmit={handleAuthSubmit}
          onSso={handleSso}
          onPasswordResetRequest={handlePasswordResetRequest}
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

  const baseNavTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    colors: {
      ...baseNavTheme.colors,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      primary: theme.primary,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        const pending = pendingWidgetLinkRef.current;
        if (pending) {
          openWidgetLink(pending);
        }
      }}
    >
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
        <Stack.Screen
          name="Tabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Goal"
          component={GoalScreen}
          options={{ title: "Goal" }}
        />
        <Stack.Screen
          name="NewGoal"
          component={NewGoalScreen}
          options={{ title: "New Goal" }}
        />
        <Stack.Screen
          name="Friend"
          component={FriendScreen}
          options={{ title: "Friend" }}
        />
        <Stack.Screen
          name="GoalMembers"
          component={GoalMembersScreen}
          options={{ title: "Doing this together" }}
        />
        <Stack.Screen
          name="FindPeople"
          component={FindPeopleScreen}
          options={{ title: "Find people" }}
        />
        <Stack.Screen
          name="Instructions"
          component={InstructionsScreen}
          options={{ title: "How It Works" }}
        />
        <Stack.Screen
          name="Privacy"
          component={PrivacyScreen}
          options={{ title: "Privacy & Data" }}
        />
      </Stack.Navigator>
      {/* Overlay tour of the real UI; runs once per device (issue #151). */}
      {showAppTour ? (
        <AppTour navigationRef={navigationRef} onDone={handleAppTourDone} />
      ) : null}
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
          <LaunchScreen />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
