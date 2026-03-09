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
 * Parse architect output. The architect returns a task brief as text.
 *
 * @param output - Raw subprocess output.
 * @returns The task brief string.
 */
export function parseArchitectOutput(output: string): string {
  return output.trim();
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

  // Try to extract JSON from the output (may be wrapped in markdown code fences)
  let jsonStr = trimmed;
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Extract _content
    const content =
      typeof parsed._content === 'string'
        ? parsed._content
        : typeof parsed.content === 'string'
          ? parsed.content
          : trimmed;

    // Extract non-underscore fields
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith('_') && key !== 'content') {
        fields[key] = value;
      }
    }

    return { content, fields };
  } catch {
    // Not valid JSON — treat entire output as content
    return { content: trimmed, fields: {} };
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
