/**
 * Meta tool registrations for OpenClaw.
 *
 * All tools delegate to the jeeves-meta HTTP service.
 *
 * @module tools
 */

import { fail, ok, type PluginApi, type ToolResult } from './helpers.js';
import type { MetaServiceClient } from './serviceClient.js';

/** Register all meta_* tools. */
export function registerMetaTools(
  api: PluginApi,
  client: MetaServiceClient,
): void {
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
        const filter = params.filter as Record<string, unknown> | undefined;
        const data = await client.listMetas({
          pathPrefix: params.pathPrefix as string | undefined,
          hasError: filter?.hasError as boolean | undefined,
          staleHours: filter?.staleHours as number | undefined,
          neverSynthesized: filter?.neverSynthesized as boolean | undefined,
          locked: filter?.locked as boolean | undefined,
          fields: params.fields as string[] | undefined,
        });
        return ok(data);
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
        const data = await client.detail(params.path as string, {
          includeArchive: params.includeArchive as boolean | number | undefined,
          fields: params.fields as string[] | undefined,
        });
        return ok(data);
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
        const data = await client.preview(params.path as string | undefined);
        return ok(data);
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
        const data = await client.synthesize(params.path as string | undefined);
        return ok(data);
      } catch (error) {
        return fail(error);
      }
    },
  });
}
