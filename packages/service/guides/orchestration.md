# Orchestration

The `orchestrate()` function runs a single synthesis cycle in 13 steps:

1. **Discover** — scan watcher for `.meta/meta.json` files matching the configured domain filter
2. **Read** — parse `meta.json` for each discovered path
3. **Build tree** — construct the ownership tree from valid paths
4. **Select candidate** — rank by effective staleness, acquire lock on winner
5. **Compute context** — scope files, delta files, child meta outputs, previous content/feedback
6. **Structure hash** — SHA-256 of sorted scope file listing (from context)
7. **Steer detection** — compare current `_steer` vs latest archive
8. **Architect** (conditional) — runs if: no cached builder, structure changed, steer changed, or periodic refresh
9. **Builder** — executes the architect's brief, produces `_content` + structured fields
10. **Critic** — evaluates the synthesis, produces `_feedback`
11. **Finalize** — stage result in `.lock`, copy to `meta.json`, create archive snapshot, prune old archives
12. **Release lock** — delete `.lock` file (in `finally` block)

### Error Handling

- **Architect failure with cached builder**: continues with existing `_builder`
- **Architect failure without cached builder**: cycle ends, error recorded
- **Builder failure**: cycle ends, error recorded
- **Critic failure**: synthesis is preserved, error attached
- **Errors never block the queue**: logged, reported, queue advances

### Lock Staging ("Never Write Worse")

Results are staged in `.lock` before being committed to `meta.json`. If the process crashes:
- Before staging: `meta.json` is untouched
- After staging, before commit: `meta.json` is untouched; stale `.lock` cleaned at next startup
- After commit: synthesis is preserved

