# Time & Projects — spec

A new tab for time and project management. Lives next to the money app, but is
**deliberately decoupled**: its own domain module, its own storage key, its own
feature folder. The two sides only share the app shell, UI primitives, and the
philosophy. Either can be split out later without surgery.

## Philosophy

Same DNA as the money app, applied to hours instead of currency:

- **Plan is a hypothesis, not a contract.** You plan the week, reality deviates,
  and the app treats the gap as data — never as failure. The flow is:
  plan → live → record what actually happened → see the delta → adjust.
- **Nothing gets special treatment.** There is no built-in "work" concept with
  unique powers. A project is a project. Any capability (fixed schedule,
  budgets, quality effects, overlap rules, starvation protection) is an opt-in
  toggle the user turns on for whichever projects need it.
- **An hour is not just a block.** Hours have context: qualities rise and fall
  through the day, projects need and change those qualities, and the system
  uses this to *hint* — never to auto-schedule or nag.

## Core concepts

### Projects

- A project is anything that takes time: a freelance gig, "fun", "entertainment",
  "health", sleep. No type taxonomy — just projects.
- Optional **code** (short slug) enables namespacing: `ent-screen-phone` reads as
  the `phone` sub-project of `screen` under `ent`. Codes are the only hierarchy
  mechanism; sub-projects are ordinary projects that inherit nothing but the
  naming convention and a roll-up.
- **Sub-projects** are the units you track time against. They compete for time
  with their siblings by default; their parent exists for aggregation and
  reporting (e.g. all of `ent-*` rolls up to `ent`). A parent's budget caps
  its children's total — the family fights over a fixed pie.
- **Colors**: auto-assigned from a warm palette harmonized with the app, with
  per-project override. Sub-projects derive as shades of the parent's hue, so
  the family reads as one group on the grid.
