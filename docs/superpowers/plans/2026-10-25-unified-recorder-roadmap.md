# Unified Recorder + Project — Plan Roadmap

**Spec:** `docs/superpowers/specs/2026-10-25-unified-recorder-project-design.md`

The spec has 10 stages across several subsystems. Each plan below ships working,
tested software on its own. Plans after the first are written when the previous
one lands, so they build on the real interfaces rather than guessed ones.

| # | Plan | Spec stages / sections | Status |
|---|------|------------------------|--------|
| 1 | Foundation: one settings source, suites survive restart, structured step model + generator | Stages 1–2; §2, §8 | **Done** — PR #72 |
| 2 | Recorded tests as project files: sidecars, Tests list, code ownership, read-only mode | Stage 3; §3, §4 | **Written** — `2026-10-26-plan-2-project-files.md` |
| 3 | One runner, one dashboard: project runner, step-mapped failures, fix actions | Stage 4; §7 | To write |
| 4 | Navigation: sidebar, `/tests/:id` editor route, Quick record | Stage 5; §1, §8 | To write |
| 5 | Suites = tags | Stage 6; §6 | To write |
| 6 | Elements / page objects: managed regions, element library, re-pick + usage warning | Stage 7; §5, §11 | To write |
| 7 | Gherkin: step vocabulary, `raider_steps.rb`, feature generation | Stage 8; §9, §11 | To write |
| 8 | Git sync | Stage 9; §10 | To write |
| 9 | Recorder coverage + step palette | Stage 10; §13 | To write |

ruby_raider gem changes (§11) are tasks inside the plan that first needs them,
done in a worktree under `~/ruby_raider-worktrees/`.
