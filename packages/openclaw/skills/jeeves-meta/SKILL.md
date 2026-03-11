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
Enqueue a synthesis cycle for a specific meta or the next-stalest candidate.
The synthesis runs asynchronously in the service queue; the tool returns
immediately with the queue position. The full cycle (architect → builder →
critic) runs in the background.

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
| `gatewayUrl` | `http://127.0.0.1:18789` | OpenClaw gateway URL for subprocess spawning |
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
| `thinking` | `low` | Thinking level for spawned LLM sessions |
| `port` | 1938 | HTTP API listen port |
| `schedule` | `*/30 * * * *` | Cron expression for automatic synthesis scheduling |
| `reportChannel` | (optional) | Gateway channel target for progress messages (e.g. Slack channel ID) |
| `logging.level` | `info` | Log level (trace/debug/info/warn/error) |
| `logging.file` | (optional) | Log file path |

### Meta Discovery

Discovery is entirely watcher-based. The engine:

1. **Registers virtual inference rules** at service startup. These rules match
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
- Restart the jeeves-meta service (so it re-registers virtual rules with the
  new property values)
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

### Minimal Config Example

A minimum viable config file requires only `watcherUrl`, `defaultArchitect`,
and `defaultCritic`:

```json
{
  "watcherUrl": "http://localhost:1936",
  "gatewayUrl": "http://127.0.0.1:18789",
  "gatewayApiKey": "your-api-key",
  "defaultArchitect": "@file:prompts/architect.md",
  "defaultCritic": "@file:prompts/critic.md"
}
```

All other fields use sensible defaults (port 1938, schedule every 30 min,
depth weight 0.5, etc). Add `reportChannel`, `metaProperty`, `logging`,
etc. as needed.

### Adding New Metas

1. Create the `.meta/` directory under the domain path
2. Seed it: `jeeves-meta seed <path>` — creates `meta.json`
   with a UUID (`_id`). All other fields are populated on first synthesis
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

### Config Hot-Reload

The following fields can be changed without restarting the service:
- `schedule` — cron expression
- `reportChannel` — progress reporting target
- `logging.level` — log verbosity

Edit the config file and save; the service detects changes via `fs.watchFile`.
All other fields (including `metaProperty`, `port`, timeouts) require a service
restart.

### Progress Reporting

When `reportChannel` is set, the service sends real-time progress messages
to that channel via the OpenClaw gateway. Events include: synthesis started,
phase started/completed (architect, builder, critic), synthesis completed,
and errors. This uses
`/tools/invoke` → `message` tool — zero LLM token cost.

### TOOLS.md Bootstrapping Prompts

The plugin's TOOLS.md injection automatically prompts bootstrapping:
- **Service unreachable:** Shows "ACTION REQUIRED: jeeves-meta service is
  unreachable" with troubleshooting steps and directs to this skill's
  Bootstrapping section
- **No entities found:** Shows "ACTION REQUIRED: No synthesis entities found"
  and directs to this skill's Bootstrapping section

These messages appear in the agent's system prompt, ensuring proactive
discovery of configuration issues.

## Bootstrapping

### Prerequisites

Before the synthesis engine can operate:

1. **OpenClaw gateway** must be running (the service spawns LLM sessions
   through it via `gatewayUrl`)
   - Verify: `openclaw gateway status` or check the URL in config

2. **jeeves-watcher** must be running and indexing data
   - Verify: `watcher_status` tool or `curl http://localhost:1936/status`
   - The watcher provides both semantic search and structured scan

3. **Qdrant** must be running
   - Verify: `curl http://localhost:6333/healthz`

4. **Config file** must exist at the path specified by `JEEVES_META_CONFIG`
   - Must contain valid `watcherUrl`
   - Must contain `defaultArchitect` and `defaultCritic` (or `@file:` refs)

5. **Prompt files** must exist if using `@file:` references
   - e.g. `J:\config\jeeves-meta\prompts\architect.md`
   - e.g. `J:\config\jeeves-meta\prompts\critic.md`

6. **`.meta/` directories** must exist and be within paths the watcher indexes
   - Seed new metas: `jeeves-meta seed <path>`

### Installation

1. Install and start the jeeves-meta service:

```bash
npm install -g @karmaniverous/jeeves-meta
jeeves-meta start --config J:\config\jeeves-meta.config.json
```

2. Install the OpenClaw plugin:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

For non-default OpenClaw installations, set `OPENCLAW_CONFIG` (path to
`openclaw.json`) or `OPENCLAW_HOME` (path to `.openclaw` directory).

To uninstall: `npx @karmaniverous/jeeves-meta-openclaw uninstall`

3. (Optional) Configure the plugin with the service URL — only needed if the
   service runs on a non-default port or host:

```json
{
  "plugins": {
    "entries": {
      "jeeves-meta-openclaw": {
        "enabled": true,
        "config": {
          "serviceUrl": "http://127.0.0.1:1938"
        }
      }
    }
  }
}
```

4. Restart the OpenClaw gateway to load the plugin.

5. Verify: check that `## Meta` appears in TOOLS.md injection and
   `jeeves-meta` appears in available skills.

### First Synthesis

1. Check discovery: `meta_list` — should show your `.meta/` entities
2. Preview: `meta_preview` — verify scope files and delta detection
3. Trigger: `meta_trigger` — run the first cycle
4. Review: `meta_detail <path>` with `includeArchive: 1` — check output quality
5. Iterate on `_steer` prompts if needed

