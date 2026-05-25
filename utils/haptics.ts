import * as Haptics from "expo-haptics";

const run = async (callback: () => Promise<void>) => {
  try {
    await callback();
  } catch {
    // Haptics are best-effort and should never interrupt the primary action.
  }
};

export const haptics = {
  tap: () => run(() => Haptics.selectionAsync()),
  navigate: () => run(() => Haptics.selectionAsync()),
  toggle: () =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () =>
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  warning: () =>
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
  error: () =>
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
  destructive: () =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
};
