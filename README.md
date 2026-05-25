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
git clone https://github.com/KyleNewbigging/OnTrack.git
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
├── components/   # UI screens and reusable visual components
├── contexts/     # React context providers
├── docs/         # Supporting project documentation
├── tests/        # Jest unit tests
├── scripts/      # Utility scripts
├── App.tsx       # App entry component
├── store.ts      # Zustand state and persistence
├── types.ts      # Shared TypeScript types
└── README.md
```

## Documentation map

- `README.md`: quick start and repo overview
- `AGENTS.md`: how Hugo should operate in this repo
- `TODO.md`: backlog notes that are not yet formalized as issues
- `docs/`: focused supporting docs

## Notes

- The current repo includes both product work and agent-assisted workflow docs.
- Prefer GitHub Issues as the source of truth for actionable work.
- Use `TODO.md` for lightweight backlog notes, not detailed execution plans.
