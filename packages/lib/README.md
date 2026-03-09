# @karmaniverous/jeeves-meta

Core synthesis engine for the Jeeves platform. Provides schemas, filesystem discovery, weighted staleness scheduling, and the three-step orchestrator (architect → builder → critic).

## Features

- **Zod schemas** — validated `meta.json` and config structures with open schema support
- **Filesystem discovery** — glob `.meta/` directories, build ownership trees, compute scopes
- **Weighted staleness** — depth-aware scheduling formula with emphasis multipliers
- **Three-step orchestration** — architect, builder, critic with conditional re-architecture
- **Archive management** — timestamped snapshots with configurable pruning
- **Structure hashing** — detect scope changes (file additions/removals)
- **Lock management** — filesystem locks with stale timeout
- **Pluggable executor** — `SynthExecutor` interface for runtime-agnostic subprocess spawning
- **Pluggable watcher client** — `WatcherClient` interface with HTTP implementation included
- **Token tracking** — per-step token counts with exponential moving averages

## Architecture

![System Architecture](assets/system-architecture.png)

## Install

```bash
npm install @karmaniverous/jeeves-meta
```

## Quick Start

```typescript
import { createSynthEngine, HttpWatcherClient } from '@karmaniverous/jeeves-meta';

const watcher = new HttpWatcherClient('http://localhost:1936');

const engine = createSynthEngine({
  config: {
    watchPaths: ['j:/domains'],
    watcherUrl: 'http://localhost:1936',
    defaultArchitect: '...',
    defaultCritic: '...',
  },
  executor: myExecutor,
  watcher,
});

const results = await engine.orchestrate();
```

## Documentation

Full docs, guides, and API reference:

**[docs.karmanivero.us/jeeves-meta](https://docs.karmanivero.us/jeeves-meta)**

## License

BSD-3-Clause
