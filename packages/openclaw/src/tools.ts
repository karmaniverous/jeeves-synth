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
  readLatestArchive,
  selectCandidate,
} from '@karmaniverous/jeeves-synth';

import {
  fail,
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

  // ─── synth_status ─────────────────────────────────────────────
  api.registerTool({
    name: 'synth_status',
    description:
      'Engine status: meta count, stale count, last synthesized, stalest candidate.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (): Promise<ToolResult> => {
      try {
        await Promise.resolve();
        const metaPaths = globMetas(watchPaths);
        const metas = metaPaths.map((mp) => ({
          path: mp,
          meta: ensureMetaJson(mp),
        }));

        const staleCount = metas.filter(
          (m) => actualStaleness(m.meta) > 0,
        ).length;

        // Find most recently synthesized
        let lastSynthesized: { path: string; at: string } | null = null;
        for (const m of metas) {
          if (m.meta._generatedAt) {
            if (!lastSynthesized || m.meta._generatedAt > lastSynthesized.at) {
              lastSynthesized = {
                path: m.path,
                at: m.meta._generatedAt,
              };
            }
          }
        }

        // Find stalest candidate
        const tree = buildOwnershipTree(metaPaths);
        const candidates = [];
        for (const node of tree.nodes.values()) {
          const meta = metas.find(
            (m) => m.path.replaceAll('\\', '/') === node.metaPath,
          )?.meta;
          if (!meta) continue;
          const staleness = actualStaleness(meta);
          if (staleness > 0) {
            candidates.push({ node, meta, actualStaleness: staleness });
          }
        }
        const weighted = computeEffectiveStaleness(candidates, 1);
        const stalest = selectCandidate(weighted);

        return ok({
          totalMetas: metaPaths.length,
          staleCount,
          lastSynthesized,
          stalestCandidate: stalest
            ? {
                path: stalest.node.metaPath,
                actualStalenessSeconds: Math.round(stalest.actualStaleness),
                effectiveStaleness: Math.round(stalest.effectiveStaleness),
              }
            : null,
        });
      } catch (error) {
        return fail(error);
      }
    },
  });

  // ─── synth_entities ───────────────────────────────────────────
  api.registerTool({
    name: 'synth_entities',
    description:
      'List all .meta/ directories with staleness, last synthesized, depth, and lock status.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (): Promise<ToolResult> => {
      try {
        await Promise.resolve();
        const metaPaths = globMetas(watchPaths);
        const tree = buildOwnershipTree(metaPaths);

        const entities = [];
        for (const node of tree.nodes.values()) {
          const meta = ensureMetaJson(
            node.metaPath.replaceAll('/', '\\').replace(/^\//, ''),
          );
          // Actually we need the original OS path, not the normalized one
          // ensureMetaJson needs the real fs path
          const staleness = actualStaleness(meta);
          entities.push({
            metaPath: node.metaPath,
            ownerPath: node.ownerPath,
            depth: meta._depth ?? node.treeDepth,
            stalenessSeconds:
              staleness === Infinity
                ? 'never-synthesized'
                : Math.round(staleness),
            lastSynthesized: meta._generatedAt ?? null,
            hasContent: Boolean(meta._content),
            hasError: Boolean(meta._error),
            locked: isLocked(node.metaPath.replaceAll('/', '\\')),
            children: node.children.length,
          });
        }

        return ok({
          count: entities.length,
          entities: entities.sort((a, b) =>
            a.metaPath.localeCompare(b.metaPath),
          ),
        });
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
          const weighted = computeEffectiveStaleness(candidates, 1);
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

        // Scope files
        const scanResult = await watcher.scan({
          pathPrefix: targetNode.ownerPath,
        });
        const allFiles = scanResult.files.map((f) => f.file_path);
        const scopeFiles = filterInScope(targetNode, allFiles);

        // Structure hash
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
          (meta._synthesisCount ?? 0) >= 10;

        // Delta files
        let deltaFiles: string[] = [];
        if (meta._generatedAt) {
          const modifiedAfter = Math.floor(
            new Date(meta._generatedAt).getTime() / 1000,
          );
          const deltaResult = await watcher.scan({
            pathPrefix: targetNode.ownerPath,
            modifiedAfter,
          });
          deltaFiles = filterInScope(
            targetNode,
            deltaResult.files.map((f) => f.file_path),
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
            ...((meta._synthesisCount ?? 0) >= 10
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
}
