---
title: Virtual Inference Rules
---

# Virtual Inference Rules

The plugin registers three virtual inference rules with jeeves-watcher at startup. These rules tell the watcher how to index `.meta/` files in Qdrant.

## Rule 1: synth-meta-live

Indexes live `.meta/meta.json` files with extracted fields:

- `synth_id`, `synth_steer`, `synth_depth`, `synth_emphasis`
- `synth_synthesis_count`, `synth_structure_hash`
- `synth_architect_tokens`, `synth_builder_tokens`, `synth_critic_tokens`
- `synth_error_step`, `has_error`, `generated_at_unix`
- Domain: `synth-meta`

The rule renders `_content` as the document body for semantic search.

## Rule 2: synth-meta-archive

Indexes `.meta/archive/*.json` snapshots:

- `synth_id`, `archived`, `archived_at`
- Domain: `synth-archive`

## Rule 3: synth-config

Indexes `jeeves-meta.config.json`:

- Domain: `synth-config`
- Rendered via `synth-config.hbs` template
