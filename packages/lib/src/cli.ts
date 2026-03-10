/**
 * jeeves-meta CLI — ad hoc invocation, debugging, and maintenance.
 *
 * Usage:
 *   npx \@karmaniverous/jeeves-meta <command> [options]
 *
 * Config resolution: --config <path> or JEEVES_META_CONFIG env var.
 *
 * @module cli
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from 'node:path';

import { loadSynthConfig, resolveConfigPath } from './configLoader.js';
import {
  actualStaleness,
  buildOwnershipTree,
  computeEffectiveStaleness,
  discoverMetas,
  findNode,
  GatewayExecutor,
  hasSteerChanged,
  HttpWatcherClient,
  isArchitectTriggered,
  isLocked,
  type MetaJson,
  normalizePath,
  orchestrate,
  type SynthConfig,
} from './index.js';

/** Read and parse a meta.json file with proper typing. */
function readMeta(metaPath: string): MetaJson {
  return JSON.parse(
    readFileSync(join(metaPath, 'meta.json'), 'utf8'),
  ) as MetaJson;
}

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('-'));
const jsonOutput = args.includes('--json');

function usage(): void {
  console.log(`jeeves-meta — Knowledge synthesis engine CLI

Usage: npx @karmaniverous/jeeves-meta <command> [options]

Commands:
  status                          Summary: total, stale, errors, tokens
  list [--prefix <p>] [--filter <f>]  List metas with summary
  detail <path> [--archive <n>]   Full detail for a single meta
  preview [--path <p>]            Dry-run: what would the next cycle do
  synthesize [--path <p>] [--batch <n>]  Run synthesis cycle(s)
  seed <path>                     Create .meta/ directory with fresh meta.json
  unlock <path>                   Force-remove stale .lock file
  validate                        Validate config + check service reachability
  config show                     Dump resolved config

Root options:
  --config <path>   Path to jeeves-meta.config.json (or JEEVES_META_CONFIG env)
  --json            Output as JSON
`);
}

