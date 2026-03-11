# Virtual Rules

The jeeves-meta **service** registers three virtual inference rules with jeeves-watcher at startup. The plugin does not register rules.

## meta-current

Matches: `**/.meta/meta.json`

Indexes live synthesis files with configurable domain tags and extracted fields:
- `meta_id`, `meta_steer`, `meta_depth`, `meta_emphasis`
- `meta_synthesis_count`, `meta_structure_hash`
- `meta_architect_tokens`, `meta_builder_tokens`, `meta_critic_tokens`
- `generated_at_unix`, `has_error`, `meta_error_step`

Renders as Markdown with the `_content` synthesis body.

## meta-archive

Matches: `**/.meta/archive/*.json`

Indexes archived snapshots with `archived` and `archived_at` flags. Renders the archived `_content`.

## meta-config

Matches: `**/jeeves-meta.config.json`

Indexes the service configuration file with key config fields in frontmatter.

## Re-registration

Rules are registered at startup with 10-retry exponential backoff. The scheduler also monitors watcher uptime — if the watcher restarts (uptime decreases), rules are automatically re-registered.

