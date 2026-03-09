---
title: Configuration
---

# Configuration

## Config Schema

The `SynthConfigSchema` (Zod) defines all configuration options:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `watchPaths` | `string[]` | required | Glob patterns for `.meta/` discovery |
| `watcherUrl` | `string` | required | jeeves-watcher HTTP endpoint |
| `defaultArchitect` | `string` | required | Default architect prompt text |
| `defaultCritic` | `string` | required | Default critic prompt text |
| `depthWeight` | `number` | `0.5` | Staleness weighting exponent for depth |
| `maxArchive` | `number` | `10` | Maximum archive snapshots to retain |
| `architectTimeout` | `number` | `120` | Architect step timeout (seconds) |
| `builderTimeout` | `number` | `600` | Builder step timeout (seconds) |
| `criticTimeout` | `number` | `300` | Critic step timeout (seconds) |
| `architectRefreshCycles` | `number` | `10` | Re-run architect every N cycles |
| `skipUnchanged` | `boolean` | `true` | Skip metas with no source changes |
| `batchSize` | `number` | `1` | Metas to synthesize per invocation |

## Prompt Files

Prompts are stored as Markdown files and referenced via `@file:` indirection in the config:

```json
{
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md"
}
```

The `@file:` prefix is resolved relative to the config directory (`J:\config\`) by the OpenClaw plugin's config loader.

## Per-Meta Overrides

Set `_architect` or `_critic` directly in a `meta.json` to override the defaults for that specific meta. The engine uses `meta._architect ?? config.defaultArchitect`.
