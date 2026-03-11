/**
 * Tests for the TOOLS.md upsert logic.
 *
 * @module toolsWriter.test
 */

import { describe, expect, it } from 'vitest';

import { upsertMetaSection } from './toolsWriter.js';

const SAMPLE_MENU =
  'The jeeves-meta synthesis engine manages 42 meta entities.\n\n### Tools\n| Tool | Description |';

describe('upsertMetaSection', () => {
  it('inserts into empty file with platform H1', () => {
    const result = upsertMetaSection('', SAMPLE_MENU);
    expect(result).toContain('# Jeeves Platform Tools');
    expect(result).toContain('## Meta');
    expect(result).toContain('42 meta entities');
  });

  it('replaces existing ## Meta section', () => {
    const existing =
      '# Jeeves Platform Tools\n\n## Watcher\n\nwatcher stuff\n\n## Meta\n\nold meta content\n\n## Other\n\nother stuff';
    const result = upsertMetaSection(existing, SAMPLE_MENU);
    expect(result).toContain('42 meta entities');
    expect(result).not.toContain('old meta content');
    expect(result).toContain('## Watcher');
    expect(result).toContain('## Other');
  });

  it('inserts after ## Server when present', () => {
    const existing =
      '# Jeeves Platform Tools\n\n## Watcher\n\nwatcher stuff\n\n## Server\n\nserver stuff';
    const result = upsertMetaSection(existing, SAMPLE_MENU);
    const serverIdx = result.indexOf('## Server');
    const metaIdx = result.indexOf('## Meta');
    expect(metaIdx).toBeGreaterThan(serverIdx);
  });

  it('inserts after ## Watcher when Server absent', () => {
    const existing = '# Jeeves Platform Tools\n\n## Watcher\n\nwatcher stuff';
    const result = upsertMetaSection(existing, SAMPLE_MENU);
    const watcherIdx = result.indexOf('## Watcher');
    const metaIdx = result.indexOf('## Meta');
    expect(metaIdx).toBeGreaterThan(watcherIdx);
  });

  it('inserts after H1 when no Watcher or Server', () => {
    const existing = '# Jeeves Platform Tools\n\nsome other content';
    const result = upsertMetaSection(existing, SAMPLE_MENU);
    expect(result).toContain('## Meta');
    expect(result).toContain('some other content');
  });

  it('removes duplicate ## Meta sections', () => {
    const existing =
      '# Jeeves Platform Tools\n\n## Meta\n\nfirst meta\n\n## Server\n\nserver\n\n## Meta\n\nsecond meta\n\n## Meta\n\nthird meta';
    const result = upsertMetaSection(existing, SAMPLE_MENU);
    const metaCount = (result.match(/^## Meta$/gm) || []).length;
    expect(metaCount).toBe(1);
    expect(result).toContain('42 meta entities');
    expect(result).not.toContain('first meta');
    expect(result).not.toContain('second meta');
    expect(result).not.toContain('third meta');
    expect(result).toContain('server');
  });

  it('preserves content before and after replaced section', () => {
    const existing =
      '# Jeeves Platform Tools\n\n## Watcher\n\nwatcher stuff\n\n## Meta\n\nold\n\n# TOOLS.md - Local Notes\n\nmy notes';
    const result = upsertMetaSection(existing, SAMPLE_MENU);
    expect(result).toContain('watcher stuff');
    expect(result).toContain('my notes');
    expect(result).toContain('42 meta entities');
  });
});
