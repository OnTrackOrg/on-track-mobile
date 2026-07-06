export type Frequency = "once" | "daily" | "weekly" | "custom";

export interface FreezeDay {
  date: string; // "yyyy-MM-dd" canonical day key
  reason: string; // required, trimmed, non-empty
  createdAt: number; // Date.now() at freeze time
}

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
}

export interface Goal {
  id: string;
  title: string;
  target?: string;
  tasks: Task[];
  createdAt: number;
  completedAt?: number;
  ownerUserId?: string;
  members?: GoalMember[]; // includes the owner, isOwner flagged
}

export interface FriendProfile {
  userId: string;
  username: string;
  displayName: string;
}

export interface FriendRequest {
  friendshipId: string;
  requester: FriendProfile;
  mutualFriends: number;
  createdAt: number;
}

export interface TemplateTask {
  title: string;
  frequency: Frequency;
  customFrequency?: CustomFrequency;
}

export interface GoalTemplate {
  id: string;
  title: string;
  tagline?: string;
  authorName: string;
  authorHandle: string;
  tasks: TemplateTask[];
  commitCount: number;
  committed: boolean;
}

export interface UserAccount {
  id: string;
  displayName: string;
  username: string;
  email: string;
  createdAt: number;
}
