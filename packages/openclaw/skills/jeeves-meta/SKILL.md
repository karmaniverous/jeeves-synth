# jeeves-meta — OpenClaw Skill

## Overview

jeeves-meta is the Jeeves platform's knowledge synthesis engine. It discovers
`.meta/` directories via watcher scan, gathers context from the Qdrant vector
index, and uses a three-step LLM process (architect, builder, critic) to
produce structured synthesis artifacts co-located with source content.

## Available Tools

### meta_list
List all `.meta/` directories with summary stats and per-meta projection.
Supports filtering by path prefix, error status, staleness, and lock state.
Use for engine health checks and finding stale knowledge.

**Parameters:**
- `pathPrefix` (optional): Filter by path prefix (e.g. "github/")
- `filter` (optional): Structured filter (`{ hasError: true }`, `{ staleHours: 24 }`)
- `fields` (optional): Property projection array

### meta_detail
Full detail for a single meta, with optional archive history.

**Parameters:**
- `path` (required): `.meta/` or owner directory path
- `fields` (optional): Property projection
- `includeArchive` (optional): false, true, or number (N most recent)

### meta_preview
Dry-run for the next synthesis cycle. Shows scope files, delta files,
architect trigger reasons, steer status, and structure changes — without
running any LLM calls. Use before `meta_trigger` to understand what
will happen.

**Parameters:**
- `path` (optional): Specific `.meta/` or owner directory path. If omitted,
  previews the stalest candidate.

### meta_trigger
Manually trigger a full synthesis cycle (architect → builder → critic) for
a specific meta or the next-stalest candidate.

**Parameters:**
- `path` (optional): Specific `.meta/` or owner directory path. If omitted,
  synthesizes the stalest candidate.

## When to Use

- **Checking synthesis health:** `meta_list`
- **Finding stale knowledge:** `meta_list` with `filter: { staleHours: 24 }`
- **Checking errors:** `meta_list` with `filter: { hasError: true }`
- **Getting full details:** `meta_detail` with optional `includeArchive: 5`
- **Understanding what a cycle will do:** `meta_preview`
- **Forcing a refresh:** `meta_trigger` with optional path
- **Reading synthesis output:** Use `watcher_search` filtered by the properties
  configured in `metaProperty` (e.g. `{ "domains": ["meta"] }` in production).
  The default properties are `{ _meta: "current" }` for live metas and
  `{ _meta: "archive" }` for archive snapshots.

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

Location determined by `JEEVES_META_CONFIG` env var or `--config` CLI flag.
Canonical deployment: `J:\config\jeeves-meta.config.json`.

Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `watcherUrl` | (required) | Watcher service URL (e.g. `http://localhost:1936`) |
| `gatewayUrl` | `http://127.0.0.1:3000` | OpenClaw gateway URL for subprocess spawning |
| `gatewayApiKey` | (optional) | API key for gateway authentication |
| `metaProperty` | `{ _meta: "current" }` | Watcher metadata properties applied to live `.meta/meta.json` files. `Record<string, unknown>` — any shape accepted. |
| `metaArchiveProperty` | `{ _meta: "archive" }` | Watcher metadata properties applied to `.meta/archive/**` snapshots. Same shape flexibility. |
| `architectEvery` | 10 | Re-run architect every N cycles even if structure unchanged |
| `depthWeight` | 0.5 | Exponent for depth-based scheduling (0 = pure staleness) |
| `maxArchive` | 20 | Max archived snapshots per meta |
| `maxLines` | 500 | Max lines for builder context |
| `architectTimeout` | 120s | Architect subprocess timeout |
| `builderTimeout` | 600s | Builder subprocess timeout |
| `criticTimeout` | 300s | Critic subprocess timeout |
| `skipUnchanged` | true | Skip candidates with no changes since last synthesis |
| `batchSize` | 1 | Number of metas to synthesize per invocation |

### Meta Discovery

Discovery is entirely watcher-based. The engine:

1. **Registers virtual inference rules** at plugin startup. These rules match
   file paths (`**/.meta/meta.json` and `**/.meta/archive/*.json`) and apply
   the configured `metaProperty`/`metaArchiveProperty` values as watcher
   metadata on those indexed points.

