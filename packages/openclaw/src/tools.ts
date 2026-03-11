/**
 * Meta tool registrations for OpenClaw.
 *
 * @module tools
 */

import {
  actualStaleness,
  computeEffectiveStaleness,
  computeStructureHash,
  filterInScope,
  findNode,
  hasSteerChanged,
  HttpWatcherClient,
  isArchitectTriggered,
  listMetas,
  type MetaJson,
  normalizePath,
  paginatedScan,
  readLatestArchive,
  selectCandidate,
} from '@karmaniverous/jeeves-meta';

import { loadMetaConfig } from './configLoader.js';
import {
  fail,
  getConfigPath,
  ok,
  type PluginApi,
  type ToolResult,
} from './helpers.js';

/** Register all meta_* tools. */
export function registerMetaTools(api: PluginApi): void {
  const configPath = getConfigPath(api);

  // Lazy-load config (resolved once on first use)
  let _config: ReturnType<typeof loadMetaConfig> | null = null;

  const getConfig = () => {
    if (!_config) {
      _config = loadMetaConfig(configPath);
    }
    return _config;
  };

  /** Derive watcherUrl from loaded config. */
  const getWatcherUrl = (): string => getConfig().watcherUrl;

  /** Create a watcher client. */
  const getWatcher = () => new HttpWatcherClient({ baseUrl: getWatcherUrl() });

  // ─── meta_list ──────────────────────────────────────────────
  api.registerTool({
    name: 'meta_list',
    description:
      'List metas with summary stats and per-meta projection. Replaces meta_status + meta_entities.',
    parameters: {
      type: 'object',
      properties: {
        pathPrefix: {
          type: 'string',
          description: 'Filter metas by path prefix (e.g. "github/").',
        },
        filter: {
          type: 'object',
          description:
            'Structured filter. Supported keys: hasError (boolean), staleHours (number, min hours stale), neverSynthesized (boolean), locked (boolean).',
          properties: {
            hasError: { type: 'boolean' },
            staleHours: { type: 'number' },
            neverSynthesized: { type: 'boolean' },
            locked: { type: 'boolean' },
          },
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Fields to include per meta. Default: path, depth, emphasis, stalenessSeconds, lastSynthesized, hasError, locked, architectTokens, builderTokens, criticTokens.',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const pathPrefix = params.pathPrefix as string | undefined;
        const config = getConfig();
        const result = await listMetas(config, getWatcher());

        // Apply path prefix filter
        let entries = result.entries;
        if (pathPrefix) {
          entries = entries.filter((e) => e.path.includes(pathPrefix));
        }

        // Apply structured filter
        const filter = params.filter as Record<string, unknown> | undefined;
        if (filter) {
          entries = entries.filter((e) => {
            if (filter.hasError !== undefined && e.hasError !== filter.hasError)
              return false;
            if (
              filter.neverSynthesized !== undefined &&
              (e.stalenessSeconds === Infinity) !== filter.neverSynthesized
            )
              return false;
            if (filter.locked !== undefined && e.locked !== filter.locked)
              return false;
            if (
              typeof filter.staleHours === 'number' &&
              e.stalenessSeconds < filter.staleHours * 3600
            )
              return false;
            return true;
          });
        }

        // Recompute summary for filtered entries
        let staleCount = 0;
        let errorCount = 0;
        let lockedCount = 0;
        let neverSynthesizedCount = 0;
        let totalArchTokens = 0;
        let totalBuilderTokens = 0;
        let totalCriticTokens = 0;
        let lastSynthPath: string | null = null;
        let lastSynthAt: string | null = null;
        let stalestPath: string | null = null;
        let stalestEffective = -1;

        for (const e of entries) {
          if (e.stalenessSeconds > 0) staleCount++;
          if (e.hasError) errorCount++;
          if (e.locked) lockedCount++;
          if (e.stalenessSeconds === Infinity) neverSynthesizedCount++;
          if (e.architectTokens) totalArchTokens += e.architectTokens;
          if (e.builderTokens) totalBuilderTokens += e.builderTokens;
          if (e.criticTokens) totalCriticTokens += e.criticTokens;

          if (
            e.lastSynthesized &&
            (!lastSynthAt || e.lastSynthesized > lastSynthAt)
          ) {
            lastSynthAt = e.lastSynthesized;
            lastSynthPath = e.path;
          }

          const depthFactor = Math.pow(1 + config.depthWeight, e.depth);
          const effectiveStaleness =
            (e.stalenessSeconds === Infinity
              ? Number.MAX_SAFE_INTEGER
              : e.stalenessSeconds) *
            depthFactor *
            e.emphasis;
          if (effectiveStaleness > stalestEffective) {
            stalestEffective = effectiveStaleness;
            stalestPath = e.path;
          }
        }

        // Project fields
        const fields = params.fields as string[] | undefined;
        const items = entries.map((e) => {
          const stalenessDisplay =
            e.stalenessSeconds === Infinity
              ? 'never-synthesized'
              : Math.round(e.stalenessSeconds);
          const display: Record<string, unknown> = {
            path: e.path,
            depth: e.depth,
            emphasis: e.emphasis,
            stalenessSeconds: stalenessDisplay,
            lastSynthesized: e.lastSynthesized,
            hasError: e.hasError,
            locked: e.locked,
            architectTokens: e.architectTokens,
            builderTokens: e.builderTokens,
            criticTokens: e.criticTokens,
            children: e.children,
          };
          if (fields) {
            const projected: Record<string, unknown> = {};
            for (const f of fields) {
              if (f in display) projected[f] = display[f];
            }
            return projected;
          }
          return display;
        });

        return ok({
          summary: {
            total: entries.length,
            stale: staleCount,
            errors: errorCount,
            locked: lockedCount,
            neverSynthesized: neverSynthesizedCount,
            tokens: {
              architect: totalArchTokens,
              builder: totalBuilderTokens,
              critic: totalCriticTokens,
            },
            stalestPath,
            lastSynthesizedPath: lastSynthPath,
            lastSynthesizedAt: lastSynthAt,
          },
          items: items.sort((a, b) => {
            const ap = typeof a.path === 'string' ? a.path : '';
            const bp = typeof b.path === 'string' ? b.path : '';
            return ap.localeCompare(bp);
          }),
        });
      } catch (error) {
        return fail(error);
      }
    },
  });

  // ─── meta_detail ────────────────────────────────────────────
  api.registerTool({
    name: 'meta_detail',
    description:
      'Full detail for a single meta, with optional archive history.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Path to .meta/ directory or owner directory (required).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Fields to include. Default: all except _architect, _builder, _critic, _content, _feedback.',
        },
        includeArchive: {
          oneOf: [{ type: 'boolean' }, { type: 'number' }],
          description:
            'false (default), true (all snapshots), or number (N most recent).',
        },
      },
      required: ['path'],
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const targetPath = normalizePath(params.path as string);
        const includeArchive = params.includeArchive as
          | boolean
          | number
          | undefined;
        const defaultExclude = new Set([
          '_architect',
          '_builder',
          '_critic',
          '_content',
          '_feedback',
        ]);
        const fields = params.fields as string[] | undefined;

        const result = await listMetas(getConfig(), getWatcher());

        const targetNode = findNode(result.tree, targetPath);
        if (!targetNode) {
          return fail('Meta path not found: ' + targetPath);
        }

        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const meta = JSON.parse(
          readFileSync(join(targetNode.metaPath, 'meta.json'), 'utf8'),
        ) as Record<string, unknown>;

        // Apply field projection
        const projectMeta = (
          m: Record<string, unknown>,
        ): Record<string, unknown> => {
          if (fields) {
            const result: Record<string, unknown> = {};
            for (const f of fields) result[f] = m[f];
            return result;
          }
          const result: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(m)) {
            if (!defaultExclude.has(k)) result[k] = v;
          }
          return result;
        };

        const response: Record<string, unknown> = {
          meta: projectMeta(meta as unknown as Record<string, unknown>),
        };

        // Archive history
        if (includeArchive) {
          const { readFileSync } = await import('node:fs');
          const { join } = await import('node:path');
          const { listArchiveFiles } =
            await import('@karmaniverous/jeeves-meta');

          const archiveFiles = listArchiveFiles(targetNode.metaPath);
          const limit =
            typeof includeArchive === 'number'
              ? includeArchive
              : archiveFiles.length;

          const selected = archiveFiles.slice(-limit).reverse();
          const archives = selected.map((af) => {
            const raw = readFileSync(
              join(targetNode.metaPath, 'archive', af),
              'utf8',
            );
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return projectMeta(parsed);
          });

          response.archive = archives;
        }

        return ok(response);
      } catch (error) {
        return fail(error);
      }
    },
  });

  // ─── meta_preview ────────────────────────────────────────────
  api.registerTool({
    name: 'meta_preview',
    description:
      'Dry-run: show what inputs would be gathered for the next synthesis cycle without running LLM.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional: specific .meta/ path to preview. If omitted, previews the stalest candidate.',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const targetPath = params.path as string | undefined;
        const config = getConfig();
        const watcher = getWatcher();
        const result = await listMetas(config, watcher);

        let targetNode;
        if (targetPath) {
          const normalized = normalizePath(targetPath);
          targetNode = findNode(result.tree, normalized);
          if (!targetNode) {
            return fail('Meta path not found: ' + targetPath);
          }
        } else {
          // Select stalest candidate
          const candidates = result.entries
            .filter((e) => e.stalenessSeconds > 0)
            .map((e) => ({
              node: e.node,
              meta: e.meta,
              actualStaleness: e.stalenessSeconds,
            }));
          const weighted = computeEffectiveStaleness(
            candidates,
            config.depthWeight,
          );
          const winner = selectCandidate(weighted);
          if (!winner) {
            return ok({
              message: 'No stale metas found. Nothing to synthesize.',
            });
          }
          targetNode = winner.node;
        }

        const { readFileSync: readMeta } = await import('node:fs');
        const { join: joinMeta } = await import('node:path');
        const meta: MetaJson = JSON.parse(
          readMeta(joinMeta(targetNode.metaPath, 'meta.json'), 'utf8'),
        ) as MetaJson;

        // Scope files
        const allScanFiles = await paginatedScan(watcher, {
          pathPrefix: targetNode.ownerPath,
        });
        const allFiles = allScanFiles.map((f) => f.file_path);
        const scopeFiles = filterInScope(targetNode, allFiles);

        const structureHash = computeStructureHash(scopeFiles);
        const structureChanged = structureHash !== meta._structureHash;

        const latestArchive = readLatestArchive(targetNode.metaPath);
        const steerChanged = hasSteerChanged(
          meta._steer,
          latestArchive?._steer,
          Boolean(latestArchive),
        );

        const architectTriggered = isArchitectTriggered(
          meta,
          structureChanged,
          steerChanged,
          config.architectEvery,
        );

        let deltaFiles: string[] = [];
        if (meta._generatedAt) {
          const modifiedAfter = Math.floor(
            new Date(meta._generatedAt).getTime() / 1000,
          );
          const deltaScanFiles = await paginatedScan(watcher, {
            pathPrefix: targetNode.ownerPath,
            modifiedAfter,
          });
          deltaFiles = filterInScope(
            targetNode,
            deltaScanFiles.map((f) => f.file_path),
          );
        } else {
          deltaFiles = scopeFiles;
        }

        return ok({
          target: targetNode.metaPath,
          ownerPath: targetNode.ownerPath,
          depth: meta._depth ?? targetNode.treeDepth,
          staleness:
            actualStaleness(meta) === Infinity
              ? 'never-synthesized'
              : Math.round(actualStaleness(meta)).toString() + 's',
          scopeFiles: {
            count: scopeFiles.length,
            sample: scopeFiles.slice(0, 20),
          },
          deltaFiles: {
            count: deltaFiles.length,
            sample: deltaFiles.slice(0, 20),
          },
          structureChanged,
          steerChanged,
          architectTriggered,
          architectTriggerReasons: [
            ...(!meta._builder ? ['no cached builder (first run)'] : []),
            ...(structureChanged ? ['structure changed'] : []),
            ...(steerChanged ? ['steer changed'] : []),
            ...((meta._synthesisCount ?? 0) >= config.architectEvery
              ? ['periodic refresh (architectEvery)']
              : []),
          ],
          currentSteer: meta._steer ?? null,
          hasExistingContent: Boolean(meta._content),
          hasExistingFeedback: Boolean(meta._feedback),
          children: targetNode.children.map((c) => c.metaPath),
        });
      } catch (error) {
        return fail(error);
      }
    },
  });

  // ─── meta_trigger ────────────────────────────────────────────
  api.registerTool({
    name: 'meta_trigger',
    description:
      'Manually trigger synthesis for a specific meta or the next-stalest candidate. Runs the full 3-step cycle (architect, builder, critic).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional: specific .meta/ or owner path to synthesize. If omitted, synthesizes the stalest candidate.',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const { orchestrate, listMetas } =
          await import('@karmaniverous/jeeves-meta');
        const { GatewayExecutor } = await import('@karmaniverous/jeeves-meta');

        const config = getConfig();
        const watcher = getWatcher();
        const targetPath = params.path as string | undefined;

        // Pre-flight: verify there are discoverable metas and a valid target
        const list = await listMetas(config, watcher);
        if (list.entries.length === 0) {
          return ok({
            status: 'skipped',
            message: 'No metas discovered — nothing to synthesize.',
          });
        }

        if (targetPath) {
          const { normalizePath } = await import('@karmaniverous/jeeves-meta');
          const normalized = normalizePath(targetPath);
          const found = list.entries.some(
            (e) =>
              normalizePath(e.path) === normalized ||
              normalizePath(e.path) === normalized + '/.meta',
          );
          if (!found) {
            return ok({
              status: 'skipped',
              message:
                'Target path not found in discovered metas: ' + targetPath,
            });
          }
        }

        // Fire-and-forget: run orchestration in background
        const executor = new GatewayExecutor({
          gatewayUrl: config.gatewayUrl,
          apiKey: config.gatewayApiKey,
        });

        void orchestrate(config, executor, watcher, targetPath).then(
          (results) => {
            const synthesized = results.filter((r) => r.synthesized);
            if (synthesized.length > 0) {
              console.log(
                '[jeeves-meta] Synthesis complete:',
                synthesized.length,
                'meta(s).',
                synthesized.some((r) => r.error)
                  ? 'Some had errors.'
                  : 'All succeeded.',
              );
            }
          },
          (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[jeeves-meta] Synthesis failed:', msg);
          },
        );

        return ok({
          status: 'accepted',
          target: targetPath ?? 'stalest candidate',
          message:
            'Synthesis started in background.' +
            ' Results will appear in meta.json when complete.',
        });
      } catch (error) {
        return fail(error);
      }
    },
  });
}
