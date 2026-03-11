# CLI Reference

All commands support `-p, --port <port>` to specify the service port (default: 1938).

## `jeeves-meta start`

Start the HTTP service.

```bash
jeeves-meta start --config /path/to/config.json
# or: jeeves-meta start -c /path/to/config.json
```

## `jeeves-meta status`

Show service health, queue state, dependency status, and meta summary.

## `jeeves-meta list`

List all discovered meta entities with summary statistics.

## `jeeves-meta detail <path>`

Show full detail for a single meta entity, including scope info and staleness score.

## `jeeves-meta preview [--path <path>]`

Dry-run: preview inputs for the next synthesis cycle without running any LLM calls. Shows scope files, delta files, architect trigger reasons, and token estimates.

## `jeeves-meta synthesize [--path <path>]`

Enqueue a synthesis. If `--path` is provided, that specific meta is enqueued with priority. Otherwise, the stalest candidate is discovered and enqueued.

## `jeeves-meta seed <path>`

Create a `.meta/` directory with a fresh `meta.json` (containing a new UUID `_id`).

## `jeeves-meta unlock <path>`

Remove a `.lock` file from a meta entity. Use when a lock is stale due to a crashed synthesis.

## `jeeves-meta validate [-c <config-path>]`

Validate the active service config (or a candidate config file).

## `jeeves-meta service install|start|stop|status|remove`

Print OS-specific instructions for managing the service as a system daemon (NSSM on Windows, launchd on macOS, systemd on Linux).

