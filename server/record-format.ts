/** New records use plain punctuation. Legacy envelopes remain immutable and verifiable. */
function prefix(
  reference: string,
  validUntil: string | null | undefined,
  separator = " - ",
): string {
  return `OPERATOR-SUPPLIED RECORD${separator}NOT INDEPENDENTLY VERIFIED\nReference: ${reference}\nValid until: ${validUntil ?? "Not specified; configured freshness applies"}\n\n`;
}
export function recordEnvelope(
  content: string,
  reference: string,
  validUntil: string | null,
): string {
  return `${prefix(reference, validUntil)}${content}`;
}
export function recordMetadataMatches(
  content: string,
  reference: string | undefined,
  validUntil: string | null | undefined,
): boolean {
  if (!reference?.trim()) return false;
  return (
    content.startsWith(prefix(reference, validUntil)) ||
    content.startsWith(prefix(reference, validUntil, " \u2014 "))
  );
}
