# @karmaniverous/jeeves-meta

HTTP service for the Jeeves knowledge synthesis engine. Provides a Fastify API, built-in croner-based scheduler, single-threaded synthesis queue, and a Commander CLI.

## Features

- **Fastify HTTP API** — `/status`, `/metas`, `/preview`, `/synthesize`, `/seed`, `/unlock`, `/config/validate`
- **Built-in scheduler** — croner-based cron with adaptive backoff
- **Synthesis queue** — single-threaded, priority-aware, deduplicated
- **Three-step orchestration** — architect, builder, critic with conditional re-architecture
- **Discovery via watcher** — scan-based meta discovery with configurable domain tags
- **Ownership tree** — hierarchical scoping with child meta rollup
- **Archive management** — timestamped snapshots with configurable pruning
- **Lock staging** — write to `.lock` → copy to `meta.json` → archive (crash-safe)
- **Virtual rule registration** — registers 3 watcher inference rules at startup with retry
- **Progress reporting** — real-time synthesis events via gateway channel messages
- **Graceful shutdown** — stop scheduler, release locks, close server
- **Config hot-reload** — schedule, reportChannel, log level reload without restart
- **Token tracking** — per-step counts with exponential moving averages
- **CLI** — `status`, `list`, `detail`, `preview`, `synthesize`, `seed`, `unlock`, `validate`, `service` commands
- **Zod schemas** — validated meta.json and config with open schema support

## Install

```bash
npm install -g @karmaniverous/jeeves-meta
```

## Quick Start

```bash
# Start the service
jeeves-meta start --config /path/to/jeeves-meta.config.json

# Check status
jeeves-meta status

# List all metas
jeeves-meta list

# Run synthesis
jeeves-meta synthesize

# Install as a system service (prints OS-specific instructions)
jeeves-meta service install --config /path/to/jeeves-meta.config.json
```

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Service health, queue state, dependency checks |
| GET | `/metas` | List metas with filtering and field projection |
| GET | `/metas/:path` | Single meta detail with optional archive |
| GET | `/preview` | Dry-run: preview inputs for next synthesis |
| POST | `/synthesize` | Enqueue synthesis (stalest or specific path) |
| POST | `/seed` | Create `.meta/` directory + meta.json |
| POST | `/unlock` | Remove `.lock` file from a meta entity |
| GET | `/config/validate` | Return sanitized active configuration |

## Configuration

See the [Configuration Guide](guides/configuration.md) for all fields, defaults, and environment variable substitution.

## Documentation

- **[Guides](guides/index.md)** — concepts, configuration, orchestration, scheduling, architecture
- **[CLI Reference](guides/cli.md)** — all commands with usage

## License

BSD-3-Clause

