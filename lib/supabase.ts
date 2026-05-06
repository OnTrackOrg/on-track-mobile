import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

/**
 * We read Supabase config from a few places so local development, EAS builds,
 * and future environment-based setups can all work without changing the app code.
 *
 * Order of precedence:
 * 1. Expo extra config (best for mobile builds)
 * 2. EXPO_PUBLIC_* env vars (best for local Expo dev)
 * 3. NEXT_PUBLIC_* env vars (temporary compatibility with values Adam pasted)
 */
const expoExtra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

const supabaseUrl =
  expoExtra.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabasePublishableKey =
  expoExtra.supabasePublishableKey ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase configuration. Set supabaseUrl/supabasePublishableKey in app config or EXPO_PUBLIC/NEXT_PUBLIC env vars."
  );
}

/**
 * AsyncStorage-backed auth persistence is what keeps users signed in across:
 * - Expo development sessions
 * - TestFlight installs
 * - production mobile installs
 *
 * Zustand still owns the live UI state, but Supabase auth needs its own durable
 * session storage so a user does not have to sign in every time the app opens.
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
