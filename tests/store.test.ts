import { getCustomFrequencyProgress, getGoalProgress, getGoalStreak, getSampleGoals, isOnceTaskCompletedOnDate, useStore } from '../store';
import { FreezeDay, Goal, Task } from '../types';
import { format, startOfWeek } from 'date-fns';

describe('getCustomFrequencyProgress', () => {
  it('counts weekly custom completions inside the active week', () => {
    const task: Task = {
      id: 'task-1',
      title: 'Workout',
      frequency: 'custom',
      customFrequency: { type: 'weekly', target: 3 },
      completions: [
        new Date('2026-04-19T12:00:00.000Z'),
        new Date('2026-04-20T12:00:00.000Z'),
        new Date('2026-04-21T12:00:00.000Z'),
        new Date('2026-04-10T12:00:00.000Z'),
      ],
    };

    const progress = getCustomFrequencyProgress(task, new Date('2026-04-22T12:00:00.000Z'));

    expect(progress.completed).toBe(3);
    expect(progress.target).toBe(3);
    expect(progress.achieved).toBe(true);
  });

  it('does not count completions from outside the active month for monthly custom tasks', () => {
    const task: Task = {
      id: 'task-2',
      title: 'Read',
      frequency: 'custom',
      customFrequency: { type: 'monthly', target: 5 },
      completions: [
        new Date('2026-04-01T12:00:00.000Z'),
        new Date('2026-04-07T12:00:00.000Z'),
        new Date('2026-04-15T12:00:00.000Z'),
        new Date('2026-04-20T12:00:00.000Z'),
        new Date('2026-03-30T12:00:00.000Z'),
      ],
    };

    const progress = getCustomFrequencyProgress(task, new Date('2026-04-21T12:00:00.000Z'));

    expect(progress.completed).toBe(4);
    expect(progress.target).toBe(5);
    expect(progress.achieved).toBe(false);
  });
});

describe('getSampleGoals', () => {
  it('includes some demo completions for today so first-launch progress is visible', () => {
    const todayKey = new Date().toDateString();
    const goals = getSampleGoals();

    const todayCompletionCount = goals
      .flatMap((goal) => goal.tasks)
      .flatMap((task) => task.completions)
      .filter((completion) => completion.toDateString() === todayKey).length;

    expect(todayCompletionCount).toBeGreaterThan(0);
  });
});

describe('isOnceTaskCompletedOnDate', () => {
  it('returns true when a once task was completed on the selected day', () => {
    const task: Task = {
      id: 'task-3',
      title: 'Book dentist appointment',
      frequency: 'once',
      completions: [new Date('2026-04-21T12:00:00.000Z')],
    };

    expect(isOnceTaskCompletedOnDate(task, new Date('2026-04-21T18:00:00.000Z'))).toBe(true);
  });

  it('returns false on later days even if the once task was completed in the past', () => {
    const task: Task = {
      id: 'task-4',
      title: 'Replace passport photo',
      frequency: 'once',
      completions: [new Date('2026-04-20T12:00:00.000Z')],
    };

    expect(isOnceTaskCompletedOnDate(task, new Date('2026-04-21T12:00:00.000Z'))).toBe(false);
  });
});

describe('getGoalProgress', () => {
  it('counts daily, weekly, custom, and completed once tasks with current behavior', () => {
    const goal: Goal = {
      id: 'goal-progress-1',
      title: 'Fitness',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'daily-task',
          title: 'Water',
          frequency: 'daily',
          completions: [new Date('2026-05-12T12:00:00.000Z')],
        },
        {
          id: 'weekly-task',
          title: 'Workout',
          frequency: 'weekly',
          completions: [new Date('2026-05-10T12:00:00.000Z')],
        },
        {
          id: 'custom-task',
          title: 'Read',
          frequency: 'custom',
          customFrequency: { type: 'weekly', target: 2 },
          completions: [
            new Date('2026-05-11T12:00:00.000Z'),
            new Date('2026-05-12T12:00:00.000Z'),
          ],
        },
        {
          id: 'once-task',
          title: 'Buy shoes',
          frequency: 'once',
          completions: [new Date('2026-05-01T12:00:00.000Z')],
        },
      ],
    };

    expect(getGoalProgress(goal, new Date('2026-05-12T18:00:00.000Z'))).toEqual({
      completed: 4,
      total: 4,
      percent: 1,
      isComplete: true,
    });
  });

  it('keeps incomplete once tasks in the denominator until they are done', () => {
    const goal: Goal = {
      id: 'goal-progress-2',
      title: 'Setup',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'task-daily-only',
          title: 'Stretch',
          frequency: 'daily',
          completions: [new Date('2026-05-12T12:00:00.000Z')],
        },
        {
          id: 'task-once-only',
          title: 'Renew license',
          frequency: 'once',
          completions: [],
        },
      ],
    };

    expect(getGoalProgress(goal, new Date('2026-05-12T18:00:00.000Z'))).toEqual({
      completed: 1,
      total: 2,
      percent: 0.5,
      isComplete: false,
    });
  });

  it('returns zero progress when a goal only has incomplete once tasks', () => {
    const goal: Goal = {
      id: 'goal-progress-3',
      title: 'Errands',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'task-once-only',
          title: 'Renew license',
          frequency: 'once',
          completions: [],
        },
      ],
    };

    expect(getGoalProgress(goal, new Date('2026-05-12T18:00:00.000Z'))).toEqual({
      completed: 0,
      total: 1,
      percent: 0,
      isComplete: false,
    });
  });

  it('returns zero progress for goals with no tasks', () => {
    const goal: Goal = {
      id: 'goal-progress-4',
      title: 'Empty goal',
      createdAt: Date.now(),
      tasks: [],
    };

    expect(getGoalProgress(goal, new Date('2026-05-12T18:00:00.000Z'))).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
      isComplete: false,
    });
  });
});

