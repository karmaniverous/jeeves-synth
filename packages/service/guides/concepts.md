# Concepts

## Meta Entities

A `.meta/` directory co-located with source content. Contains:
- `meta.json` — current synthesis state (content, prompts, tokens, errors)
- `archive/` — timestamped snapshots of previous syntheses
- `.lock` — transient lock file during active synthesis

## Ownership Tree

Meta entities form a hierarchy based on filesystem nesting. A `.meta/` directory **owns** its parent directory and all descendants, except subtrees that contain their own `.meta/`. Child meta syntheses are consumed as rollup inputs by parent metas.

## Synthesis Cycle

A three-step LLM pipeline:
1. **Architect** — analyzes scope structure, crafts a task brief (conditional: runs on structure change, steer change, or periodic refresh)
2. **Builder** — executes the brief, produces `_content` + structured fields
3. **Critic** — evaluates the synthesis, provides `_feedback` for the next cycle

## Staleness

A meta is stale when any file in its scope was modified after `_generatedAt`. The scheduler uses a weighted formula incorporating tree depth and per-meta emphasis to prioritize which meta to synthesize next.

## Lock Staging

Synthesis results are staged in a `.lock` file before being committed to `meta.json`. If the process crashes between staging and commit, `meta.json` is untouched — "never write worse."

