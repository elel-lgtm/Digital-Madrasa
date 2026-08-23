/**
 * Numeric guard.
 *
 * A 1.7B model repeatedly turned "attendance 95%" into "perfect attendance
 * (100%)". Instructing it not to round did not stop this — the prompt is a
 * request, not a constraint.
 *
 * So every figure in the reply is checked against the figures we supplied. A
 * number that was not in the source did not come from the database, and in an
 * app where a parent reads this about their own child, a confidently wrong
 * statistic is worse than a plain one. When the check fails we fall back to
 * the deterministic summary, which is always correct.
 */

/** Percentages and bare counts the model might state. */
const NUMBER_PATTERN = /\b(\d{1,3})\s*%|\b(\d{1,3})\s+(?:absences?|sessions?|surahs?)\b/gi;

export interface VerificationResult {
  ok: boolean;
  /** Figures the model stated that were not in the supplied facts. */
  invented: string[];
}

function extractNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = match[1] ?? match[2];
    if (value) found.push(value);
  }
  return found;
}

/**
 * Checks the reply's figures against the source.
 *
 * Deliberately lenient about *where* a number appears — the aim is to catch
 * invention, not to police phrasing. A figure present anywhere in the findings
 * is accepted.
 */
export function verifyNumbers(reply: string, source: string): VerificationResult {
  const sourceNumbers = new Set(extractNumbers(source));
  // Percentages can legitimately be derived (e.g. "4 of 18" ≈ 22%), so also
  // accept any integer that literally appears in the source text.
  for (const match of source.matchAll(/\d+/g)) sourceNumbers.add(match[0]);

  const invented = extractNumbers(reply).filter((n) => !sourceNumbers.has(n));

  return { ok: invented.length === 0, invented: [...new Set(invented)] };
}

/**
 * A correct, unglamorous summary. Used when the model's prose cannot be
 * trusted for this turn — better a plain answer than a wrong one.
 */
export function deterministicFallback(findings: string): string {
  return [
    'Here is the summary from your records:',
    '',
    findings,
  ].join('\n');
}