describe('account setup state', () => {
  afterEach(() => {
    useStore.setState({
      goals: [],
      selectedDate: new Date('2026-05-01T12:00:00.000Z'),
      account: null,
    });
  });

  it('creates a normalized account profile for future sync and communication features', () => {
    useStore.getState().createAccount(' Adam Lin ', ' Adam.Chat ', ' Adam@Example.com ');

    const account = useStore.getState().account;

    expect(account).toMatchObject({
      displayName: 'Adam Lin',
      username: 'adam.chat',
      email: 'adam@example.com',
    });
    expect(account?.id).toBeTruthy();
  });

  it('keeps the account profile when resetting app data', () => {
    useStore.getState().createAccount('Adam Lin', 'adam', 'adam@example.com');
    useStore.setState({
      goals: getSampleGoals(),
      selectedDate: new Date('2026-04-20T12:00:00.000Z'),
    });

    useStore.getState().resetAppData();

    expect(useStore.getState().goals).toEqual([]);
    expect(useStore.getState().account).toMatchObject({
      displayName: 'Adam Lin',
      username: 'adam',
      email: 'adam@example.com',
    });
  });
});

describe('updateGoal', () => {
  const originalState = useStore.getState();

  afterEach(() => {
    useStore.setState(originalState, true);
  });

  it('updates a goal target without affecting its tasks', () => {
    useStore.setState({
      ...originalState,
      goals: [
        {
          id: 'goal-1',
          title: 'Fitness',
          target: 'Run a 5k',
          createdAt: Date.now(),
          tasks: [
            {
              id: 'task-1',
              title: 'Run',
              frequency: 'daily',
              completions: [new Date('2026-04-20T12:00:00.000Z')],
            },
          ],
        },
      ],
    });

    useStore.getState().updateGoal('goal-1', { target: 'Run a 10k' });

    const updatedGoal = useStore.getState().goals[0];
    expect(updatedGoal.target).toBe('Run a 10k');
    expect(updatedGoal.tasks).toHaveLength(1);
    expect(updatedGoal.tasks[0].title).toBe('Run');
    expect(updatedGoal.tasks[0].completions).toHaveLength(1);
  });

  it('clears a goal target when null is provided', () => {
    useStore.setState({
      ...originalState,
      goals: [
        {
          id: 'goal-2',
          title: 'Nutrition',
          target: '2000 calories',
          createdAt: Date.now(),
          tasks: [],
        },
      ],
    });

    useStore.getState().updateGoal('goal-2', { target: null });

    expect(useStore.getState().goals[0].target).toBeUndefined();
  });
});

// ─── Freeze Days ─────────────────────────────────────────────────────────────

