# Plugin Setup

## Installation

```bash
npm install @karmaniverous/jeeves-meta-openclaw
npx @karmaniverous/jeeves-meta-openclaw install
```

## Prerequisites

The plugin requires the **jeeves-meta service** to be running. The plugin itself contains no synthesis logic — it delegates all operations via HTTP.

## Service URL Resolution

The plugin resolves the service URL in this order:

1. **Plugin config** — `serviceUrl` in the OpenClaw plugin config
2. **Environment variable** — `JEEVES_META_URL`
3. **Default** — `http://127.0.0.1:1938`

## Plugin Config

In your OpenClaw configuration (`openclaw.json` or equivalent):

```json
{
  "plugins": {
    "entries": {
      "jeeves-meta-openclaw": {
        "enabled": true,
        "config": {
          "serviceUrl": "http://127.0.0.1:1938"
        }
      }
    }
  }
}
```

## Lifecycle

On gateway startup:
1. Plugin registers 4 tools (`meta_list`, `meta_detail`, `meta_trigger`, `meta_preview`)
2. Starts periodic TOOLS.md writer (5s initial delay, then every 60s)
3. TOOLS.md writer queries `/status` and `/metas` from the service and upserts a `## Meta` section

The plugin does **not** register virtual rules — that is the service's responsibility via the `RuleRegistrar`.

