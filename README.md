<div align="center">
  <img src="./assets/icon.png" alt="icon" width="200"/>
</div>

# OnTrack

OnTrack is a habit tracking mobile app built with React Native and Expo. It focuses on simple goal management, daily task completion, and visual consistency tracking.

## What the app does

- Create goals with an optional target
- Add tasks to each goal
- Track completions over time
- View progress with heatmaps and summaries
- Persist data locally on-device

## Tech stack

- React Native
- Expo
- TypeScript
- Zustand
- AsyncStorage

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

OnTrack uses Jest with `jest-expo` and React Native Testing Library for unit-level testing.

Run the test suite with:

```bash
npm test
```

This is intended as the foundation for adding regression tests around existing bugs and future behavior changes.

Useful local checks:

```bash
npm run typecheck
npm run lint
```

## Project structure

```text
OnTrack/
├── assets/       # App icons and bundled images
├── components/   # UI screens and reusable visual components
├── contexts/     # React context providers
├── docs/         # Product and technical notes
├── lib/          # Shared app logic and integrations
├── supabase/     # SQL migrations and edge function sources
├── tests/        # Jest test files
├── utils/        # Small reusable helpers
├── App.tsx       # App entry component
├── navigation.ts # Navigation types and route definitions
├── store.ts      # Zustand state and persistence
├── types.ts      # Shared TypeScript types
└── README.md
```

## Documentation map

- `README.md`: quick start and repo overview
- `TODO.md`: backlog notes that are not yet formalized as issues
- `docs/`: focused product and engineering docs
- `supabase/`: backend-related migrations and functions used by the app

## Notes

- The current repo includes both product work and agent-assisted workflow docs.
- Prefer GitHub Issues as the source of truth for actionable work.
- Use `TODO.md` for lightweight backlog notes, not detailed execution plans.
