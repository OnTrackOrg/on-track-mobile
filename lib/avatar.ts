import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "./persistence";
import { supabase } from "./supabase";

/**
 * Avatars were device-local only, so friends always saw initials. The photo
 * now also lives on profiles.avatar_uri; friends read it through the
 * public_profiles view.
 */

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
 * On sign-in, make the device and the profile agree: a photo that only
 * exists locally (picked before this feature shipped) is uploaded; a photo
 * that only exists remotely (fresh install) is adopted locally. When both
 * exist the local one stays — it is what the user last picked on this
 * device. Returns the URI the device should display.
 */
export const reconcileAvatarWithProfile = async (
  userId: string,
): Promise<string | null> => {
  const local = await AsyncStorage.getItem(STORAGE_KEYS.avatar);

  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_uri")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const remote = (data?.avatar_uri as string | null) ?? null;

  if (local && !remote) {
    await uploadAvatarToProfile(userId, local);
    return local;
  }
  if (!local && remote) {
    await AsyncStorage.setItem(STORAGE_KEYS.avatar, remote);
    return remote;
  }
  return local ?? remote;
};
