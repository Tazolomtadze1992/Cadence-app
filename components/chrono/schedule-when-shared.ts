import { format, parseISO, startOfDay } from "date-fns"

/** Matches task editor When dropdown: Today, Tomorrow (custom dates use `schedule: "picked"` + picked date). */
export const QUICK_WHEN_OPTIONS = [
  { value: "today", label: "Today", icon: "due-today.svg" },
  { value: "tomorrow", label: "Tomorrow", icon: "due-tomorrow.svg" },
] as const

export const PICK_DATE_ICON = "/icons/due-soon.svg"

/** `picked` is yyyy-MM-dd or ISO string */
export function formatWhenPickedDateLabel(picked: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(picked.trim())
    ? new Date(`${picked.trim()}T12:00:00`)
    : parseISO(picked)
  return format(startOfDay(d), "MMM d")
}

export function whenPickRowLabel(schedule: string, schedulePickedDate: string | undefined): string {
  if (schedule === "picked" && schedulePickedDate) {
    return formatWhenPickedDateLabel(schedulePickedDate)
  }
  return "Pick a date"
}

export function whenTriggerIconSrc(schedule: string): string {
  if (schedule === "today") return "/icons/due-today.svg"
  if (schedule === "tomorrow") return "/icons/due-tomorrow.svg"
  return PICK_DATE_ICON
}
