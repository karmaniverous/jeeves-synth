# Tools Reference

All tools delegate to the jeeves-meta HTTP service.

## meta_list

List metas with summary stats and per-meta projection.

**Parameters:**
- `pathPrefix` (string, optional) — filter by path prefix
- `filter` (object, optional) — structured filter: `hasError`, `staleHours`, `neverSynthesized`, `locked`
- `fields` (string[], optional) — fields to include per meta

**Response:** `{ summary, metas }`

## meta_detail

Full detail for a single meta with optional archive history.

**Parameters:**
- `path` (string, required) — `.meta/` or owner directory path
- `fields` (string[], optional) — fields to include
- `includeArchive` (boolean | number, optional) — false, true (all), or N most recent

**Response:** `{ path, meta, scope, staleness, archive? }`

## meta_preview

Dry-run: show what inputs would be gathered for the next synthesis cycle.

**Parameters:**
- `path` (string, optional) — specific path, or omit for stalest candidate

**Response:** `{ path, staleness, architectWillRun, architectReason, scope, estimatedTokens }`

## meta_trigger

Enqueue synthesis for a specific meta or the stalest candidate.

**Parameters:**
- `path` (string, optional) — specific path, or omit for stalest candidate

**Response:** `{ status: "accepted", path, queuePosition, alreadyQueued }`

