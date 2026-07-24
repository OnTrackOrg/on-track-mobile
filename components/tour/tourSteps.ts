import { TabParamList } from "../../navigation";
import { TourAnchorKey } from "./TourAnchor";

export type TourStep = {
  key: string;
  title: string;
  text: string;
  /** Shown instead of `text` when the user has no active goals yet. */
  textWhenEmpty?: string;
  /** Tab to switch to before this step is shown. */
  tab?: keyof TabParamList;
  /** Anchors tried in order; the first one that measures wins. None match = centered card over a full dim. */
  anchors?: TourAnchorKey[];
  spotlightPadding?: number;
  spotlightRadius?: number;
};

// The tour has to read well over ANY account state: brand-new (no goals),
// long-time users with many goals, and shared-goal-only users. Steps with
// data-dependent anchors declare fallbacks and empty-state copy.
export const TOUR_STEPS: TourStep[] = [
  {
    key: "welcome",
    title: "Welcome to OnTrack",
    text: "Here's a quick tour of how goals and tasks work. It takes under a minute — skip anytime.",
  },
  {
    key: "goals-tab",
    title: "It starts with a goal",
    text: "Everything you're working toward lives in the Goals tab.",
    tab: "Goals",
    anchors: ["tab-goals"],
    spotlightPadding: 18,
    spotlightRadius: 999,
  },
  {
    key: "goal-cards",
    title: "Goals hold your progress",
    text: "The ring shows today's progress and the strip shows your last 14 days. Tap a goal anytime to see its tasks, heatmaps, and streaks.",
    textWhenEmpty:
      "Your goals will live here. Each goal tracks today's progress plus a 14-day consistency strip, and holds the tasks that move it forward.",
    tab: "Goals",
    anchors: ["goals-card"],
    spotlightPadding: 6,
    spotlightRadius: 20,
  },
  {
    key: "new-goal",
    title: "Create goals with “+ New”",
    text: "Give a goal a title and an optional target, then add the tasks that will get you there.",
    tab: "Goals",
    anchors: ["goals-new-button"],
    spotlightPadding: 10,
    spotlightRadius: 999,
  },
  {
    key: "today",
    title: "Tasks due land in Today",
    text: "Tasks are the repeating steps inside a goal — daily, weekly, or a custom pace like 3× a week. Whatever is due shows up here.",
    tab: "Today",
    anchors: ["tab-today"],
    spotlightPadding: 18,
    spotlightRadius: 999,
  },
  {
    key: "check-off",
    title: "Check tasks off as you go",
    text: "Tap a task to mark it done. Finishing everything keeps your streaks alive and fills in your heatmaps.",
    textWhenEmpty:
      "Once you have goals, each day's tasks appear here — tap one to mark it done and keep your streaks alive.",
    tab: "Today",
    anchors: ["today-task", "today-summary"],
    spotlightPadding: 6,
    spotlightRadius: 20,
  },
  {
    key: "search",
    title: "Better together",
    text: "Search finds your friends — add them to share goals and keep each other on track.",
    tab: "Search",
    anchors: ["tab-search"],
    spotlightPadding: 18,
    spotlightRadius: 999,
  },
  {
    key: "profile",
    title: "Make it yours",
    text: "Profile holds your account, appearance themes, and privacy settings.",
    tab: "Profile",
    anchors: ["tab-profile"],
    spotlightPadding: 18,
    spotlightRadius: 999,
  },
  {
    key: "done",
    title: "You're all set",
    text: "That's the whole loop: set goals, do the tasks, keep the streaks. Let's get you on track.",
  },
];
