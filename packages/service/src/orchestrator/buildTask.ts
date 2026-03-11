/**
 * Build task prompts for each synthesis step.
 *
 * @module orchestrator/buildTask
 */

import type { MetaContext } from '../interfaces/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { condenseScopeFiles } from './contextPackage.js';

/** Append optional context sections shared across all step prompts. */
function appendSharedSections(
  sections: string[],
  ctx: MetaContext,
  options?: {
    includeSteer?: boolean;
    includePreviousContent?: boolean;
    includePreviousFeedback?: boolean;
    feedbackHeading?: string;
    includeChildMetas?: boolean;
  },
): void {
  const opts = {
    includeSteer: true,
    includePreviousContent: true,
    includePreviousFeedback: true,
    feedbackHeading: '## PREVIOUS FEEDBACK',
    includeChildMetas: true,
    ...options,
  };

  if (opts.includeSteer && ctx.steer) {
    sections.push('', '## STEERING PROMPT', ctx.steer);
  }

  if (opts.includePreviousContent && ctx.previousContent) {
    sections.push('', '## PREVIOUS SYNTHESIS', ctx.previousContent);
  }

  if (opts.includePreviousFeedback && ctx.previousFeedback) {
    sections.push('', opts.feedbackHeading, ctx.previousFeedback);
  }

  if (opts.includeChildMetas && Object.keys(ctx.childMetas).length > 0) {
    sections.push('', '## CHILD META OUTPUTS');
    for (const [childPath, content] of Object.entries(ctx.childMetas)) {
      sections.push(
        `### ${childPath}`,
        typeof content === 'string' ? content : '(not yet synthesized)',
      );
    }
  }
}

/**
 * Build the architect task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json.
 * @param config - Synthesis config.
 * @returns The architect task prompt string.
 */
export function buildArchitectTask(
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): string {
  const sections = [
    meta._architect ?? config.defaultArchitect,
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Total files in scope: ${ctx.scopeFiles.length.toString()}`,
    `Files changed since last synthesis: ${ctx.deltaFiles.length.toString()}`,
    '',
    '### File listing (scope)',
    condenseScopeFiles(ctx.scopeFiles),
  ];

  // Inject previous _builder so architect can see its own prior output
  if (meta._builder) {
    sections.push('', '## PREVIOUS TASK BRIEF', meta._builder);
  }

  appendSharedSections(sections, ctx);

  if (ctx.archives.length > 0) {
    sections.push(
      '',
      '## ARCHIVE HISTORY',
      `${ctx.archives.length.toString()} previous synthesis snapshots available in .meta/archive/.`,
      'Review these to understand how the synthesis has evolved over time.',
    );
  }

  return sections.join('\n');
}

/**
 * Build the builder task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json.
 * @param config - Synthesis config.
 * @returns The builder task prompt string.
 */
export function buildBuilderTask(
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): string {
  const sections = [
    '## TASK BRIEF (from Architect)',
    meta._builder ?? '(No architect brief available)',
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Delta files (${ctx.deltaFiles.length.toString()} changed):`,
    ...ctx.deltaFiles.slice(0, config.maxLines).map((f) => `- ${f}`),
  ];

  appendSharedSections(sections, ctx, {
    includeSteer: false,
    feedbackHeading: '## FEEDBACK FROM CRITIC',
  });

  sections.push(
    '',
    '## OUTPUT FORMAT',
    'Return a JSON object with:',
    '- "_content": Markdown narrative synthesis (required)',
    '- Any additional structured fields as non-underscore keys',
  );

  return sections.join('\n');
}

/**
 * Build the critic task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json (with _content already set by builder).
 * @param config - Synthesis config.
 * @returns The critic task prompt string.
 */
export function buildCriticTask(
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): string {
  const sections = [
    meta._critic ?? config.defaultCritic,
    '',
    '## SYNTHESIS TO EVALUATE',
    meta._content ?? '(No content produced)',
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Files in scope: ${ctx.scopeFiles.length.toString()}`,
  ];

  appendSharedSections(sections, ctx, {
    includePreviousContent: false,
    feedbackHeading: '## YOUR PREVIOUS FEEDBACK',
    includeChildMetas: false,
  });

  sections.push(
    '',
    '## OUTPUT FORMAT',
    'Return your evaluation as Markdown text. Be specific and actionable.',
  );

  return sections.join('\n');
}
