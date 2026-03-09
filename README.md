# jeeves-meta

Knowledge synthesis engine for the Jeeves platform. Transforms raw data archives into concise, queryable meta-analyses through a three-step LLM pipeline: **Architect** → **Builder** → **Critic**.

## Overview

jeeves-meta discovers `.meta/` directories across watched filesystem paths, builds an ownership tree, and schedules synthesis cycles based on weighted staleness. Each cycle:

1. **Architect** — analyzes data shape and crafts a task brief with search strategies
2. **Builder** — executes the brief, reads source files, queries the semantic index, and produces a synthesis
3. **Critic** — spot-checks claims, evaluates against steering prompts, and provides feedback

Results are written to `.meta/meta.json` files with full archive history, enabling self-improving feedback loops and future Supervisor optimization.

## Packages

| Package | Description |
|---------|-------------|
| [`@karmaniverous/jeeves-meta`](https://github.com/karmaniverous/jeeves-meta/tree/main/packages/lib) | Core synthesis engine library — schemas, discovery, scheduling, orchestration |
| [`@karmaniverous/jeeves-meta-openclaw`](https://github.com/karmaniverous/jeeves-meta/tree/main/packages/openclaw) | OpenClaw plugin — interactive tools, gateway executor, virtual inference rules |

## Architecture

![System Architecture](packages/lib/assets/system-architecture.png)

For the full per-cycle sequence diagram, see [Orchestration Guide](packages/lib/guides/orchestration.md).

- **jeeves-runner** invokes synthesis cycles on a cron schedule
- **jeeves-meta** (library) orchestrates the 3-step LLM pipeline
- **jeeves-watcher** provides structured queries (`POST /scan`) and semantic search
- **OpenClaw plugin** provides interactive tools (`synth_list`, `synth_detail`, `synth_trigger`, `synth_preview`)

## Quick Start

### As a library

```typescript
import { createSynthEngine } from '@karmaniverous/jeeves-meta';

const engine = createSynthEngine({
  config,    // SynthConfig (Zod-validated)
  executor,  // SynthExecutor implementation
  watcher,   // WatcherClient implementation
});

const results = await engine.orchestrate();
```

### As an OpenClaw plugin

Install the plugin package and register it with the gateway. Tools become available to the agent:

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
npm run docs    # generate TypeDoc documentation
```

## Documentation

Full docs, guides, and API reference:

**[docs.karmanivero.us/jeeves-meta](https://docs.karmanivero.us/jeeves-meta)**

## License

BSD-3-Clause
