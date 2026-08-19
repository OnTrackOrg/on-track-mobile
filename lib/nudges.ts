import { Goal } from "../types";
import { getMemberAdherence, hasGoalStarted } from "../store";
import { supabase } from "./supabase";

export type NudgeCandidate = {
  goal: Goal;
  adherence: number;
};

/**
 * Every active goal both people share is nudgeable — encouragement isn't
 * reserved for friends who are behind. The list is sorted so the goals that
 * could use a boost most come first.
 */
export const getNudgeCandidates = (
  goals: Goal[],
  friendUserId: string,
  referenceDate = new Date(),
): NudgeCandidate[] =>
  goals
    .filter(
      (goal) =>
        goal.completedAt === undefined &&
        // Drafts and scheduled goals aren't due yet — nothing to nudge about.
        hasGoalStarted(goal) &&
        goal.members?.some((member) => member.userId === friendUserId),
    )
    .map((goal) => ({
      goal,
      adherence: getMemberAdherence(goal, friendUserId, referenceDate),
    }))
    .sort(
      (a, b) =>
        a.adherence - b.adherence || a.goal.title.localeCompare(b.goal.title),
    );

/**
 * Duplicate-send guard (issue #165): one nudge per friend+goal per cooldown
 * window, tracked in-memory for the session. Deliberately not persisted —
 * it exists to stop double-taps and same-sitting repeats, not to police
 * long-term behavior.
 */
export const NUDGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const sentNudgesAt = new Map<string, number>();

const nudgeKey = (recipientUserId: string, goalId: string) =>
  `${recipientUserId}:${goalId}`;

export const wasRecentlyNudged = (
  recipientUserId: string,
  goalId: string,
  now: number = Date.now(),
): boolean => {
  const sentAt = sentNudgesAt.get(nudgeKey(recipientUserId, goalId));
  return sentAt !== undefined && now - sentAt < NUDGE_COOLDOWN_MS;
};

export const markNudgeSent = (
  recipientUserId: string,
  goalId: string,
  now: number = Date.now(),
): void => {
  sentNudgesAt.set(nudgeKey(recipientUserId, goalId), now);
};

export const resetNudgeHistory = (): void => {
  sentNudgesAt.clear();
};

export const sendNudge = async (
  recipientUserId: string,
  goalId: string,
  message?: string,
): Promise<number> => {
  const { data, error } = await supabase.functions.invoke("send-nudge", {
    body: { recipientUserId, goalId, message: message?.trim() || undefined },
  });
  if (error) throw error;

  const result = data as { delivered?: number } | null;
  if (!result?.delivered) {
    throw new Error("This friend has not enabled push notifications yet.");
  }
  markNudgeSent(recipientUserId, goalId);
  return result.delivered;
};