describe('freeze day store actions', () => {
  const originalState = useStore.getState();

  afterEach(() => {
    useStore.setState(originalState, true);
  });

  it('freezeDay persists a freeze with the given reason', () => {
    const date = new Date('2026-05-10T12:00:00.000Z');
    const result = useStore.getState().freezeDay(date, 'Family emergency');

    expect(result).toBe(true);
    const frozen = useStore.getState().frozenDays;
    expect(frozen).toHaveLength(1);
    expect(frozen[0].date).toBe('2026-05-10');
    expect(frozen[0].reason).toBe('Family emergency');
  });

  it('freezeDay rejects empty or whitespace-only reasons', () => {
    const date = new Date('2026-05-10T12:00:00.000Z');
    const result = useStore.getState().freezeDay(date, '   ');

    expect(result).toBe(false);
    expect(useStore.getState().frozenDays).toHaveLength(0);
  });

  it('unfreezeDay removes the freeze for the given date', () => {
    const date = new Date('2026-05-10T12:00:00.000Z');
    useStore.getState().freezeDay(date, 'Travel day');
    useStore.getState().unfreezeDay(date);

    expect(useStore.getState().frozenDays).toHaveLength(0);
  });

  it('isDayFrozen returns true for a frozen date and false otherwise', () => {
    const date = new Date('2026-05-10T12:00:00.000Z');
    useStore.getState().freezeDay(date, 'Illness');

    expect(useStore.getState().isDayFrozen(date)).toBe(true);
    expect(useStore.getState().isDayFrozen(new Date('2026-05-11T12:00:00.000Z'))).toBe(false);
  });

  it('getFreezeReason returns the reason for a frozen date', () => {
    const date = new Date('2026-05-10T12:00:00.000Z');
    useStore.getState().freezeDay(date, 'Doctor appointment');

    expect(useStore.getState().getFreezeReason(date)).toBe('Doctor appointment');
    expect(useStore.getState().getFreezeReason(new Date('2026-05-11T12:00:00.000Z'))).toBeUndefined();
  });

  it('re-freezing the same day updates the reason (upsert)', () => {
    const date = new Date('2026-05-10T12:00:00.000Z');
    useStore.getState().freezeDay(date, 'First reason');
    useStore.getState().freezeDay(date, 'Updated reason');

    const frozen = useStore.getState().frozenDays;
    expect(frozen).toHaveLength(1);
    expect(frozen[0].reason).toBe('Updated reason');
  });
});

// ─── getGoalStreak with frozen days ──────────────────────────────────────────

