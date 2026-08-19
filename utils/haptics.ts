import * as Haptics from "expo-haptics";

const run = async (callback: () => Promise<void>) => {
  try {
    await callback();
  } catch {
    // Haptics are best-effort and should never interrupt the primary action.
  }
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const haptics = {
  tap: () => run(() => Haptics.selectionAsync()),
  navigate: () => run(() => Haptics.selectionAsync()),
  toggle: () =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  // Weightier than toggle: completing a task, firing a primary CTA.
  press: () =>
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
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
  // Little rising burst for the all-done moment, timed with the confetti.
  celebrate: () =>
    run(async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await wait(150);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await wait(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await wait(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }),
};
