# Scheduling

## Weighted Staleness Formula

```
effectiveStaleness = actualStaleness × (normalizedDepth + 1) ^ (depthWeight × emphasis)
```

- **actualStaleness**: seconds since `_generatedAt` (Infinity if never synthesized)
- **normalizedDepth**: tree depth shifted so minimum = 0
- **depthWeight**: config exponent (default 0.5). Set to 0 for pure staleness ordering
- **emphasis**: per-meta `_emphasis` multiplier (default 1). Higher = updates more often

## Scheduler Behavior

The built-in croner scheduler runs on the configured cron expression (default: every 30 minutes).

Each tick:
1. Discover all metas via watcher scan
2. Compute effective staleness for each
3. Enqueue the stalest candidate (if none found, increase backoff and return)
4. Check watcher uptime for restart detection → re-register virtual rules if needed (only runs when a candidate was found)

## Adaptive Backoff

When no stale candidates are found:
- Backoff multiplier doubles (max 4×)
- Subsequent ticks are skipped based on `tickCount % backoffMultiplier`
- Backoff resets to 1× after a successful synthesis

## Queue Processing

The synthesis queue is single-threaded:
- One synthesis runs at a time
- Priority items (HTTP-triggered) go to the front
- Duplicate paths are rejected (returns current position)
- Errors are logged but don't block subsequent items