// Helper: get a local date key (yyyy-MM-dd) for N days ago, matching how
// getGoalStreak uses format(currentDate, "yyyy-MM-dd") with local time.
function localDateKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDate(daysAgo: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

describe('getGoalStreak with frozen days', () => {
  it('daily streak: frozen gap day does not break the streak', () => {
    // today=0, yesterday=1, twoDaysAgo=2 (frozen), threeDaysAgo=3
    const task: Task = {
      id: 'streak-daily-relative',
      title: 'Meditate',
      frequency: 'daily',
      completions: [
        localDate(0),  // today
        localDate(1),  // yesterday
        // localDate(2) is the gap (frozen)
        localDate(3),  // 3 days ago
      ],
    };
    const frozenDays: FreezeDay[] = [
      { date: localDateKey(2), reason: 'Travel', createdAt: Date.now() },
    ];

    // Without freeze: streak = 2 (today + yesterday, then gap breaks)
    expect(getGoalStreak(task, [])).toBe(2);
    // With freeze: streak = 3 (today, yesterday, frozen gap skipped without incrementing, 3 days ago)
    // Frozen days are neutral — they don't break the chain but also don't count toward the streak.
    expect(getGoalStreak(task, frozenDays)).toBe(3);
  });

  it('daily streak: non-frozen gap still breaks the streak', () => {
    const task: Task = {
      id: 'streak-daily-break',
      title: 'Run',
      frequency: 'daily',
      completions: [
        localDate(0),  // today
        localDate(1),  // yesterday
        // localDate(2) is NOT frozen and NOT completed — streak breaks here
        localDate(3),  // 3 days ago
      ],
    };

    // No freeze: streak = 2 (today + yesterday, then gap breaks)
    expect(getGoalStreak(task, [])).toBe(2);
    // Even with an unrelated freeze, the gap still breaks
    const unrelatedFreeze: FreezeDay[] = [
      { date: '2020-01-01', reason: 'Old freeze', createdAt: Date.now() },
    ];
    expect(getGoalStreak(task, unrelatedFreeze)).toBe(2);
  });

  it('weekly streak: all 7 days frozen in a gap week bridges to an older completed week', () => {
    // This week: has completion → streak=1
    // Last week: has completion → streak=2
    // Two weeks ago: all 7 days frozen (no completion) → skip, streak stays 2
    // Three weeks ago: has completion → streak=3
    // Four weeks ago: no completion, not frozen → break
    const thisWeekDate = new Date();
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const threeWeeksAgoDate = new Date();
    threeWeeksAgoDate.setDate(threeWeeksAgoDate.getDate() - 21);

    const task: Task = {
      id: 'streak-weekly-frozen',
      title: 'Clean house',
      frequency: 'weekly',
      completions: [
        thisWeekDate,
        lastWeekDate,
        threeWeeksAgoDate,
      ],
    };

    // Freeze all 7 days of the week two weeks ago (the gap week)
    const frozenDays: FreezeDay[] = [];
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const weekStart = startOfWeek(twoWeeksAgo, { weekStartsOn: 0 });
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      frozenDays.push({ date: format(d, 'yyyy-MM-dd'), reason: 'Vacation', createdAt: Date.now() });
    }

    // Without freeze: streak = 2 (this week + last week, then gap breaks)
    expect(getGoalStreak(task, [])).toBe(2);
    // With all 7 days frozen in the gap week: streak = 3 (bridges to three weeks ago)
    expect(getGoalStreak(task, frozenDays)).toBe(3);
  });

  it('weekly streak: partially frozen week still breaks the streak', () => {
    const thisWeekDate = new Date();
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const threeWeeksAgoDate = new Date();
    threeWeeksAgoDate.setDate(threeWeeksAgoDate.getDate() - 21);

    const task: Task = {
      id: 'streak-weekly-partial-freeze',
      title: 'Clean house',
      frequency: 'weekly',
      completions: [
        thisWeekDate,
        lastWeekDate,
        threeWeeksAgoDate,
      ],
    };

    // Freeze only 3 days of the week two weeks ago (not all 7)
    const frozenDays: FreezeDay[] = [];
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const weekStart = startOfWeek(twoWeeksAgo, { weekStartsOn: 0 });
    for (let i = 0; i < 3; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      frozenDays.push({ date: format(d, 'yyyy-MM-dd'), reason: 'Sick', createdAt: Date.now() });
    }

    // Streak should still be 2 because the gap week is not fully frozen
    expect(getGoalStreak(task, frozenDays)).toBe(2);
  });

  it('custom weekly streak: freeze-adjusted target allows streak to continue', () => {
    // Task requires 3 times per week
    // This week: 3 completions → achieved → streak=1
    // Last week: 2 completions + 1 frozen → adjusted target = max(2, 3-1) = 2 → achieved → streak=2
    // Two weeks ago: 1 completion + 2 frozen → adjusted target = max(2, 3-2) = 2 → NOT achieved (1 < 2) → break
    const thisWeekDate = new Date();
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const twoWeeksAgoDate = new Date();
    twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);

    const task: Task = {
      id: 'streak-custom-weekly',
      title: 'Go to gym',
      frequency: 'custom',
      customFrequency: { type: 'weekly', target: 3 },
      completions: [
        // This week: 3 completions
        thisWeekDate,
        new Date(thisWeekDate.getFullYear(), thisWeekDate.getMonth(), thisWeekDate.getDate() - 1),
        new Date(thisWeekDate.getFullYear(), thisWeekDate.getMonth(), thisWeekDate.getDate() - 2),
        // Last week: 2 completions
        lastWeekDate,
        new Date(lastWeekDate.getFullYear(), lastWeekDate.getMonth(), lastWeekDate.getDate() - 1),
      ],
    };

    // Freeze 1 day in last week and 2 days in two weeks ago
    const frozenDays: FreezeDay[] = [];
    // Last week: freeze 1 day (so adjusted target = max(2, 3-1) = 2, completed = 2 → achieved)
    const lastWeekFreeze = new Date(lastWeekDate);
    lastWeekFreeze.setDate(lastWeekFreeze.getDate() + 2);
    frozenDays.push({ date: format(lastWeekFreeze, 'yyyy-MM-dd'), reason: 'Travel', createdAt: Date.now() });

    // Two weeks ago: freeze 2 days, 1 completion (adjusted target = max(2, 3-2) = 2, completed = 1 → NOT achieved)
    const weekStart = startOfWeek(twoWeeksAgoDate, { weekStartsOn: 0 });
    for (let i = 0; i < 2; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      frozenDays.push({ date: format(d, 'yyyy-MM-dd'), reason: 'Sick', createdAt: Date.now() });
    }
    // Add 1 completion in that week
    const completionDate = new Date(weekStart);
    completionDate.setDate(completionDate.getDate() + 2);
    task.completions.push(completionDate);

    // With freeze adjustment: streak = 2 (this week + last week, then two weeks ago fails)
    expect(getGoalStreak(task, frozenDays)).toBe(2);

    // Without freezes: last week only has 2/3 → NOT achieved, so streak = 1
    expect(getGoalStreak(task, [])).toBe(1);
  });
});
