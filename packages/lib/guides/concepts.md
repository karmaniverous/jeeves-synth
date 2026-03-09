---
title: Core Concepts
---

# Core Concepts

## Ownership Trees

![Ownership Tree](../assets/ownership-tree.png)

jeeves-meta discovers `.meta/` directories across watched filesystem paths and builds an **ownership tree**. Each `.meta/` directory "owns" the files in its parent directory, excluding any subdirectories that have their own `.meta/`.

```
domains/
├── email/
│   ├── .meta/          ← owns email/* (leaf)
│   │   └── meta.json
│   └── messages/
├── github/
│   ├── .meta/          ← owns github rollup (children only)
│   │   └── meta.json
│   └── karmaniverous/
│       ├── .meta/      ← owns org rollup
│       │   └── meta.json
│       └── my-repo/
│           ├── .meta/  ← owns repo files (leaf)
│           │   └── meta.json
│           └── src/
└── .meta/              ← global rollup (root)
    └── meta.json
```

Parent metas consume their children's `_content` outputs as rollup inputs.

## meta.json Structure

Each `meta.json` contains:

- **Identity:** `_id` (UUID, immutable)
- **Steering:** `_steer` (human-provided directive), `_depth` (priority override), `_emphasis` (staleness multiplier)
- **Engine state:** `_generatedAt`, `_structureHash`, `_synthesisCount`
- **Prompts:** `_architect`, `_critic` (stored per-turn for reproducibility)
- **Outputs:** `_builder` (task brief), `_content` (synthesis), `_feedback` (critique)
- **Tokens:** `_architectTokens`, `_builderTokens`, `_criticTokens` + EMA variants
- **Errors:** `_error` (`{ step, code, message }`)
- **Open schema:** non-underscore properties pass through (custom metadata)

All underscore-prefixed properties are reserved for the engine.

## The Three-Step Pipeline

1. **Architect** — analyzes the data shape and crafts a `_builder` task brief. Defines search strategies (not specific queries). Triggered conditionally: first run, structure change, steer change, or periodic refresh.

2. **Builder** — executes the architect's brief with full tool access. Reads files, queries the semantic index, and produces `_content` (the synthesis) plus structured fields.

3. **Critic** — spot-checks claims against source data, evaluates alignment with `_steer`, and produces `_feedback`. Feedback is stored for the next architect cycle.

## Archive

After each synthesis cycle, `meta.json` is copied to `.meta/archive/{ISO-timestamp}.json`. Archives capture the full post-cycle state including any `_error` field. Previous state is always recoverable from the prior archive entry.
