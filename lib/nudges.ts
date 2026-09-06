import { FunctionsHttpError } from "@supabase/supabase-js";
import { Goal } from "../types";
import { getMemberAdherence, hasGoalStarted } from "../store";
import { supabase } from "./supabase";

export type NudgeCandidate = {
  goal: Goal;
  adherence: number;
  // true when I follow this goal only because it is public (not a member).
  isPublicOnly: boolean;
};

const isParticipant = (goal: Goal, userId: string): boolean =>
  goal.ownerUserId === userId ||
  Boolean(goal.members?.some((member) => member.userId === userId));

/**
 * Every active goal a friend is part of that I can see is nudgeable: goals
 * we share as members, plus their public goals. Encouragement isn't
 * reserved for friends who are behind; the list is sorted so the goals that
 * could use a boost most come first.
 */
export const getNudgeCandidates = (
  goals: Goal[],
  friendUserId: string,
  referenceDate = new Date(),
  myUserId?: string,
): NudgeCandidate[] =>
  goals
    .filter(
      (goal) =>
        goal.completedAt === undefined &&
        // Drafts and scheduled goals aren't due yet — nothing to nudge about.
        hasGoalStarted(goal) &&
        isParticipant(goal, friendUserId),
    )
    .map((goal) => ({
      goal,
      adherence: getMemberAdherence(goal, friendUserId, referenceDate),
      isPublicOnly: myUserId !== undefined && !isParticipant(goal, myUserId),
    }))
    .sort(
      (a, b) =>
        a.adherence - b.adherence || a.goal.title.localeCompare(b.goal.title),
    );

/**
 * One nudge per friend + goal per hour. The server enforces this (nudges
 * table); this in-memory mirror keeps the button honest between taps and
 * after a 429 without another round trip.
 */
export const NUDGE_COOLDOWN_MS = 60 * 60 * 1000;
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

/** Minutes until this friend + goal can be nudged again (0 when allowed). */
export const nudgeRetryMinutes = (
  recipientUserId: string,
  goalId: string,
  now: number = Date.now(),
): number => {
  const sentAt = sentNudgesAt.get(nudgeKey(recipientUserId, goalId));
  if (sentAt === undefined) return 0;
  const remaining = NUDGE_COOLDOWN_MS - (now - sentAt);
  return remaining > 0 ? Math.max(1, Math.ceil(remaining / 60_000)) : 0;
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

export class NudgeRateLimitError extends Error {
  retryAfterMinutes: number;

  constructor(retryAfterMinutes: number) {
    super(`You can nudge again in ${retryAfterMinutes} min.`);
    this.name = "NudgeRateLimitError";
    this.retryAfterMinutes = retryAfterMinutes;
  }
}

export const sendNudge = async (
  recipientUserId: string,
  goalId: string,
): Promise<number> => {
  const { data, error } = await supabase.functions.invoke("send-nudge", {
    body: { recipientUserId, goalId },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => ({}))) as {
        error?: string;
        retryAfterMinutes?: number;
      };
      if (error.context.status === 429) {
        const minutes = Math.max(1, Math.round(body.retryAfterMinutes ?? 60));
        // Mirror the server's clock so the button shows the wait right away.
        markNudgeSent(
          recipientUserId,
          goalId,
          Date.now() - (NUDGE_COOLDOWN_MS - minutes * 60_000),
        );
        throw new NudgeRateLimitError(minutes);
      }
      if (typeof body.error === "string") {
        throw new Error(body.error);
      }
    }
    throw error;
  }

  const result = data as { delivered?: number } | null;
  if (!result?.delivered) {
    throw new Error("This friend hasn't turned on notifications yet.");
  }
  markNudgeSent(recipientUserId, goalId);
  return result.delivered;
};