function output(data: unknown): void {
  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function runStatus(config: SynthConfig): Promise<void> {
  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
  const metaPaths = await discoverMetas(config, watcher);
  const tree = buildOwnershipTree(metaPaths);

  let stale = 0;
  let errors = 0;
  let locked = 0;
  let neverSynth = 0;
  let archTokens = 0;
  let buildTokens = 0;
  let critTokens = 0;

  for (const node of tree.nodes.values()) {
    let meta: MetaJson;
    try {
      meta = readMeta(node.metaPath);
    } catch {
      continue;
    }
    const s = actualStaleness(meta);
    if (s > 0) stale++;
    if (meta._error) errors++;
    if (isLocked(normalizePath(node.metaPath))) locked++;
    if (!meta._generatedAt) neverSynth++;
    if (meta._architectTokens) archTokens += meta._architectTokens;
    if (meta._builderTokens) buildTokens += meta._builderTokens;
    if (meta._criticTokens) critTokens += meta._criticTokens;
  }

  output({
    total: tree.nodes.size,
    stale,
    errors,
    locked,
    neverSynthesized: neverSynth,
    tokens: { architect: archTokens, builder: buildTokens, critic: critTokens },
  });
}

async function runList(config: SynthConfig): Promise<void> {
  const prefix = getArg('--prefix');
  const filter = getArg('--filter');
  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
  const metaPaths = await discoverMetas(config, watcher);
  const tree = buildOwnershipTree(metaPaths);

  interface Row {
    path: string;
    depth: number;
    staleness: string;
    hasError: boolean;
    locked: boolean;
    children: number;
  }

  const rows: Row[] = [];
  for (const node of tree.nodes.values()) {
    if (prefix && !node.metaPath.includes(prefix)) continue;
    let meta: MetaJson;
    try {
      meta = readMeta(node.metaPath);
    } catch {
      continue;
    }
    const s = actualStaleness(meta);
    const hasError = Boolean(meta._error);
    const isLockedNow = isLocked(normalizePath(node.metaPath));

    if (filter === 'hasError' && !hasError) continue;
    if (filter === 'stale' && s <= 0) continue;
    if (filter === 'locked' && !isLockedNow) continue;
    if (filter === 'never' && meta._generatedAt) continue;

    rows.push({
      path: node.metaPath,
      depth: meta._depth ?? node.treeDepth,
      staleness: s === Infinity ? 'never' : String(Math.round(s)) + 's',
      hasError,
      locked: isLockedNow,
      children: node.children.length,
    });
  }

  output({ total: rows.length, items: rows });
}

async function runDetail(config: SynthConfig): Promise<void> {
  const targetPath = args.find((a) => !a.startsWith('-') && a !== 'detail');
  if (!targetPath) {
    console.error('Usage: jeeves-meta detail <path> [--archive <n>]');
    process.exit(1);
  }

  const archiveArg = getArg('--archive');
  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
  const metaPaths = await discoverMetas(config, watcher);
  const tree = buildOwnershipTree(metaPaths);
  const normalized = normalizePath(targetPath);

  const node = findNode(tree, normalized);
  if (!node) {
    console.error('Meta not found: ' + targetPath);
    process.exit(1);
  }

  const meta = readMeta(node.metaPath);
  const result: Record<string, unknown> = { meta };

  if (archiveArg) {
    const { listArchiveFiles } = await import('./archive/index.js');
    const archiveFiles = listArchiveFiles(node.metaPath);
    const limit = parseInt(archiveArg, 10) || archiveFiles.length;
    const selected = archiveFiles.slice(-limit).reverse();
    result.archive = selected.map((af) => {
      const raw = readFileSync(join(node.metaPath, 'archive', af), 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    });
  }

  output(result);
}

async function runPreview(config: SynthConfig): Promise<void> {
  const targetPath = getArg('--path');
  const {
    filterInScope,
    paginatedScan,
    readLatestArchive,
    computeStructureHash,
    selectCandidate,
  } = await import('./index.js');

  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
  const metaPaths = await discoverMetas(config, watcher);
  const tree = buildOwnershipTree(metaPaths);

  let targetNode;
  if (targetPath) {
    const normalized = normalizePath(targetPath);
    targetNode = findNode(tree, normalized);
    if (!targetNode) {
      console.error('Meta not found: ' + targetPath);
      process.exit(1);
    }
  } else {
    const candidates = [];
    for (const node of tree.nodes.values()) {
      let meta: MetaJson;
      try {
        meta = readMeta(node.metaPath);
      } catch {
        continue;
      }
      const s = actualStaleness(meta);
      if (s > 0) candidates.push({ node, meta, actualStaleness: s });
    }
    const weighted = computeEffectiveStaleness(candidates, config.depthWeight);
    const winner = selectCandidate(weighted);
    if (!winner) {
      output({ message: 'No stale metas found.' });
      return;
    }
    targetNode = winner.node;
  }

  const meta = readMeta(targetNode.metaPath);
  const allFiles = await paginatedScan(watcher, {
    pathPrefix: targetNode.ownerPath,
  });
  const scopeFiles = filterInScope(
    targetNode,
    allFiles.map((f) => f.file_path),
  );
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

  output({
    target: targetNode.metaPath,
    ownerPath: targetNode.ownerPath,
    depth: meta._depth ?? targetNode.treeDepth,
    staleness:
      actualStaleness(meta) === Infinity
        ? 'never'
        : String(Math.round(actualStaleness(meta))) + 's',
    scopeFiles: scopeFiles.length,
    structureChanged,
    steerChanged,
    architectTriggered,
  });
}

async function runSynthesize(config: SynthConfig): Promise<void> {
  const targetPath = getArg('--path');
  const batchArg = getArg('--batch');

  const effectiveConfig = {
    ...config,
    ...(batchArg ? { batchSize: parseInt(batchArg, 10) } : {}),
  };

  const executor = new GatewayExecutor({
    gatewayUrl: config.gatewayUrl,
    apiKey: config.gatewayApiKey,
  });
  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });

  const results = await orchestrate(
    effectiveConfig,
    executor,
    watcher,
    targetPath ?? undefined,
  );
  const synthesized = results.filter((r) => r.synthesized);

  output({
    synthesizedCount: synthesized.length,
    results: synthesized.map((r) => ({
      metaPath: r.metaPath,
      error: r.error ?? null,
    })),
  });
}

