export type Frequency = "once" | "daily" | "weekly" | "custom";

export interface CustomFrequency {
  type: "weekly" | "monthly";
  target: number; // e.g., 3 times per week, 5 times per month
}

export interface Task {
  id: string;
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency; // Only used when frequency is "custom"
  completions: Date[]; // The CURRENT user's completion dates
  // Other members' completions as "yyyy-MM-dd" day keys, keyed by userId.
  // The current user never appears here; their history is `completions`.
  memberCompletions?: Record<string, string[]>;
}

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