2. **Queries the watcher** via `buildMetaFilter(config)`, which constructs a
   Qdrant filter from the key-value pairs in `metaProperty`. For example:
   - Default `{ _meta: "current" }` → filter on `_meta: "current"`
   - Configured `{ domains: ["meta"] }` → filter on `domains: "meta"`

3. **Deduplicates** scan results by `.meta/` directory path and builds the
   ownership tree.

**Important:** If you change `metaProperty` or `metaArchiveProperty` in config,
you must:
- Restart the OpenClaw gateway (so the plugin re-registers virtual rules with
  the new property values)
- Trigger a watcher rules reindex (`watcher_reindex` with scope `rules`) so
  existing indexed points get retagged with the new properties

### Configuring Meta Properties

`metaProperty` and `metaArchiveProperty` are `Record<string, unknown>` — any
JSON-serializable key-value structure. The virtual rules spread these properties
onto every matching indexed point. The discovery filter is derived from the same
properties.

**Example configurations:**

```json
// Default (no config needed):
// Live metas get { _meta: "current" }, archives get { _meta: "archive" }

// Using watcher domains:
{
  "metaProperty": { "domains": ["meta"] },
  "metaArchiveProperty": { "domains": ["meta-archive"] }
}

// Custom tagging:
{
  "metaProperty": { "project": "myproject", "kind": "synthesis" }
}
```

### Prompt Customization

Default prompts live at `J:\config\jeeves-meta\prompts\{architect,critic}.md`,
referenced via `@file:` in the config:

```json
{
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md"
}
```

`@file:` paths are resolved relative to the config file's directory.

**Per-meta overrides:** Set `_architect` or `_critic` directly in a `meta.json`
to override the defaults for that specific entity.

### Adding New Metas

1. Create the `.meta/` directory under the domain path
2. Seed it: `npx @karmaniverous/jeeves-meta seed <path>` — creates `meta.json`
   with a UUID and default fields
3. Optionally edit `meta.json` to set `_steer`, `_depth`, and `_emphasis`
4. Wait for the watcher to index the new `meta.json` (typically seconds via
   chokidar file watching)
5. The entity appears in `meta_list` on the next query

### Tuning Scheduling

- **`_depth`:** Higher = updates more often. Defaults from tree nesting depth.
- **`_emphasis`:** Per-meta multiplier (default 1). Set 2 to double priority,
  0.5 to halve it.
- **`depthWeight`:** Global exponent. Set 0 for pure staleness rotation.
- **`architectEvery`:** Higher = fewer architect runs (cheaper but slower to
  adapt to structural changes).

## Bootstrapping

### Prerequisites

Before the synthesis engine can operate:

1. **jeeves-watcher** must be running and indexing data
   - Verify: `watcher_status` tool or `curl http://localhost:1936/status`
   - The watcher provides both semantic search and structured scan

2. **Qdrant** must be running
   - Verify: `curl http://localhost:6333/healthz`

3. **Config file** must exist at the path specified by `JEEVES_META_CONFIG`
   - Must contain valid `watcherUrl`
   - Must contain `defaultArchitect` and `defaultCritic` (or `@file:` refs)

4. **Prompt files** must exist if using `@file:` references
   - e.g. `J:\config\jeeves-meta\prompts\architect.md`
   - e.g. `J:\config\jeeves-meta\prompts\critic.md`

5. **`.meta/` directories** must exist and be within paths the watcher indexes
   - Seed new metas: `npx @karmaniverous/jeeves-meta seed <path>`

### Installation

1. Install the OpenClaw plugin:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

