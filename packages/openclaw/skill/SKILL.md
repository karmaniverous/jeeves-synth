# jeeves-synth — OpenClaw Skill

## Overview

jeeves-synth is the Jeeves platform's knowledge synthesis engine. It discovers
`.meta/` directories, gathers context from the Qdrant vector index, and uses
a three-step LLM process (architect, builder, critic) to produce structured
synthesis artifacts.

## Available Tools

### synth_status
Engine overview: total metas discovered, stale count, most recently synthesized,
and the stalest candidate. Use this to check engine health.

### synth_entities
List all `.meta/` directories with per-entity details: staleness, depth,
last synthesized timestamp, error status, and lock status.

### synth_preview
Dry-run for the next synthesis cycle. Shows scope files, delta files,
architect trigger reasons, steer status, and structure changes — without
running any LLM calls. Use before `synth_trigger` to understand what
will happen.

### synth_trigger
Manually trigger a full synthesis cycle (architect → builder → critic) for
a specific meta or the next-stalest candidate.

**Parameters:**
- `path` (optional): Specific `.meta/` or owner directory path. If omitted,
  synthesizes the stalest candidate.

## When to Use

- **Checking synthesis health:** `synth_status`
- **Finding stale knowledge:** `synth_entities` → look for high staleness
- **Understanding what a cycle will do:** `synth_preview`
- **Forcing a refresh:** `synth_trigger` with optional path
- **Reading synthesis output:** Use `watcher_search` with domain `synth-meta`

## Key Concepts

- **Steering (`_steer`):** Human-written prompt in `meta.json` that guides
  synthesis focus. The only field humans typically write.
- **Staleness:** Time since last synthesis. Deeper metas (leaves) update more
  often than rollup metas (parents).
- **Three steps:** Architect crafts the task brief, Builder produces content,
  Critic evaluates quality. The feedback loop self-improves over cycles.
- **Archives:** Each cycle creates a timestamped snapshot in `.meta/archive/`.

## Gotchas

- `synth_trigger` runs a full LLM cycle (3 subprocess calls). It can take
  several minutes.
- A locked meta (another synthesis in progress) will be skipped silently.
- First-run quality is lower — the feedback loop needs 2-3 cycles to calibrate.
