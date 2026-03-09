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

## Configuration

### Config File

Location determined by `JEEVES_META_CONFIG` env var or plugin `configPath` setting.
Canonical deployment: `J:\config\jeeves-meta.config.json`.

Key settings:
| Setting | Default | Description |
|---------|---------|-------------|
| `watchPaths` | (required) | Array of paths to scan for `.meta/` directories |
| `watcherUrl` | (required) | Watcher service URL (e.g. `http://localhost:1936`) |
| `gatewayUrl` | `http://127.0.0.1:3000` | OpenClaw gateway URL for subprocess spawning |
| `architectEvery` | 10 | Re-run architect every N cycles even if structure unchanged |
| `depthWeight` | 0.5 | Exponent for depth-based scheduling (0 = pure staleness) |
| `maxArchive` | 20 | Max archived snapshots per meta |
| `maxLines` | 500 | Max lines for builder context |
| `architectTimeout` | 120s | Architect subprocess timeout |
| `builderTimeout` | 600s | Builder subprocess timeout |
| `criticTimeout` | 300s | Critic subprocess timeout |

### Prompt Customization

Default prompts live at `J:\config\jeeves-meta\prompts\{architect,critic}.md`,
referenced via `@file:` in the config:

```json
{
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md"
}
```

**Per-meta overrides:** Set `_architect` or `_critic` directly in a `meta.json`
to override the defaults for that specific entity.

### Adding New Domains

1. Create a `.meta/` directory under the domain path
2. The engine auto-creates `meta.json` with a UUID on first discovery
3. Optionally set `_steer`, `_depth`, and `_emphasis` in `meta.json`
4. The entity appears in `synth_list` on the next cycle

### Tuning Scheduling

- **`_depth`:** Higher = updates more often. Defaults from tree nesting.
- **`_emphasis`:** Per-meta multiplier (default 1). Set 2 to double depth effect, 0 to ignore depth.
- **`depthWeight`:** Global exponent. Set 0 for pure staleness rotation.

## Bootstrapping

### Prerequisites

Before the synthesis engine can operate:

1. **jeeves-watcher** must be running and indexing data
   - Verify: `curl http://localhost:1936/status` should return point count > 0
   - The watcher provides both semantic search and structured scan

2. **Qdrant** must be running with indexed data
   - Verify: `curl http://localhost:6333/healthz`

3. **Config file** must exist
   - Default: path from `JEEVES_META_CONFIG` env var
   - Must contain valid `watchPaths` and `watcherUrl`

4. **Prompt files** must exist
   - `J:\config\jeeves-meta\prompts\architect.md`
   - `J:\config\jeeves-meta\prompts\critic.md`

5. **Watch paths** must be indexed by the watcher
   - The paths in `watchPaths` must overlap with the watcher's configured paths

### Installation

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

Then restart the OpenClaw gateway to load the plugin.

### First Synthesis

1. Check discovery: `synth_list` — should show your `.meta/` entities
2. Preview: `synth_preview` — verify scope files and delta detection
3. Trigger: `synth_trigger` — run the first cycle
4. Review: `synth_detail <path> --includeArchive 1` — check output quality
5. Iterate on `_steer` prompts if needed

## Troubleshooting

### Watcher unreachable

**Symptom:** TOOLS.md shows "ACTION REQUIRED: jeeves-watcher is unreachable"
**Cause:** Watcher service not running or wrong URL in config
**Fix:**
1. Check watcher status: `curl http://localhost:1936/status`
2. If down, start the watcher service
3. If running on a different port, update `watcherUrl` in config

### No entities discovered

**Symptom:** `synth_list` returns empty, TOOLS.md shows "No synthesis entities found"
**Cause:** No `.meta/` directories in configured `watchPaths`, or paths not indexed
**Fix:**
1. Check `watchPaths` in config matches where `.meta/` dirs exist
2. Create `.meta/` directories if needed: `mkdir <domain>/.meta`
3. Verify watcher indexes those paths

### Synthesis stuck (locked entities)

**Symptom:** `synth_list` shows locked entities that never unlock
**Cause:** Previous synthesis crashed, leaving stale `.lock` file
**Fix:**
1. Check lock: `synth_detail <path>` — look for `locked: true`
2. Locks auto-expire after 30 minutes
3. For immediate unlock: delete `.meta/.lock` file manually

### Executor timeouts

**Symptom:** `synth_trigger` fails with timeout error
**Cause:** Subprocess took longer than configured timeout
**Fix:**
1. Increase timeout in config (`architectTimeout`, `builderTimeout`, `criticTimeout`)
2. Check if the LLM provider is slow or rate-limited
3. Check scope size: large scopes with many files take longer

### LLM errors in synthesis steps

**Symptom:** `synth_detail` shows `_error` field with step/code/message
**Cause:** Subprocess failed (API error, malformed output, rate limit)
**Fix:**
1. Check error details: `synth_detail <path>` — the `_error.step` tells you which step failed
2. Architect failure with existing `_builder`: engine reuses cached brief (self-healing)
3. Architect failure without `_builder` (first run): retry with `synth_trigger`
4. Builder failure: meta stays stale, retried next cycle automatically
5. Critic failure: content saved without feedback, not critical

## Gotchas

- `synth_trigger` runs a full LLM cycle (3 subprocess calls). It can take
  several minutes.
- A locked meta (another synthesis in progress) will be skipped silently.
- First-run quality is lower — the feedback loop needs 2-3 cycles to calibrate.