2. Set the config path environment variable (in the gateway's environment):

```
JEEVES_META_CONFIG=J:\config\jeeves-meta.config.json
```

3. Restart the OpenClaw gateway to load the plugin.

4. Verify: check that `## Meta` appears in TOOLS.md injection and
   `jeeves-meta` appears in available skills.

### First Synthesis

1. Check discovery: `meta_list` — should show your `.meta/` entities
2. Preview: `meta_preview` — verify scope files and delta detection
3. Trigger: `meta_trigger` — run the first cycle
4. Review: `meta_detail <path>` with `includeArchive: 1` — check output quality
5. Iterate on `_steer` prompts if needed

## Library CLI

The library ships a CLI for non-plugin operation:

```bash
npx @karmaniverous/jeeves-meta <command> [options]
```

Commands: `status`, `list`, `detail`, `preview`, `synthesize`, `seed`,
`unlock`, `validate`, `config show`, `config check`.

Config resolution: `--config` flag → `JEEVES_META_CONFIG` env var → error.
All commands support `--json` for machine-readable output.

## Troubleshooting

### Watcher unreachable

**Symptom:** TOOLS.md shows "ACTION REQUIRED: jeeves-watcher is unreachable"
**Cause:** Watcher service not running or wrong URL in config
**Fix:**
1. Check watcher status: `watcher_status` tool
2. If down, start the watcher service
3. If running on a different port, update `watcherUrl` in config

### No entities discovered

**Symptom:** `meta_list` returns empty, TOOLS.md shows "No synthesis entities found"
**Cause:** No `.meta/meta.json` files indexed, or `metaProperty` mismatch
**Fix:**
1. Verify `.meta/meta.json` files exist on disk
2. Check that the watcher indexes those paths (paths must be in watcher's
   configured `watch` globs)
3. Check that `metaProperty` in config matches the properties actually set
   on indexed points. If you changed `metaProperty`, run `watcher_reindex`
   with scope `rules` and restart the gateway.
4. Seed new metas if needed: `npx @karmaniverous/jeeves-meta seed <path>`

### Synthesis stuck (locked entities)

**Symptom:** `meta_list` shows locked entities that never unlock
**Cause:** Previous synthesis crashed, leaving stale `.lock` file
**Fix:**
1. Check lock: `meta_detail <path>` — look for `locked: true`
2. Locks auto-expire after 30 minutes
3. For immediate unlock: `npx @karmaniverous/jeeves-meta unlock <path>`
   or delete `.meta/.lock` file manually

### Executor timeouts

**Symptom:** `meta_trigger` fails with timeout error
**Cause:** Subprocess took longer than configured timeout
**Fix:**
1. Increase timeout in config (`architectTimeout`, `builderTimeout`,
   `criticTimeout`)
2. Check if the LLM provider is slow or rate-limited
3. Check scope size: large scopes with many files take longer

### LLM errors in synthesis steps

**Symptom:** `meta_detail` shows `_error` field with step/code/message
**Cause:** Subprocess failed (API error, malformed output, rate limit)
**Fix:**
1. Check error details: `meta_detail <path>` — `_error.step` tells you
   which step failed
2. Architect failure with existing `_builder`: engine reuses cached brief
   (self-healing)
3. Architect failure without `_builder` (first run): retry with `meta_trigger`
4. Builder failure: meta stays stale, retried next cycle automatically
5. Critic failure: content saved without feedback, not critical

### Discovery returns wrong/stale results

**Symptom:** `meta_list` shows old metas or misses new ones
**Cause:** Virtual rules not re-registered after config change, or watcher
not yet indexed new files
**Fix:**
1. If `metaProperty` changed: restart gateway + `watcher_reindex` (scope: rules)
2. If new `.meta/` directory: wait for chokidar detection (seconds) or
   trigger `watcher_reindex` (scope: full)
3. Verify with `watcher_scan`: query for the expected properties to confirm
   the watcher has the right metadata on the points

## Gotchas

- `meta_trigger` runs a full LLM cycle (3 subprocess calls). It can take
  several minutes.
- A locked meta (another synthesis in progress) will be skipped silently.
- First-run quality is lower — the feedback loop needs 2-3 cycles to calibrate.
- Changing `metaProperty` requires both a gateway restart AND a watcher reindex.
  The gateway restart re-registers virtual rules; the reindex retags existing points.
- The `@file:` prefix in `defaultArchitect`/`defaultCritic` is resolved relative
  to the config file's directory, not the working directory.
