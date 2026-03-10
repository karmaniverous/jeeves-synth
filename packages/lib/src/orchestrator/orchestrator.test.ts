import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SynthContext } from '../interfaces/index.js';
import type { MetaJson, SynthConfig } from '../schema/index.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import { mergeAndWrite } from './merge.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';

const testRoot = join(tmpdir(), `jeeves-meta-orch-${Date.now().toString()}`);

const sampleConfig: SynthConfig = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:3000',
  depthWeight: 1,
  architectEvery: 10,
  maxArchive: 20,
  maxLines: 500,
  architectTimeout: 120,
  builderTimeout: 600,
  criticTimeout: 300,
  defaultArchitect: 'You are an architect. Analyze the data shape.',
  defaultCritic: 'You are a critic. Evaluate the synthesis.',
  skipUnchanged: true,
  batchSize: 1,
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
};

const sampleMeta: MetaJson = {
  _id: '550e8400-e29b-41d4-a716-446655440000',
  _content: '# Previous synthesis',
  _feedback: 'Good but needs more detail.',
  _steer: 'Focus on trends.',
  _generatedAt: '2026-03-08T07:00:00Z',
};

const sampleCtx: SynthContext = {
  path: '/test/.meta',
  scopeFiles: ['/test/a.md', '/test/b.md', '/test/sub/c.md'],
  deltaFiles: ['/test/b.md'],
  childMetas: { '/test/sub': 'Child synthesis content' },
  previousContent: '# Previous synthesis',
  previousFeedback: 'Good but needs more detail.',
  steer: 'Focus on trends.',
  archives: [],
};

describe('buildArchitectTask', () => {
  it('includes scope, steer, previous content, previous feedback, and child metas', () => {
    const task = buildArchitectTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('You are an architect');
    expect(task).toContain('/test/a.md');
    expect(task).toContain('Focus on trends');
    expect(task).toContain('Previous synthesis');
    expect(task).toContain('Good but needs more detail');
    expect(task).toContain('Child synthesis content');
  });

  it('uses meta._architect override when present', () => {
    const meta: MetaJson = {
      ...sampleMeta,
      _architect: 'Custom architect prompt',
    };
    const task = buildArchitectTask(sampleCtx, meta, sampleConfig);
    expect(task).toContain('Custom architect prompt');
    expect(task).not.toContain('You are an architect');
  });
});

describe('buildBuilderTask', () => {
  it('includes task brief, delta files, and feedback', () => {
    const meta: MetaJson = {
      ...sampleMeta,
      _builder: 'Analyze email patterns',
    };
    const task = buildBuilderTask(sampleCtx, meta, sampleConfig);
    expect(task).toContain('Analyze email patterns');
    expect(task).toContain('/test/b.md');
    expect(task).toContain('Good but needs more detail');
  });
});

describe('buildCriticTask', () => {
  it('includes system prompt, content to evaluate, and scope', () => {
    const task = buildCriticTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('You are a critic');
    expect(task).toContain('Previous synthesis');
    expect(task).toContain('Focus on trends');
  });
});

describe('parseArchitectOutput', () => {
  it('trims and returns text', () => {
    expect(parseArchitectOutput('  task brief  \n')).toBe('task brief');
  });
});

describe('parseBuilderOutput', () => {
  it('parses JSON with _content', () => {
    const out = parseBuilderOutput(
      JSON.stringify({
        _content: '# Synthesis',
        topics: ['a', 'b'],
      }),
    );
    expect(out.content).toBe('# Synthesis');
    expect(out.fields).toEqual({ topics: ['a', 'b'] });
  });

  it('handles markdown-fenced JSON', () => {
    const out = parseBuilderOutput('```json\n{"_content": "hi"}\n```');
    expect(out.content).toBe('hi');
  });

  it('treats non-JSON output as plain content', () => {
    const out = parseBuilderOutput('Just a narrative');
    expect(out.content).toBe('Just a narrative');
    expect(out.fields).toEqual({});
  });
});

describe('parseCriticOutput', () => {
  it('trims and returns text', () => {
    expect(parseCriticOutput('  good work  \n')).toBe('good work');
  });
});

describe('mergeAndWrite', () => {
  const metaPath = join(testRoot, '.meta');

  it('writes merged meta.json', () => {
    mkdirSync(metaPath, { recursive: true });

    const result = mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'architect prompt',
      builder: 'builder brief',
      critic: 'critic prompt',
      builderOutput: { content: '# New synthesis', fields: { topics: ['x'] } },
      feedback: 'Excellent.',
      structureHash: 'abc123',
      synthesisCount: 1,
      error: null,
    });

    expect(result._content).toBe('# New synthesis');
    expect(result._feedback).toBe('Excellent.');
    expect(result._structureHash).toBe('abc123');
    expect(result._synthesisCount).toBe(1);
    expect(result._id).toBe(sampleMeta._id);
    expect(result._steer).toBe('Focus on trends.');
    // Structured fields
    expect((result as Record<string, unknown>).topics).toEqual(['x']);

    rmSync(testRoot, { recursive: true, force: true });
  });

  it('preserves previous content when builder is null', () => {
    mkdirSync(metaPath, { recursive: true });

    const result = mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'a',
      builder: 'b',
      critic: 'c',
      builderOutput: null,
      feedback: null,
      structureHash: 'hash',
      synthesisCount: 0,
      error: { step: 'builder', code: 'FAILED', message: 'timeout' },
    });

    expect(result._content).toBe('# Previous synthesis');
    expect(result._error?.step).toBe('builder');

    rmSync(testRoot, { recursive: true, force: true });
  });
});
