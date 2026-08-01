// Split out of date-picker.tsx so these pure functions can be unit-tested without pulling in the
// whole radix-ui component tree that date-picker.tsx's DatePicker component depends on.

export function parseDateOnly(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  // Use noon to avoid DST / timezone edge cases flipping the day
  return new Date(y, m - 1, d, 12);
}

export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
