# Money — a cozy home for your wealth

A warm, minimal personal-finance app built around three ideas:

- **Boxes** — the separate places your money lives (cash, accounts, assets, crypto),
  each with its own currency and time-based **effects** like interest, appreciation,
  or inflation.
- **Flows** — expenses, income, and transfers, with a tactile recurring-rhythm control
  instead of a checkbox.
- **Planning** — a projection of where today's choices take your net worth, with a
  scrubbable timeline, real-vs-nominal view, and milestones.

No backend — everything lives in `localStorage`. The business logic is a pure,
framework-free engine so a real API can drop in later.

## Stack

Vite · React · TypeScript · Tailwind v4 · Radix UI · Zustand · Motion · d3 (shape/scale) · date-fns · Vitest

## Architecture

```
src/
  domain/      pure engine — types, money, recurrence, effects, projection (+ tests)
  store/       zustand store, localStorage persistence, seed data, selectors
  ui/          Radix-wrapped, Tailwind-styled primitives
  components/  app shell, navigation, page chrome
  features/    overview · boxes · transactions · planning · settings
  lib/         small utilities (dates, formatting, palette, hooks)
```

The `domain/` folder imports nothing from React or the rest of the app. It is the
single source of truth for how money grows, decays, recurs, and rolls up across
currencies — and it is unit-tested in isolation.

## Develop

```bash
pnpm install
pnpm dev        # start the app
pnpm test       # run the engine tests
pnpm build      # type-check + production build
```

## Design language

Warm, minimal, dark, cozy — Claude/Notion-leaning. A warm near-black canvas with a
soft radial glow, a serif display face (Fraunces) for numbers and headings, a clean
humanist sans (Inter) for everything else, and motion that feels breathable rather
than flashy.
