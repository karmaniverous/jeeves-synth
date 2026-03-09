# jeeves-meta

Knowledge synthesis engine for the Jeeves platform. Transforms raw data archives into concise, queryable meta-analyses through a three-step LLM pipeline: **Architect** → **Builder** → **Critic**.

## Overview

jeeves-meta discovers `.meta/` directories across watched filesystem paths, builds an ownership tree, and schedules synthesis cycles based on weighted staleness. Each cycle:

1. **Architect** — analyzes data shape and crafts a task brief with search strategies
2. **Builder** — executes the brief, reads source files, queries the semantic index, and produces a synthesis
3. **Critic** — spot-checks claims, evaluates against steering prompts, and provides feedback

Results are written to `.meta/meta.json` files with full archive history, enabling self-improving feedback loops.

## Packages

| Package | Description |
|---------|-------------|
| [`@karmaniverous/jeeves-meta`](packages/lib/README.md) | Core synthesis engine — schemas, discovery, scheduling, orchestration, CLI |
| [`@karmaniverous/jeeves-meta-openclaw`](packages/openclaw/README.md) | OpenClaw plugin — interactive tools, gateway executor, virtual inference rules, TOOLS.md injection |

## Architecture

```
jeeves-runner (cron) ──→ jeeves-meta CLI ──→ orchestrator ──→ GatewayExecutor
                                                  │                    │
                                                  ├── discovery        ├── architect session
                                                  ├── scheduling       ├── builder session
                                                  └── archive          └── critic session
                                                  │
                                                  └──→ jeeves-watcher (scan / rules)
```

- **jeeves-runner** invokes `npx @karmaniverous/jeeves-meta synthesize` on a cron schedule
- **jeeves-meta** (library) orchestrates the 3-step LLM pipeline via pluggable executors
- **jeeves-watcher** provides structured queries (`POST /scan`) and semantic search
- **OpenClaw plugin** provides interactive tools (`synth_list`, `synth_detail`, `synth_trigger`, `synth_preview`)

## Quick Start

### As a library

```typescript
import {
  createSynthEngine,
  HttpWatcherClient,
  loadSynthConfig,
} from '@karmaniverous/jeeves-meta';

const config = loadSynthConfig('/path/to/jeeves-meta.config.json');
const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });

const engine = createSynthEngine(config, myExecutor, watcher);
const results = await engine.synthesize();
```

### As a CLI

```bash
# Set config path
export JEEVES_META_CONFIG=/path/to/jeeves-meta.config.json

# Check engine status
npx @karmaniverous/jeeves-meta status

# Run synthesis
npx @karmaniverous/jeeves-meta synthesize

# See all commands
npx @karmaniverous/jeeves-meta help
```

### As an OpenClaw plugin

Install and register the plugin package. Four tools become available to the agent:

- `synth_list` — list metas with summary stats and filtering
- `synth_detail` — full detail for a single meta with optional archive history
- `synth_trigger` — manually trigger synthesis for a specific meta
- `synth_preview` — dry-run showing what inputs would be gathered

## Development

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm test
npm run knip       # detect unused exports/deps
npm run docs       # generate TypeDoc documentation
```

## Documentation

- **[Engine Guides](packages/lib/guides/index.md)** — concepts, configuration, orchestration, scheduling, architecture patterns
- **[CLI Reference](packages/lib/guides/cli.md)** — all 10 CLI commands with usage examples
- **[Plugin Guides](packages/openclaw/guides/index.md)** — setup, tools reference, virtual rules, TOOLS.md injection

## License

BSD-3-Clause
