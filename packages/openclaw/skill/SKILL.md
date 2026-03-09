# jeeves-meta — OpenClaw Skill

## Overview

jeeves-meta is the Jeeves platform's knowledge synthesis engine. It discovers
`.meta/` directories, gathers context from the Qdrant vector index, and uses
a three-step LLM process (architect, builder, critic) to produce structured
synthesis artifacts.

## Available Tools

### synth_list
List all `.meta/` directories with summary stats and per-meta projection.
Supports filtering by path prefix, error status, staleness, and lock state.
Use for engine health checks and finding stale knowledge.

**Parameters:**
- `pathPrefix` (optional): Filter by path prefix (e.g. "github/")
- `filter` (optional): Structured filter (`{ hasError: true }`, `{ staleHours: 24 }`)
- `fields` (optional): Property projection array

### synth_detail
Full detail for a single meta, with optional archive history.

**Parameters:**
- `path` (required): `.meta/` or owner directory path
- `fields` (optional): Property projection
- `includeArchive` (optional): false, true, or number (N most recent)

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

- **Checking synthesis health:** `synth_list`
- **Finding stale knowledge:** `synth_list` with `filter: { staleHours: 24 }`
- **Checking errors:** `synth_list` with `filter: { hasError: true }`
- **Getting full details:** `synth_detail` with optional `includeArchive: 5`
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
