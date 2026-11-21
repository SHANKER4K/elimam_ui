const arNumber = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });

/** Formats a tool duration in Arabic: ms under 1s, seconds after. */
export function formatToolDuration(
  ms: number | null | undefined,
): string | null {
  if (ms === null || ms === undefined) return null;
  if (ms < 1000) return `${arNumber.format(Math.round(ms))} ملّي ثانية`;
  return `${arNumber.format(ms / 1000)} ثانية`;
}
