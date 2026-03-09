/**
 * Synth tool registrations for OpenClaw.
 *
 * @module tools
 */

import {
  actualStaleness,
  buildOwnershipTree,
  computeEffectiveStaleness,
  computeStructureHash,
  ensureMetaJson,
  filterInScope,
  globMetas,
  HttpWatcherClient,
  isLocked,
  paginatedScan,
  readLatestArchive,
  selectCandidate,
  type SynthConfig,
} from '@karmaniverous/jeeves-meta';

import { loadSynthConfig } from './configLoader.js';
import {
  fail,
  getConfigPath,
  getWatcherUrl,
  getWatchPaths,
  ok,
  type PluginApi,
  type ToolResult,
} from './helpers.js';

/** Register all synth_* tools. */
export function registerSynthTools(api: PluginApi): void {
  const watcherUrl = getWatcherUrl(api);
  const watchPaths = getWatchPaths(api);
  const configPath = getConfigPath(api);

  // Lazy-load config (resolved once on first use)
  let _config: SynthConfig | null = null;

  interface SynthEntity {
    path: string;
    depth: number;
    emphasis: number;
    stalenessSeconds: number | 'never-synthesized';
    lastSynthesized: string | null;
    hasError: boolean;
    locked: boolean;
    architectTokens: number | null;
    builderTokens: number | null;
    criticTokens: number | null;
    children: number;
  }

  const getConfig = (): SynthConfig => {
    if (!_config) {
      _config = loadSynthConfig(configPath);
    }
    return _config;
  };

  // ─── synth_list ──────────────────────────────────────────────
  api.registerTool({
    // TODO: migrate from filesystem glob to watcher_scan for dashboard performance
    name: 'synth_list',
    description:
      'List metas with summary stats and per-meta projection. Replaces synth_status + synth_entities.',
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
        await Promise.resolve();
        const metaPaths = globMetas(watchPaths);
        const tree = buildOwnershipTree(metaPaths);

        const entities: Array<
          SynthEntity | Record<string, SynthEntity[keyof SynthEntity]>
        > = [];
        let staleCount = 0;
        let errorCount = 0;
        let lockedCount = 0;
        let neverSynthesized = 0;
        let totalArchTokens = 0;
        let totalBuilderTokens = 0;
        let totalCriticTokens = 0;
        let lastSynthPath: string | null = null;
        let lastSynthAt: string | null = null;
        let stalestPath: string | null = null;
        const staleCandidates: Array<{
          node: Parameters<typeof computeEffectiveStaleness>[0][0]['node'];
          meta: Parameters<typeof computeEffectiveStaleness>[0][0]['meta'];
          actualStaleness: number;
          metaPath: string;
        }> = [];

        for (const node of tree.nodes.values()) {
          if (pathPrefix && !node.metaPath.includes(pathPrefix)) continue;

          const meta = ensureMetaJson(node.metaPath);

          // Apply structured filter
          const filter = params.filter as Record<string, unknown> | undefined;
          if (filter) {
            const staleness = actualStaleness(meta);
            const hasErr = Boolean(meta._error);
            const locked = isLocked(node.metaPath.replaceAll('/', '\\'));
            const neverSynth = !meta._generatedAt;

            if (filter.hasError !== undefined && hasErr !== filter.hasError)
              continue;
            if (
              filter.neverSynthesized !== undefined &&
              neverSynth !== filter.neverSynthesized
            )
              continue;
            if (filter.locked !== undefined && locked !== filter.locked)
              continue;
            if (
              typeof filter.staleHours === 'number' &&
              staleness < filter.staleHours * 3600
            )
              continue;
          }
          const staleness = actualStaleness(meta);
          const locked = isLocked(node.metaPath.replaceAll('/', '\\'));
          const hasError = Boolean(meta._error);

          if (staleness > 0) staleCount++;
          if (hasError) errorCount++;
          if (locked) lockedCount++;
          if (!meta._generatedAt) neverSynthesized++;
          if (meta._architectTokens) totalArchTokens += meta._architectTokens;
          if (meta._builderTokens) totalBuilderTokens += meta._builderTokens;
          if (meta._criticTokens) totalCriticTokens += meta._criticTokens;

          if (
            meta._generatedAt &&
            (!lastSynthAt || meta._generatedAt > lastSynthAt)
          ) {
            lastSynthAt = meta._generatedAt;
            lastSynthPath = node.metaPath;
          }

          // Collect for batch staleness computation
          staleCandidates.push({
            node,
            meta,
            actualStaleness:
              staleness === Infinity ? Number.MAX_SAFE_INTEGER : staleness,
            metaPath: node.metaPath,
          });

          const fields = params.fields as string[] | undefined;
          const raw: SynthEntity = {
            path: node.metaPath,
            depth: meta._depth ?? node.treeDepth,
            emphasis: meta._emphasis ?? 1,
            stalenessSeconds:
              staleness === Infinity
                ? 'never-synthesized'
                : Math.round(staleness),
            lastSynthesized: meta._generatedAt ?? null,
            hasError,
            locked,
            architectTokens: meta._architectTokens ?? null,
            builderTokens: meta._builderTokens ?? null,
            criticTokens: meta._criticTokens ?? null,
            children: node.children.length,
          };
          // Apply field projection if specified
          if (fields) {
            const projected: Record<string, SynthEntity[keyof SynthEntity]> =
              {};
            for (const f of fields) {
              if (f in raw) projected[f] = raw[f as keyof SynthEntity];
            }
            entities.push(projected);
          } else {
            entities.push(raw);
          }
        }

        // Compute effective staleness using shared formula
        if (staleCandidates.length > 0) {
          const weighted = computeEffectiveStaleness(
            staleCandidates,
            getConfig().depthWeight,
          );
          const stalest = weighted.reduce((a, b) =>
            b.effectiveStaleness > a.effectiveStaleness ? b : a,
          );
          stalestPath = staleCandidates[weighted.indexOf(stalest)].metaPath;
        }

        return ok({
          summary: {
            total: entities.length,
            stale: staleCount,
            errors: errorCount,
            locked: lockedCount,
            neverSynthesized,
            tokens: {
              architect: totalArchTokens,
              builder: totalBuilderTokens,
              critic: totalCriticTokens,
            },
            stalestPath,
            lastSynthesizedPath: lastSynthPath,
            lastSynthesizedAt: lastSynthAt,
          },
          items: entities.sort((a, b) =>
            String(a.path ?? '').localeCompare(String(b.path ?? '')),
          ),
        });
      } catch (error) {
        return fail(error);
      }
    },
  });

  // ─── synth_detail ────────────────────────────────────────────
  api.registerTool({
    name: 'synth_detail',
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
        const targetPath = (params.path as string).replaceAll('\\', '/');
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

        const metaPaths = globMetas(watchPaths);
        const tree = buildOwnershipTree(metaPaths);

        const targetNode = Array.from(tree.nodes.values()).find(
          (n) => n.metaPath === targetPath || n.ownerPath === targetPath,
        );
        if (!targetNode) {
          return fail('Meta path not found: ' + targetPath);
        }

        const meta = ensureMetaJson(targetNode.metaPath);

        // Apply field projection
        const projectMeta = (
          m: Record<string, unknown>,
        ): Record<string, unknown> => {
          if (fields) {
            const result: Record<string, unknown> = {};
            for (const f of fields) result[f] = m[f];
            return result;
          }
          // Default: exclude big text blobs
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

          // Most recent first (files are sorted by timestamp)
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

  // ─── synth_preview ────────────────────────────────────────────
  api.registerTool({
    name: 'synth_preview',
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
        const metaPaths = globMetas(watchPaths);
        const tree = buildOwnershipTree(metaPaths);

        let targetNode;
        if (targetPath) {
          const normalized = targetPath.replaceAll('\\', '/');
          targetNode = Array.from(tree.nodes.values()).find(
            (n) => n.metaPath === normalized || n.ownerPath === normalized,
          );
          if (!targetNode) {
            return fail('Meta path not found: ' + targetPath);
          }
        } else {
          // Select stalest
          const candidates = [];
          for (const node of tree.nodes.values()) {
            const meta = ensureMetaJson(node.metaPath);
            const staleness = actualStaleness(meta);
            if (staleness > 0) {
              candidates.push({ node, meta, actualStaleness: staleness });
            }
          }
          const weighted = computeEffectiveStaleness(
            candidates,
            getConfig().depthWeight,
          );
          const winner = selectCandidate(weighted);
          if (!winner) {
            return ok({
              message: 'No stale metas found. Nothing to synthesize.',
            });
          }
          targetNode = winner.node;
        }

        const meta = ensureMetaJson(targetNode.metaPath);
        const watcher = new HttpWatcherClient({ baseUrl: watcherUrl });

        // Scope files (paginated for completeness)
        const allScanFiles = await paginatedScan(watcher, {
          pathPrefix: targetNode.ownerPath,
        });
        const allFiles = allScanFiles.map((f) => f.file_path);
        const scopeFiles = filterInScope(targetNode, allFiles);

        // Structure hash on scope-filtered files (matches orchestrator)
        const structureHash = computeStructureHash(scopeFiles);
        const structureChanged = structureHash !== meta._structureHash;

        // Steer change
        const latestArchive = readLatestArchive(targetNode.metaPath);
        const steerChanged = latestArchive
          ? meta._steer !== latestArchive._steer
          : Boolean(meta._steer);

        // Architect trigger check
        const architectTriggered =
          !meta._builder ||
          structureChanged ||
          steerChanged ||
          (meta._synthesisCount ?? 0) >= getConfig().architectEvery;

        // Delta files
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
            ...((meta._synthesisCount ?? 0) >= getConfig().architectEvery
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
  // ─── synth_trigger ────────────────────────────────────────────
  api.registerTool({
    name: 'synth_trigger',
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
        const { orchestrate } = await import('@karmaniverous/jeeves-meta');
        const { GatewayExecutor } = await import('@karmaniverous/jeeves-meta');

        // Load config from canonical config file
        const config = getConfig();

        const executor = new GatewayExecutor();
        const watcher = new HttpWatcherClient({ baseUrl: watcherUrl });

        // If path specified, temporarily override watchPaths to target it
        const targetPath = params.path as string | undefined;
        const effectiveConfig = targetPath
          ? {
              ...config,
              watchPaths: [targetPath.replace(/[/\\]\.meta[/\\]?$/, '')],
            }
          : config;

        const results = await orchestrate(effectiveConfig, executor, watcher);
        const synthesized = results.filter((r) => r.synthesized);

        if (synthesized.length === 0) {
          return ok({
            message:
              'No synthesis performed — no stale metas found or all locked.',
          });
        }

        return ok({
          synthesizedCount: synthesized.length,
          results: synthesized.map((r) => ({
            metaPath: r.metaPath,
            error: r.error ?? null,
          })),
          message:
            synthesized.length.toString() +
            ' meta(s) synthesized.' +
            (synthesized.some((r) => r.error)
              ? ' Some completed with errors.'
              : ''),
        });
      } catch (error) {
        return fail(error);
      }
    },
  });
}
