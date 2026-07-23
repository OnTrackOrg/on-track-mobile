// Every goal gets a stable accent color used for its edge bar, ring, strip,
// and heatmap (per the redesign mockups). Derived from the goal id so it
// needs no schema change and matches across devices/members.
const GOAL_PALETTE = [
  "#ef4444", // red
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ec4899", // pink
  "#0d9488", // teal
  "#f97316", // orange
] as const;

export const goalColor = (goalId: string): string => {
  let hash = 0;
  for (let i = 0; i < goalId.length; i++) {
    hash = (hash * 31 + goalId.charCodeAt(i)) >>> 0;
  }
  return GOAL_PALETTE[hash % GOAL_PALETTE.length];
};
