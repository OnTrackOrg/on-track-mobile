<div align="center">
  <img src="./assets/icon.png" alt="icon" width="200"/>
</div>

# OnTrack

OnTrack is a social habit tracking mobile app built with React Native and Expo. Goals and tasks are stored locally first and synced to a Supabase account, with friends, shared goals, and a curated goal template catalog on top.

## What the app does

- Create goals with tasks and track daily completions
- View progress with heatmaps, progress rings, and streaks
- Add friends (request/accept) and search for people
- Share goals with friends via goal memberships and see each member's adherence
- Browse curated public goal templates and commit to them as private goals
- Sync data to a Supabase account (local-first, background flush)

## Tech stack

- React Native + Expo
- TypeScript
- Zustand (state + AsyncStorage persistence)
- Supabase (auth, Postgres with RLS, edge functions)
- React Navigation (4-tab layout: Today, Goals, Search, Profile)

## Local development

### Prerequisites

- Node.js 18+
- npm
- Expo-compatible iOS simulator, Android emulator, or physical device

### Install

```bash
git clone https://github.com/OnTrackOrg/on-track-mobile.git OnTrack
cd OnTrack
npm install
```

### Run

```bash
npm start
```

Useful shortcuts:

- `npm run ios`
- `npm run android`
- `npm run web`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`

### Testing

OnTrack uses Jest with `jest-expo` and React Native Testing Library. Run the suite with `npm test`.

## Project structure

```text
OnTrack/
├── assets/            # App icons and bundled images
├── components/        # Screens (Today/Goals/Search/Profile, Goal, Auth, ...) and shared UI (Avatar, Heatmap, ProgressRing)
├── contexts/          # ThemeContext
├── docs/              # Product and engineering docs
├── lib/               # auth, dataSync, social, supabase client, persistence, reminders, dateContext
├── supabase/          # SQL migrations, edge functions, config
├── tests/             # Jest tests (plus co-located *.test.ts files)
├── utils/             # Small helpers (haptics)
├── App.tsx            # Root component: session gating, sync orchestration, navigation
├── navigation.ts      # Route/tab param types
├── store.ts           # Zustand state and persistence
├── types.ts           # Shared TypeScript types
└── README.md
```

## Documentation map

- `README.md`: quick start and repo overview
- `TODO.md`: lightweight backlog notes not yet formalized as issues
- `docs/social-model.md`: friends, shared goals, templates, and the sync invariants
- `docs/account-sync-foundation.md`: auth, session persistence, and the local-data import flow
- `docs/app-store-submission-checklist.md`: App Review prep
- `docs/supabase-branching.md`: Supabase environment workflow

## Notes

- Prefer GitHub Issues as the source of truth for actionable work.
- Use `TODO.md` for lightweight backlog notes, not detailed execution plans.
