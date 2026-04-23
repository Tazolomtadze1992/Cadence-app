/**
 * Shared motion tokens for Cadence UI. Import from here instead of duplicating
 * beziers/durations across command bar, task editor, sidebar, and calendar.
 * CSS mirrors: `app/globals.css` `--cadence-ease-*`.
 */

/** Ease-out quart — overlays, dropdowns, command shell, calendar hover popover. */
export const CADENCE_EASE_OUT = [0.165, 0.84, 0.44, 1] as const
export const CADENCE_EASE_OUT_CSS = "cubic-bezier(0.165, 0.84, 0.44, 1)"

/** On-screen slide / disclose — sidebar shell, panel swaps, chevrons, canvas projects. */
export const CADENCE_EASE_SLIDE = [0.2, 0.8, 0.2, 1] as const
export const CADENCE_EASE_SLIDE_CSS = "cubic-bezier(0.2, 0.8, 0.2, 1)"

/** Full-screen settings — overlay + panel stay paired on this curve. */
export const CADENCE_EASE_MODAL = [0.22, 1, 0.36, 1] as const

/** Task editor dropdowns, command bar bulk choosers (exit ~20% faster than enter). */
export const DROPDOWN_OPEN_MS = 180
export const DROPDOWN_CLOSE_MS = 140

/** Command bar shell height motion. */
export const SHELL_OPEN_S = 0.23
export const SHELL_CLOSE_S = 0.185
export const SHELL_OPEN_MS = Math.round(SHELL_OPEN_S * 1000)
export const SHELL_CLOSE_MS = Math.round(SHELL_CLOSE_S * 1000)

/** Bulk chooser popovers (match DropdownField). */
export const CHOOSER_OPEN_MS = DROPDOWN_OPEN_MS
export const CHOOSER_CLOSE_MS = DROPDOWN_CLOSE_MS

/** Calendar grid event detail popover. */
export const POPOVER_ENTER_MS = 220
export const POPOVER_EXIT_MS = 180
export const POPOVER_HIDE_MS = POPOVER_EXIT_MS + 90

/** Sidebar: Framer slides, disclosures, CSS collapse strip (`duration-200`). */
export const SIDEBAR_DISCLOSURE_DURATION_S = 0.2
