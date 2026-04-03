import { differenceInCalendarDays, startOfDay } from "date-fns"

export type PickedDueBucket = "overdue" | "dueToday" | "dueTomorrow" | "dueSoon"

/**
 * Classify a due-intent calendar date (yyyy-MM-dd) for sidebar buckets.
 * - Same day as today → Due today
 * - Next calendar day → Due tomorrow
 * - 2+ days out (including next week+) → Due soon
 * - Before today → Overdue
 */
export function bucketForSchedulePickedDate(
  schedulePickedDate: string,
  now: Date = new Date()
): PickedDueBucket {
  const d = startOfDay(new Date(`${schedulePickedDate}T12:00:00`))
  const t = startOfDay(now)
  const diff = differenceInCalendarDays(d, t)
  if (diff < 0) return "overdue"
  if (diff === 0) return "dueToday"
  if (diff === 1) return "dueTomorrow"
  return "dueSoon"
}
