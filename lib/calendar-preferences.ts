"use client"

import { PROJECT_COLORS } from "@/components/cadence/project-palette"

/** Every 5 minutes from 15 through 90 — Calendars slider + persisted default duration. */
export const CALENDAR_DURATION_OPTIONS = [
  15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
] as const

export type CalendarDurationMinutes = (typeof CALENDAR_DURATION_OPTIONS)[number]

export const DEFAULT_CALENDAR_DURATION_MINUTES: CalendarDurationMinutes = 45

/** When no project color exists, new tasks use this (must stay in `PROJECT_COLORS` for validation). */
export const DEFAULT_CALENDAR_EVENT_COLOR = "#3b82f6" as const

const STORAGE_DURATION_KEY = "cadence_calendar_default_duration_minutes"
const STORAGE_COLOR_KEY = "cadence_calendar_default_event_color"

const isBrowser = () => typeof window !== "undefined"

function isValidDuration(value: number): value is CalendarDurationMinutes {
  return (CALENDAR_DURATION_OPTIONS as readonly number[]).includes(value)
}

function isValidEventColor(value: string): boolean {
  return (PROJECT_COLORS as readonly string[]).includes(value)
}

function parseDuration(raw: string | null): CalendarDurationMinutes | null {
  if (raw == null || raw === "") return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || !isValidDuration(n)) return null
  return n
}

/** Read persisted default duration, or the app default. SSR-safe. */
export function getDefaultDurationMinutes(): CalendarDurationMinutes {
  if (!isBrowser()) return DEFAULT_CALENDAR_DURATION_MINUTES
  try {
    const parsed = parseDuration(window.localStorage.getItem(STORAGE_DURATION_KEY))
    return parsed ?? DEFAULT_CALENDAR_DURATION_MINUTES
  } catch {
    return DEFAULT_CALENDAR_DURATION_MINUTES
  }
}

/** Persist default duration; invalid values are ignored (no write). */
export function setDefaultDurationMinutes(minutes: CalendarDurationMinutes): void {
  if (!isBrowser()) return
  try {
    if (!isValidDuration(minutes)) return
    window.localStorage.setItem(STORAGE_DURATION_KEY, String(minutes))
  } catch {
    // ignore quota / private mode
  }
}

/** Read persisted default event color (hex), or the app default. SSR-safe. */
export function getDefaultEventColor(): string {
  if (!isBrowser()) return DEFAULT_CALENDAR_EVENT_COLOR
  try {
    const raw = window.localStorage.getItem(STORAGE_COLOR_KEY)
    if (raw && isValidEventColor(raw)) return raw
  } catch {
    // ignore
  }
  return DEFAULT_CALENDAR_EVENT_COLOR
}

/** Persist default event color; must be one of `PROJECT_COLORS` or the write is skipped. */
export function setDefaultEventColor(color: string): void {
  if (!isBrowser()) return
  try {
    if (!isValidEventColor(color)) return
    window.localStorage.setItem(STORAGE_COLOR_KEY, color)
  } catch {
    // ignore
  }
}

/** Map minutes to slider index (0..length-1). */
export function durationMinutesToIndex(minutes: CalendarDurationMinutes): number {
  const i = CALENDAR_DURATION_OPTIONS.indexOf(minutes)
  return i >= 0 ? i : CALENDAR_DURATION_OPTIONS.indexOf(DEFAULT_CALENDAR_DURATION_MINUTES)
}

/** Map slider index to minutes. */
export function durationIndexToMinutes(index: number): CalendarDurationMinutes {
  const clamped = Math.max(0, Math.min(CALENDAR_DURATION_OPTIONS.length - 1, Math.round(index)))
  const v = CALENDAR_DURATION_OPTIONS[clamped]
  return v ?? DEFAULT_CALENDAR_DURATION_MINUTES
}
