export type Frequency = "once" | "daily" | "weekly" | "custom";

export interface FreezeDay {
  date: string;      // "yyyy-MM-dd" canonical day key
  reason: string;    // required, trimmed, non-empty
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
  completions: Date[]; // Array of completion dates
}

export interface Goal {
  id: string;
  title: string;
  target?: string;
  tasks: Task[];
  createdAt: number;
  completedAt?: number;
}

export interface UserAccount {
  id: string;
  displayName: string;
  username: string;
  email: string;
  createdAt: number;
}
