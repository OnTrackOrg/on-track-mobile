import { supabase } from "./supabase";
import { PersonalOrder, normalizePersonalOrder } from "./personalOrder";

/**
 * The user's private goal/task order, one row per user in
 * `user_orderings` (RLS: owner only). It is preference data, so it syncs on
 * a simple last-write-wins basis independent of the goals revision flush,
 * and a failure here never blocks goal sync.
 */
const TABLE = "user_orderings";

export const fetchPersonalOrder = async (
  userId: string,
): Promise<PersonalOrder | null> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select("goal_order, task_order")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return normalizePersonalOrder({
    goals: data.goal_order,
    tasks: data.task_order,
  });
};

export const pushPersonalOrder = async (
  userId: string,
  order: PersonalOrder,
): Promise<void> => {
  const { error } = await supabase.from(TABLE).upsert({
    user_id: userId,
    goal_order: order.goals,
    task_order: order.tasks,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
};
