# Configuration

The service reads a JSON config file specified via `--config` flag or `JEEVES_META_CONFIG` environment variable.

## Core Fields (MetaConfig)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `watcherUrl` | string (URL) | — | Watcher service base URL (required) |
| `gatewayUrl` | string (URL) | `http://127.0.0.1:18789` | OpenClaw gateway URL |
| `gatewayApiKey` | string | — | Gateway authentication key |
| `defaultArchitect` | string | — | Architect system prompt (required). Supports `@file:` references |
| `defaultCritic` | string | — | Critic system prompt (required). Supports `@file:` references |
| `architectEvery` | integer | `10` | Run architect every N cycles per meta |
| `depthWeight` | number | `0.5` | Exponent for depth weighting in staleness formula |
| `maxArchive` | integer | `20` | Maximum archive snapshots per meta |
| `maxLines` | integer | `500` | Max context lines in subprocess prompts |
| `architectTimeout` | integer | `120` | Architect subprocess timeout (seconds) |
| `builderTimeout` | integer | `600` | Builder subprocess timeout (seconds) |
| `criticTimeout` | integer | `300` | Critic subprocess timeout (seconds) |
| `thinking` | string | `"low"` | Thinking level for spawned sessions |
| `skipUnchanged` | boolean | `true` | Skip candidates with no file changes |
| `metaProperty` | object | `{ _meta: "current" }` | Watcher metadata for live meta.json files |
| `metaArchiveProperty` | object | `{ _meta: "archive" }` | Watcher metadata for archive snapshots |

## Service Fields (extends MetaConfig)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | integer | `1938` | HTTP listen port |
| `schedule` | string | `*/30 * * * *` | Cron expression for synthesis scheduling |
| `reportChannel` | string | — | Gateway channel target for progress messages |
| `logging.level` | string | `"info"` | Log level (trace/debug/info/warn/error) |
| `logging.file` | string | — | Log file path |

## Hot-Reload

The following fields are hot-reloadable (no service restart required):
- `schedule` — cron expression
- `reportChannel` — progress reporting target
- `logging.level` — log verbosity

All other fields require a service restart.

## Environment Variables

Config values support `${VAR}` substitution from environment variables. Example:

```json
{ "gatewayApiKey": "${OPENCLAW_API_KEY}" }
```

## File References

`defaultArchitect` and `defaultCritic` support `@file:` references resolved relative to the config file:

```json
{ "defaultArchitect": "@file:prompts/architect.md" }
```

