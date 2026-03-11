# @karmaniverous/jeeves-meta-openclaw

OpenClaw plugin for [jeeves-meta](../service/). A thin HTTP client that registers interactive tools and maintains dynamic TOOLS.md content.

## Features

- **Four interactive tools** — `meta_list`, `meta_detail`, `meta_trigger`, `meta_preview`
- **MetaServiceClient** — HTTP client delegating all operations to the running service
- **TOOLS.md injection** — periodic refresh of entity stats and tool listing in the agent's system prompt
- **Dependency health** — shows warnings when watcher/gateway are degraded
- **Consumer skill** — `SKILL.md` for agent integration

## Install

```bash
npm install @karmaniverous/jeeves-meta-openclaw
```

Then run the CLI installer to register with the OpenClaw gateway:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

## Configuration

The plugin resolves the service URL in order:
1. Plugin config `serviceUrl` in `openclaw.json`
2. `JEEVES_META_URL` environment variable
3. Default: `http://127.0.0.1:1938`

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

## Documentation

- **[Plugin Setup](guides/plugin-setup.md)** — installation, config, lifecycle
- **[Tools Reference](guides/tools-reference.md)** — meta_list, meta_detail, meta_trigger, meta_preview
- **[Virtual Rules](guides/virtual-rules.md)** — watcher inference rules
- **[TOOLS.md Injection](guides/tools-injection.md)** — dynamic prompt generation

## License

BSD-3-Clause

