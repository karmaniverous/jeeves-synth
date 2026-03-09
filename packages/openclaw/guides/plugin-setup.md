---
title: Plugin Setup
---

# Plugin Setup

## Installation

Install the plugin package:

```bash
npm install @karmaniverous/jeeves-meta-openclaw
```

Register it with the OpenClaw gateway configuration.

## Configuration

The plugin reads `J:\config\jeeves-meta.config.json` via `loadSynthConfig()`:

```json
{
  "watchPaths": ["j:/domains"],
  "watcherUrl": "http://localhost:1936",
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md",
  "depthWeight": 0.5,
  "skipUnchanged": true,
  "batchSize": 1
}
```

### @file: Resolution

Prompt values prefixed with `@file:` are resolved relative to `J:\config\`. The config loader reads the referenced file and replaces the `@file:` value with its contents.

## Lifecycle

![Plugin Lifecycle](../assets/plugin-lifecycle.png)

At gateway startup, the plugin:
1. Registers four tools (`synth_list`, `synth_detail`, `synth_trigger`, `synth_preview`)
2. Registers three virtual inference rules with jeeves-watcher (fire-and-forget)
