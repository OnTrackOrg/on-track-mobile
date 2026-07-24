import { Goal } from "../types";
import { getMemberAdherence } from "../store";
import { supabase } from "./supabase";

const NUDGE_ADHERENCE_THRESHOLD = 0.7;

export type NudgeCandidate = {
  goal: Goal;
  adherence: number;
};

/**
 * A nudge must be about a goal both people share, and only appears when the
 * friend's recent progress shows that the goal needs encouragement.
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
        goal.members?.some((member) => member.userId === friendUserId),
    )
    .map((goal) => ({
      goal,
      adherence: getMemberAdherence(goal, friendUserId, referenceDate),
    }))
    .filter(({ adherence }) => adherence < NUDGE_ADHERENCE_THRESHOLD)
    .sort(
      (a, b) =>
        a.adherence - b.adherence || a.goal.title.localeCompare(b.goal.title),
    );

export const sendNudge = async (
  recipientUserId: string,
  goalId: string,
): Promise<number> => {
  const { data, error } = await supabase.functions.invoke("send-nudge", {
    body: { recipientUserId, goalId },
  });
  if (error) throw error;

  const result = data as { delivered?: number } | null;
  if (!result?.delivered) {
    throw new Error("This friend has not enabled push notifications yet.");
  }
  return result.delivered;
};
