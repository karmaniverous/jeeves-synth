/**
 * Parse subprocess outputs for each synthesis step.
 *
 * - Architect: returns text \> _builder
 * - Builder: returns JSON \> _content + structured fields
 * - Critic: returns text \> _feedback
 *
 * @module orchestrator/parseOutput
 */

/** Parsed builder output. */
export interface BuilderOutput {
  /** Narrative synthesis content. */
  content: string;
  /** Additional structured fields (non-underscore keys). */
  fields: Record<string, unknown>;
}

/**
 * Parse architect output. The architect should return a plain Markdown task brief.
 *
 * If the architect wraps its output in JSON (despite prompt instructions),
 * extract the text values and concatenate them as markdown.
 *
 * @param output - Raw subprocess output.
 * @returns The task brief string as plain Markdown.
 */
export function parseArchitectOutput(output: string): string {
  const trimmed = output.trim();

  // If it looks like JSON, try to unwrap it
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return extractTextFromJson(parsed as Record<string, unknown>);
      }
    } catch {
      // Not valid JSON — treat as text
    }
  }

  return trimmed;
}

/** Recursively extract string values from a JSON object into markdown. */
function extractTextFromJson(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      parts.push(value);
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      parts.push(extractTextFromJson(value as Record<string, unknown>));
    }
  }
  return parts.join('\n\n');
}

/**
 * Parse builder output. The builder returns JSON with _content and optional fields.
 *
 * Attempts JSON parse first. If that fails, treats the entire output as _content.
 *
 * @param output - Raw subprocess output.
 * @returns Parsed builder output with content and structured fields.
 */
export function parseBuilderOutput(output: string): BuilderOutput {
  const trimmed = output.trim();

  // Strategy 1: Try to parse the entire output as JSON directly
  const direct = tryParseJson(trimmed);
  if (direct) return direct;

  // Strategy 2: Try all fenced code blocks (last match first — models often narrate then output)
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/g;
  const fenceMatches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(trimmed)) !== null) {
    fenceMatches.push(match[1].trim());
  }
  // Try last fence first (most likely to be the actual output)
  for (let i = fenceMatches.length - 1; i >= 0; i--) {
    const result = tryParseJson(fenceMatches[i]);
    if (result) return result;
  }

  // Strategy 3: Find outermost { ... } braces
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const result = tryParseJson(trimmed.substring(firstBrace, lastBrace + 1));
    if (result) return result;
  }

  // Fallback: treat entire output as content
  return { content: trimmed, fields: {} };
}

/** Try to parse a string as JSON and extract builder output fields. */
function tryParseJson(str: string): BuilderOutput | null {
  try {
    const raw: unknown = JSON.parse(str);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return null;
    }

    const parsed = raw as Record<string, unknown>;

    // Extract _content
    const content =
      typeof parsed['_content'] === 'string'
        ? parsed['_content']
        : typeof parsed['content'] === 'string'
          ? parsed['content']
          : null;

    if (content === null) return null;

    // Extract non-underscore fields
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith('_') && key !== 'content') {
        fields[key] = value;
      }
    }

    return { content, fields };
  } catch {
    return null;
  }
}

/**
 * Parse critic output. The critic returns evaluation text.
 *
 * @param output - Raw subprocess output.
 * @returns The feedback string.
 */
export function parseCriticOutput(output: string): string {
  return output.trim();
}
