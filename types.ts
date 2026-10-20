export type Frequency = "once" | "daily" | "weekly" | "custom";

export interface CustomFrequency {
  type: "weekly" | "monthly";
  target: number; // e.g., 3 times per week, 5 times per month
  // Explicit weekdays (0 = Sunday … 6 = Saturday) the task is due on. Only
  // valid with type "weekly"; when set, `target` always equals its length and
  // the task behaves like "daily, but only on these days".
  weekdays?: number[];
}

/** One time of day a task is due at, with its own reminder bell. */
export interface TaskTime {
  at: string; // "HH:mm", device-local
  remind: boolean;
}

export interface Task {
  id: string;
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency; // Only used when frequency is "custom"
  // Doses per due day, on top of any frequency; absent means 1. A day only
  // counts as done once this many completions are logged on it.
  timesPerDay?: number;
  // Absent = any time of day. Otherwise exactly `timesPerDay` entries,
  // sorted by `at`.
  times?: TaskTime[];
  // Minutes before each belled time the reminder fires (0 = at the time).
  reminderLeadMin?: number;
  // "yyyy-MM-dd"; one-off tasks only. Not due before this day.
  onDay?: string;
  // The CURRENT user's completion dates, one entry per logged dose.
  completions: Date[];
  // Other members' completions as "yyyy-MM-dd" day keys, keyed by userId.
  // The current user never appears here; their history is `completions`.
  memberCompletions?: Record<string, string[]>;
}

/** The timing fields the task editor owns, replaced together on save. */
export type TaskTiming = Pick<
  Task,
  "timesPerDay" | "times" | "reminderLeadMin" | "onDay"
>;

export interface GoalMember {
  userId: string;
  username: string;
  displayName: string;
  isOwner: boolean;
  avatarUri?: string; // data URI synced from profiles.avatar_uri
}

/**
 * Lifecycle: draft (isDraft) → scheduled (startDay in the future) → active →
 * achieved (completedAt). Goals created before the lifecycle feature have
 * neither flag and count as active since creation.
 */
export interface Goal {
  id: string;
  title: string;
  target?: string;
  tasks: Task[];
  createdAt: number;
  completedAt?: number;
  isDraft?: boolean; // drafted, not started yet; never due
  startDay?: string; // "yyyy-MM-dd"; tasks only become due from this day on
  dueDay?: string; // "yyyy-MM-dd"; target date to reach the goal by
  ownerUserId?: string;
  members?: GoalMember[]; // includes the owner, isOwner flagged
  // Accent override chosen by the owner; falls back to a hash of the id.
  color?: string;
  // Public goals are visible (and nudgeable) to all accepted friends, not
  // just members. Goals default to private.
  isPublic?: boolean;
}

export interface FriendProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUri?: string; // data URI synced from profiles.avatar_uri
}

export interface FriendRequest {
  friendshipId: string;
  requester: FriendProfile;
  mutualFriends: number;
  createdAt: number;
}

export interface UserAccount {
  id: string;
  displayName: string;
  username: string;
  email: string;
  createdAt: number;
}