- **Blocks** store project id + free-text intent note ("deep work on invoice
  feature"), leaving room for more metadata later.

### Budgets & placement

How a project claims time — per-project settings, nothing built-in:

- **Direct placement**: one-off blocks are dragged onto the grid. Dragging is
  the gesture for anything irregular.
- **Typed rules**: recurring patterns are typed, not dragged — a small text
  rule (`mon–fri 9–5`, `first sat 14:00`) that renders as ordinary blocks on
  the grid. Generated blocks stay individually draggable/deletable; the rule
  is just the fast way to stamp repetition.
- **Budgets**: an amount over a period — `3h/day`, `5h/week`, `10h/month`, or
  a custom window. The suggestion pass proposes placement (respecting slot-fit
  hints and prime-hours weighting); suggestions stay draggable.
- **Session shaping**: optional min/max session length so a `3h` budget
  spreads across the period instead of cramming into one block. A single
  unbroken block (sleep) is just session length == budget amount — no
  separate continuity flag.
- **Elastic ranges**: `3–5h` with an intent:
  - **Maximize** (self-improve): starts at the low end; the sim proposes
    growth toward the cap while marginal hours still look productive, and
    the user confirms.
  - **Minimize** (a habit being fought): a lower goal and an upper cap.
    Under the cap is the goal; over it is tracked, never punished —
    "may fail" is expected output, not an error state.
  - **Target**: a plain amount, no stretch either way.
- **`fr` shares**: for pools that aren't fixed hours — `<n>fr` distributes
  remaining time CSS-style after placed and budgeted claims resolve. Scope is
  chosen per project: siblings splitting the *direct parent's* share, the
  *top-level family's* share, or the *global* free pool.
- **Doesn't fit → it says so**: unplaced remainder shows as a per-project
  badge with reasons (no slots left / quality too low at candidate times)
  plus a weekly summary. Never silently crams.

### Qualities

User-defined meters that make hours unequal. Clamped `[0, max]` — clamps do
the "never negative, stops before extremes" for free.

- **Starting state**: every quality starts the week at full ("perfect"). The
  week wears you down from there; no manual entry needed to bootstrap.
- **Passive drift**: each quality has a time-of-day baseline curve (mental
  decays across waking hours, physical recovers overnight). This alone makes
  9am ≠ 11pm before any project enters the picture.
- **Dependencies**: a quality can declare rules referencing others —
  *"when physical < 30, mental −40%"*. Chains (physical → mental → work
  output) are just qualities referencing qualities; cycles are rejected at
  edit time. Editable in the UI; demo seed data ships a sensible example set.
- **Project effects**: give/take on qualities as *opening cost + per-hour
  rate* (`cost(h) = open + rate·h` — "3 to open, 1 each more hour"). v1 UI
  ships linear; curve shapes (tapering near full, thresholds) are reserved in
  the data model.
- **Requirements**: a project may prefer a quality at some value to run well
  (deep work wants mental ≥ 60) — separate from what it consumes.
- **Prime-hours weighting**: slots carry a built-in, user-tunable "living
  hours" preference (defaults favor evening personal time) so filler logic
  avoids eating prime hours unless nothing else fits.
- **Actual qualities are derived, not recorded**: the actual curve replays
  the same effect math over *actual* blocks and fragments. It diverges from
  the projected curve exactly where the week diverged — for free. Manual
  mood check-ins may come later.

### Simulation & hints (memory)

A small pure engine walks the week in 10-minute steps applying drift + block
effects with clamps and dependency rules, producing a projected quality
timeline. Everything advisory reads from this one pass:

- **The scorer** — one pure function `(project, slot, sim state) → score +
  reasons`, the heart of the engine. Inputs: quality requirements met,
  budget remaining, session shape, distribution preference, prime-hours
  cost, projected quality at that slot. All hints below are views over it.
- **Slot-fit hints**: when planning with a project selected, slots that fit
  its requirements glow softly. Fit = requirement satisfied with least waste —
  the least-demanding project takes the lowest-quality acceptable slot, saving
  peak hours for peak-needy projects (the "smallest fitting" heuristic).
- **Elastic growth proposals**: for maximize projects, the sim flags where
  extra hours would still return value; the user confirms.
- **Warnings**: projected quality crashing mid-week ("mental hits 10 by
  Thursday"), hog signals, neglect signals — all derived, never enforced.
- **Drag feedback**: dragging a block to a worse slot shows a whisper on
  hover, anchored to the best open alternative: *"scores 40 here — best open
  is 85 (Tue 10am), because mental unfit / prime hours"*. Informative, zero
  friction; the drop is never blocked.
- The suggestion pass computes proposals; nothing is ever moved or locked
  automatically. Enforcement is the non-goal, not computation.

### Options at any hour

- Tapping an empty or occupied slot — "now" or any future hour — opens a
  **ranked options list**: every project that could go there, sorted by the
  scorer, each with its reason line. The current occupant is listed too, so
  "keep it" is an explicit choice, not a default.
- Serves two moments: *right now* ("I don't feel like what's planned — what
  are my best options this hour?") and *later* ("what should Tuesday 3pm
  be?"). Same list, same ranking, same sim underneath.
- Picking an option places it (plan mode) or records it (reality mode) —
  the list is the shared entry point for planning and for quick actuals.

### Where a project lives

- The mirror query: clicking a **project** (sidebar, badge, anywhere)
  highlights all its placed blocks on the grid *and* glows its best
  candidate slots, ranked — "you're here, and here's where you'd thrive".
  Average/likely slots are distinguishable from top picks (e.g. strong glow
  vs soft glow).
- **Distribution preference** on budgets: `cluster` (sessions want to be
  together), `scatter` (spread them out), or `don't care`. Applies at
  whatever period the budget uses — a daily `cluster` keeps today's sessions
  adjacent; a weekly `scatter` pushes sessions to different days. The scorer
  respects it, and drag whispers warn when a manual placement fights it.

### The week grid

- Blocked view of the full week, navigable past this week. **Data resolution
  is 10 minutes** — budgets, sessions, and blocks snap to 10-min multiples.
  Display zoom is separate and switchable (20/30 min · 1h · 2h · half-day).
  Week start is a setting, defaults Monday.
- **Competition** between projects is expressed through budgets (above):
  placed and rule-generated claims resolve first, then budgeted and `fr`
  projects share what remains, guided by slot-fit hints.
- **View modes**: `plan / reality / both` (default `both`), segmented control
  above the grid. Plan-mode is where slot-fit hints appear; reality-mode is
  for review; both-mode shows the delta.
- **Plan vs actual rendering**: actuals paint solid over planned tints. A
  block that went as planned looks calm and solid; divergence shows the
  planned tint peeking out. Silence = success — texture only where life
  diverged.
- **Micro-entries**: a thin color-coded strip along the block's left edge,
  stacked slivers when several.
- **Overflow**: the actual fill overruns into neighboring blocks — "work ate
  my evening" is literally visible as paint spilling down.
- **Quality curves**: a slim sparkline strip per day column renders the
  projected and derived-actual quality timelines — same visual family as the
  money app's sparklines.
- **Project sidebar**: every project gets a compact progress strip covering
  all its budget periods — monthly and custom budgets stay visible here even
  though the grid only shows a week.
- **Now**: a single horizontal hairline across the current day.

### Reality layer

- **Quick actuals**: tap a block → ranked options list → pick one. The same
  popover has a `+ fragment` row for micro-entries (project + minutes).
- **Micro-entries**: positionless fragments — a project, a duration, a rough
  time ("just now-ish"). They are deliberately never placed as blocks; that
  lightness is the point. They roll up into project actuals and render as
  the edge strip near when they happened.
- **Overlap accounting** — two named patterns, both first-class:
  - **Overflow**: a project spills into time planned for another.
  - **Concurrent**: fragments inside another project's block. Tracked
    against the fragment's project (no double-counted hours) — but quality
    effects apply honestly: the fragment drains its own qualities *and*
    degrades the host block's output quality (phone during work: phone pays
    mental, and the work hour counts for less).

### Signals

- **Resource hog detection** (heuristic, tunable): consistent actual-vs-plan
  overshoot, repeated overflow into others, or week-over-week share growth
  beyond a threshold. The app surfaces; the user judges.
- **Neglect signals**: a project with no actuals for too long (chores…) gets
  gently surfaced — "untouched for 9 days". The anti-starvation seed, in v1
  as a reminder only.
- **Quality warnings** from the simulation (see above).
- **Unfit reporting**: per-project badges with reasons + weekly summary.
- **Anti-starvation auto-reserve** (later): data model leaves room; not v1.

## Non-goals (v1)

- No enforcement — the app never moves, locks, or schedules blocks on its
  own. Suggestions are computed, always non-binding.
- No anti-starvation auto-reserve (reminders only).
- No effect-curve editing UI (linear only; model reserves curves).
- No manual quality/mood entry (qualities derive from blocks).
- No integration with money features.

## Architecture

```
src/domain/time/     pure engine — projects, budgets, qualities, simulation,
                     scorer, blocks, actuals, overlap rules (+ tests)
src/store/time.ts    separate zustand slice, separate localStorage key
src/features/time/   the tab: week grid, project manager, quality editor,
                     actuals entry
```

- `domain/time/` imports nothing from `domain/` (money) — fully independent,
  unit-tested in isolation, same pure-engine discipline.
- The tab registers in the nav like any other; no money code imports time code.

## Settled decisions

- Week start: setting, defaults Monday. No timezone cleverness.
- Blocks carry project id + intent note.
- Micro-entries: positionless fragments (project + duration + rough time),
  rendered as a color-coded edge strip near the host block.
- Placement: drag for one-off blocks; typed text rules for recurring
  patterns, rendered as editable blocks.
- Base resolution 10 minutes (data and sim step); display zoom separate
  (20/30min · 1h · 2h · half-day).
- Budget periods: daily / weekly / monthly / custom window; all periods get
  a sidebar progress strip, even off-week ones.
- Session shaping covers continuity: one unbroken block = session length ==
  budget amount.
- Elastic maximize: sim proposes growth, user confirms.
- Unfit budgets: per-project badge + reasons + weekly summary.
- Parent budgets cap children's totals; `fr` splits the pie.
- Grid rendering: layered overlay, plus `plan / reality / both` mode toggle.
- Colors: auto-with-override, sub-projects as shades of parent hue.
- Qualities: start the week at full; curves visible on the grid; actual
  curves derived from actual blocks; linear+startup math in v1 UI;
  full-week projection with warnings; flexible durations in v1.
- Concurrent fragments drain their own qualities and degrade host output.
- Drag whispers anchor to the best open slot with scores and reasons.
- Neglect reminders (untouched projects) ship in v1.
- Sleep: an ordinary project — rule-placed, single-session, strong give on
  qualities, rendered dimmed/hatched as background.
