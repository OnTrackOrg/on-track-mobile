import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { STORAGE_KEYS } from "./persistence";
import { supabase } from "./supabase";

/**
 * My profile photo. profiles.avatar_uri is the source of truth (friends
 * read it through the public_profiles view); the device keeps a copy so
 * the photo shows offline, and one shared store so every screen updates
 * the moment it changes.
 */

type MyAvatarState = { uri: string | null };

export const useMyAvatar = create<MyAvatarState>(() => ({ uri: null }));

const setLocalAvatar = async (uri: string | null): Promise<void> => {
  useMyAvatar.setState({ uri });
  try {
    if (uri) {
      await AsyncStorage.setItem(STORAGE_KEYS.avatar, uri);
    } else {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.avatar,
        STORAGE_KEYS.avatarPendingUpload,
      ]);
    }
  } catch {
    // The in-memory photo still shows; the next launch reconciles.
  }
};

/** Show the device copy right away at launch, before any network. */
export const loadMyAvatar = async (): Promise<void> => {
  try {
    const uri = await AsyncStorage.getItem(STORAGE_KEYS.avatar);
    useMyAvatar.setState({ uri });
  } catch {
    // Initials until the reconcile lands.
  }
};

export const uploadAvatarToProfile = async (
  userId: string,
  uri: string,
): Promise<void> => {
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_uri: uri })
    .eq("id", userId);
  if (error) throw error;
};

/**
 * A newly picked photo: show it everywhere at once, then publish it. If the
 * upload fails (offline) it is marked pending so the next reconcile uploads
 * it instead of replacing it with the older profile photo.
 */
export const saveMyAvatar = async (
  uri: string,
  userId: string | null,
): Promise<void> => {
  await setLocalAvatar(uri);
  try {
    if (!userId) throw new Error("Not signed in");
    await uploadAvatarToProfile(userId, uri);
    await AsyncStorage.removeItem(STORAGE_KEYS.avatarPendingUpload);
  } catch {
    await AsyncStorage.setItem(STORAGE_KEYS.avatarPendingUpload, "1").catch(
      () => {},
    );
  }
};

/** Forget the photo on this device (sign-out, account deletion). */
export const clearMyAvatar = (): Promise<void> => setLocalAvatar(null);

/**
 * On sign-in, make the device match the profile: a pick that never made it
 * up is uploaded now; otherwise the profile's photo wins, so a photo changed
 * on another device shows here too, and a photo left over from another
 * account on this device is dropped.
 */
export const reconcileAvatarWithProfile = async (
  userId: string,
): Promise<void> => {
  const [local, pending] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.avatar),
    AsyncStorage.getItem(STORAGE_KEYS.avatarPendingUpload),
  ]);

  if (local && pending) {
    await uploadAvatarToProfile(userId, local);
    await AsyncStorage.removeItem(STORAGE_KEYS.avatarPendingUpload);
    useMyAvatar.setState({ uri: local });
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_uri")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const remote = (data?.avatar_uri as string | null) ?? null;
  if (remote !== local) {
    await setLocalAvatar(remote);
  } else {
    useMyAvatar.setState({ uri: remote });
  }
};
