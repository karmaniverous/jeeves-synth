# TOOLS.md Injection

The plugin periodically writes a `## Meta` section into the workspace `TOOLS.md` file. The OpenClaw gateway reads this file fresh on each new session, making synthesis stats available in the agent's system prompt.

## Content

The injected section includes:
- Entity summary table (total, stale, errors, never synthesized, stalest, last synthesized)
- Dependency health warnings (watcher/gateway status)
- Token usage table (cumulative architect/builder/critic)
- Tool listing table

## Refresh Cycle

- **Initial delay:** 5 seconds after gateway startup
- **Refresh interval:** every 60 seconds
- **Deduplication:** only writes when content changes

## Section Ordering

The writer maintains ordering: `## Watcher` → `## Server` → `## Meta`. If the section doesn't exist, it's inserted in the correct position.

## Error Handling

If the service is unreachable, the section displays troubleshooting guidance instead of entity stats.

