import { describe, expect, it } from 'vitest';

import { loadSynthConfig, resolveConfigPath } from './configLoader.js';

describe('resolveConfigPath', () => {
  it('returns --config flag value when present', () => {
    expect(
      resolveConfigPath(['status', '--config', '/path/to/config.json']),
    ).toBe('/path/to/config.json');
  });

  it('returns --config flag even with other args', () => {
    expect(
      resolveConfigPath([
        '--json',
        '--config',
        '/path/to/config.json',
        'status',
      ]),
    ).toBe('/path/to/config.json');
  });

  it('returns JEEVES_META_CONFIG env var when no flag', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    process.env['JEEVES_META_CONFIG'] = '/env/config.json';
    try {
      expect(resolveConfigPath(['status'])).toBe('/env/config.json');
    } finally {
      if (prev === undefined) {
        delete process.env['JEEVES_META_CONFIG'];
      } else {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });

  it('prefers --config flag over env var', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    process.env['JEEVES_META_CONFIG'] = '/env/config.json';
    try {
      expect(
        resolveConfigPath(['--config', '/flag/config.json', 'status']),
      ).toBe('/flag/config.json');
    } finally {
      if (prev === undefined) {
        delete process.env['JEEVES_META_CONFIG'];
      } else {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });

  it('throws when no config source available', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    delete process.env['JEEVES_META_CONFIG'];
    try {
      expect(() => resolveConfigPath(['status'])).toThrow(
        'Config path required',
      );
    } finally {
      if (prev !== undefined) {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });

  it('throws when --config has no value', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    delete process.env['JEEVES_META_CONFIG'];
    try {
      expect(() => resolveConfigPath(['status', '--config'])).toThrow(
        'Config path required',
      );
    } finally {
      if (prev !== undefined) {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });
});

describe('loadSynthConfig', () => {
  it('throws on missing file', () => {
    expect(() => loadSynthConfig('/nonexistent/config.json')).toThrow();
  });
});
