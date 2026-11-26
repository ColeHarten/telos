/**
 * Day headings for lists grouped by date: "Today", "Yesterday", "Mon, Nov 24",
 * or "Mon, Nov 24, 2025" outside the current year. Dates are YYYY-MM-DD.
 */
export function dateHeading(date: string, today: Date = new Date()): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;

  const target = new Date(year, month - 1, day);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Rounding absorbs the 23- and 25-hour days around daylight saving changes.
  const daysAgo = Math.round((startOfToday.getTime() - target.getTime()) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";

  const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (year !== today.getFullYear()) options.year = "numeric";
  return target.toLocaleDateString("en-US", options);
}

export type DateGroup<T> = { date: string; items: T[] };

/** Splits a list already sorted by date into one group per day, keeping its order. */
export function groupByDate<T extends { date: string }>(items: readonly T[]): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) {
      last.items.push(item);
    } else {
      groups.push({ date: item.date, items: [item] });
    }
  }
  return groups;
}