### System Service Management

For production deployments, install as a system service:

```bash
jeeves-meta service install --config J:\config\jeeves-meta.config.json
```

This prints OS-specific instructions:
- **Windows:** NSSM service commands
- **macOS:** launchd plist
- **Linux:** systemd unit

Management commands (print OS-specific equivalents):
```bash
jeeves-meta service start     # print start instructions
jeeves-meta service stop      # print stop instructions
jeeves-meta service status    # query running service via HTTP API
jeeves-meta service remove    # print removal instructions
```

### HTTP API

The service exposes these endpoints (default port 1938):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Service health, queue state, dependency checks |
| GET | `/metas` | List metas with filtering and field projection |
| GET | `/metas/:path` | Single meta detail with optional archive |
| GET | `/preview` | Dry-run next synthesis candidate |
| POST | `/synthesize` | Enqueue synthesis (stalest or specific path) |
| POST | `/seed` | Create `.meta/` directory + meta.json |
| POST | `/unlock` | Remove `.lock` file from a meta entity |
| GET | `/config/validate` | Return sanitized active configuration |

All endpoints return JSON. The OpenClaw plugin tools are thin wrappers
around these endpoints.

## Service CLI

The service package ships a CLI:

```bash
jeeves-meta <command> [options]
```

Commands: `start`, `status`, `list`, `detail`, `preview`, `synthesize`,
`seed`, `unlock`, `validate`, `service install|start|stop|status|remove`.

Config resolution: `--config` flag → `JEEVES_META_CONFIG` env var → error.
All client commands support `-p, --port` to specify the service port (default: 1938).
The `start` command uses `--config`/`-c` instead (port is read from the config file).

## Operational Monitoring

Recommended periodic checks:
- **Errors:** `meta_list` with `filter: { hasError: true }` — investigate
  and retry with `meta_trigger`
- **Stuck locks:** `meta_list` with `filter: { locked: true }` — locks
  older than 30 minutes indicate a crashed synthesis; use `jeeves-meta unlock`
- **Stale knowledge:** `meta_list` with `filter: { staleHours: 48 }` — check
  if the scheduler is running and the watcher is up
- **Service health:** `/status` endpoint (via `meta_list` summary or direct
  HTTP) includes dependency status for watcher and gateway

The TOOLS.md injection surfaces the most critical stats (entity count, errors,
stalest entity) in the agent's system prompt automatically.

## Troubleshooting

### Service unreachable

**Symptom:** TOOLS.md shows "ACTION REQUIRED: jeeves-meta service is unreachable"
**Cause:** Meta service not running or wrong `serviceUrl` in plugin config
**Fix:**
1. Check if the service is running: `jeeves-meta service status` or `curl http://localhost:1938/status`
2. If down, start it: `jeeves-meta service start` or `jeeves-meta start --config <path>`
3. If running on a different port, update `serviceUrl` in plugin config

### Watcher unreachable

**Symptom:** TOOLS.md shows a ⚠️ **Watcher** dependency warning in the entity summary
**Cause:** Watcher service not running or wrong URL in meta service config
**Fix:**
1. Check watcher status: `watcher_status` tool or `curl http://localhost:1936/status`
2. If down, start the watcher service
3. If running on a different port, update `watcherUrl` in meta service config and restart the service

### No entities discovered

**Symptom:** `meta_list` returns empty, TOOLS.md shows "No synthesis entities found"
**Cause:** No `.meta/meta.json` files indexed, or `metaProperty` mismatch
**Fix:**
1. Verify `.meta/meta.json` files exist on disk
2. Check that the watcher indexes those paths (paths must be in watcher's
   configured `watch` globs)
3. Check that `metaProperty` in config matches the properties actually set
   on indexed points. If you changed `metaProperty`, run `watcher_reindex`
   with scope `rules` and restart the meta service.
4. Seed new metas if needed: `jeeves-meta seed <path>`

### Synthesis stuck (locked entities)

**Symptom:** `meta_list` shows locked entities that never unlock
**Cause:** Previous synthesis crashed, leaving stale `.lock` file
**Fix:**
1. Check lock: `meta_detail <path>` — look for `locked: true`
2. Locks auto-expire after 30 minutes
3. For immediate unlock: `jeeves-meta unlock <path>`
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
1. If `metaProperty` changed: restart meta service + `watcher_reindex` (scope: rules)
2. If new `.meta/` directory: wait for chokidar detection (seconds) or
   trigger `watcher_reindex` (scope: full)
3. Verify with `watcher_scan`: query for the expected properties to confirm
   the watcher has the right metadata on the points

## Gotchas

- `meta_trigger` runs a full LLM cycle (3 subprocess calls). It can take
  several minutes.
- A locked meta (another synthesis in progress) will be skipped silently.
- First-run quality is lower — the feedback loop needs 2-3 cycles to calibrate.
- Changing `metaProperty` requires both a meta service restart AND a watcher reindex.
  The service restart re-registers virtual rules; the reindex retags existing points.
- The `@file:` prefix in `defaultArchitect`/`defaultCritic` is resolved relative
  to the config file's directory, not the working directory.
- The synthesis queue is single-threaded: one synthesis at a time. HTTP-triggered
  syntheses get priority over scheduler-triggered ones.
- The scheduler uses adaptive backoff: if no stale candidates are found, it
  doubles the skip interval (max 4×). Backoff resets after a successful synthesis.
- All CLI commands except `start` require the service to be running (they call
  the HTTP API).