async function runSeed(): Promise<void> {
  const { mkdirSync, writeFileSync: writeFs } = await import('node:fs');
  const { randomUUID } = await import('node:crypto');

  const targetPath = args.find((a) => !a.startsWith('-') && a !== 'seed');
  if (!targetPath) {
    console.error('Usage: jeeves-meta seed <path>');
    process.exit(1);
  }

  const metaDir = targetPath.endsWith('.meta')
    ? targetPath
    : join(targetPath, '.meta');
  mkdirSync(metaDir, { recursive: true });
  const metaFile = join(metaDir, 'meta.json');
  writeFs(metaFile, JSON.stringify({ _id: randomUUID() }, null, 2) + '\n');
  output({ created: metaFile });
}

async function runUnlock(): Promise<void> {
  const { unlinkSync } = await import('node:fs');
  const targetPath = args.find((a) => !a.startsWith('-') && a !== 'unlock');
  if (!targetPath) {
    console.error('Usage: jeeves-meta unlock <path>');
    process.exit(1);
  }

  const metaDir = targetPath.endsWith('.meta')
    ? targetPath
    : join(targetPath, '.meta');
  const lockFile = join(metaDir, '.lock');
  try {
    unlinkSync(lockFile);
    output({ unlocked: metaDir });
  } catch {
    output({ message: 'No lock file found at ' + lockFile });
  }
}

async function runValidate(config: SynthConfig): Promise<void> {
  const checks: Record<string, string> = {};

  // Check watcher
  try {
    const res = await fetch(config.watcherUrl + '/status', {
      signal: AbortSignal.timeout(5000),
    });
    checks.watcher = res.ok
      ? 'OK (' + config.watcherUrl + ')'
      : 'HTTP ' + res.status.toString();
  } catch {
    checks.watcher = 'UNREACHABLE (' + config.watcherUrl + ')';
  }

  // Check gateway
  try {
    const res = await fetch(config.gatewayUrl + '/api/status', {
      signal: AbortSignal.timeout(5000),
    });
    checks.gateway = res.ok
      ? 'OK (' + config.gatewayUrl + ')'
      : 'HTTP ' + res.status.toString();
  } catch {
    checks.gateway = 'UNREACHABLE (' + config.gatewayUrl + ')';
  }

  // Check meta discovery via watcher
  try {
    const watcherClient = new HttpWatcherClient({ baseUrl: config.watcherUrl });
    const metaPaths = await discoverMetas(config, watcherClient);
    checks.metas =
      String(metaPaths.length) + ' .meta/ entities discovered via watcher';
  } catch {
    checks.metas = 'FAILED — could not discover metas (watcher may be down)';
  }

  output({ config: 'valid', checks });
}

function runConfigShow(config: SynthConfig): void {
  // Show config with prompts truncated for readability
  const display = {
    ...config,
    defaultArchitect:
      config.defaultArchitect.slice(0, 100) +
      '... (' +
      String(config.defaultArchitect.length) +
      ' chars)',
    defaultCritic:
      config.defaultCritic.slice(0, 100) +
      '... (' +
      String(config.defaultCritic.length) +
      ' chars)',
  };
  output(display);
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

async function main(): Promise<void> {
  if (
    !command ||
    command === 'help' ||
    args.includes('--help') ||
    args.includes('-h')
  ) {
    usage();
    return;
  }

  // Commands that don't need config
  if (command === 'seed') {
    await runSeed();
    return;
  }
  if (command === 'unlock') {
    await runUnlock();
    return;
  }

  // All other commands need config
  let configPath: string;
  try {
    configPath = resolveConfigPath(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let config: SynthConfig;
  try {
    config = loadSynthConfig(resolve(configPath));
  } catch (err) {
    console.error(
      'Failed to load config:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  switch (command) {
    case 'status':
      await runStatus(config);
      break;
    case 'list':
      await runList(config);
      break;
    case 'detail':
      await runDetail(config);
      break;
    case 'preview':
      await runPreview(config);
      break;
    case 'synthesize':
      await runSynthesize(config);
      break;
    case 'validate':
      await runValidate(config);
      break;
    case 'config':
      if (args.includes('show')) {
        runConfigShow(config);
      } else if (args.includes('check')) {
        await runValidate(config);
      } else {
        console.error(
          'Unknown config subcommand. Use: config show, config check',
        );
        process.exit(1);
      }
      break;
    default:
      console.error('Unknown command: ' + command);
      usage();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
