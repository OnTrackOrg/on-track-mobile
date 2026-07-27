import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const getProjectId = (): string | undefined =>
  Constants.easConfig?.projectId ??
  (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);

/**
 * Best-effort device registration. A declined permission remains a valid
 * choice; friends simply will not receive pushes on that device.
 */
export const registerPushTokenForCurrentUser = async (): Promise<void> => {
  if (Platform.OS === "web") return;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) return;

  const existingPermissions = await Notifications.getPermissionsAsync();
  let status = existingPermissions.status;
  if (status !== "granted") {
    const permissionRequest = await Notifications.requestPermissionsAsync();
    status = permissionRequest.status;
  }
  if (status !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = getProjectId();
  if (!projectId) return;

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId,
    })
  ).data;

  const { error } = await supabase.rpc("register_push_token", {
    device_token: token,
    device_platform: Platform.OS,
  });
  if (error) throw error;
};
