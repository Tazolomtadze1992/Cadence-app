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

/** Sidebar / canvas portaled menus (exit ~20% faster than enter). */
export const DROPDOWN_OPEN_MS = 120
export const DROPDOWN_CLOSE_MS = 100

/** Floating menus / portaled popovers (sidebar ⋯, category menus, canvas project menu). */
export const FLOATING_MENU_OPEN_MS = DROPDOWN_OPEN_MS
export const FLOATING_MENU_CLOSE_MS = DROPDOWN_CLOSE_MS

/** Task editor field dropdowns — Due, Project, Priority, Assignee, tag suggestions. */
export const TASK_EDITOR_DROPDOWN_OPEN_MS = 180
export const TASK_EDITOR_DROPDOWN_CLOSE_MS = 145
export const TASK_EDITOR_DROPDOWN_OFFSET_PX = 6
export const TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS = TASK_EDITOR_DROPDOWN_CLOSE_MS + 100

/** Sidebar/canvas contextual menus (task ⋯, project/category actions) — same motion as task editor. */
export const CONTEXT_MENU_OPEN_MS = TASK_EDITOR_DROPDOWN_OPEN_MS
export const CONTEXT_MENU_CLOSE_MS = TASK_EDITOR_DROPDOWN_CLOSE_MS
export const CONTEXT_MENU_OFFSET_PX = TASK_EDITOR_DROPDOWN_OFFSET_PX
export const CONTEXT_MENU_EXIT_UNMOUNT_FALLBACK_MS = TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS
export const FLOATING_MENU_EASE_CSS = CADENCE_EASE_OUT_CSS

/** Command bar shell height motion. */
export const SHELL_OPEN_S = 0.23
export const SHELL_CLOSE_S = 0.185

/** Schedule dock face fades in after canvas→schedule shell morph (paired timing, ms). */
export const DOCK_SCHEDULE_REVEAL_DELAY_MS = 55
export const SHELL_OPEN_MS = Math.round(SHELL_OPEN_S * 1000)
export const SHELL_CLOSE_MS = Math.round(SHELL_CLOSE_S * 1000)

/** @deprecated Use FLOATING_MENU_OPEN_MS / FLOATING_MENU_CLOSE_MS */
export const CHOOSER_OPEN_MS = FLOATING_MENU_OPEN_MS
/** @deprecated Use FLOATING_MENU_CLOSE_MS */
export const CHOOSER_CLOSE_MS = FLOATING_MENU_CLOSE_MS

/** Calendar grid event detail popover. */
export const POPOVER_ENTER_MS = 220
export const POPOVER_EXIT_MS = 180
export const POPOVER_HIDE_MS = POPOVER_EXIT_MS + 90

/** Calendar task-card detail popover: fine-pointer hover intent before first open (ms). */
export const CALENDAR_CARD_POPOVER_SHOW_MS = 550
/**
 * After a card popover fully hides, chain mode stays on this long so moving to another card
 * opens instantly with no enter animation (`calendar-grid.tsx`).
 */
export const CALENDAR_CARD_POPOVER_CHAIN_GRACE_MS = 420
/** @deprecated Chain uses grace + open count; kept for naming parity with tooltips. */
export const CALENDAR_CARD_POPOVER_SKIP_DELAY_MS = 0
/** @deprecated Prefer `CALENDAR_CARD_POPOVER_CHAIN_GRACE_MS`. */
export const CALENDAR_CARD_POPOVER_SKIP_DELAY_WINDOW_MS = 800

/** Sidebar: Framer slides, disclosures, CSS collapse strip (`duration-200`). */
export const SIDEBAR_DISCLOSURE_DURATION_S = 0.2

/** Sidebar shell width collapse in `app/page.tsx` `<aside>` (Jakub interfaces.dev Variant A curve). */
export const SIDEBAR_WIDTH_PX = 260
export const SIDEBAR_SHELL_DURATION_MS = 200
export const SIDEBAR_SHELL_EASE = [0.5, 1, 0.89, 1] as const
export const SIDEBAR_SHELL_EASE_CSS = "cubic-bezier(0.5, 1, 0.89, 1)"
/** Per-label / region opacity fades — paired with shell width (200ms). */
export const SIDEBAR_SHELL_LABEL_DURATION_S = 0.2

export function jakubSidebarLabelTransition(reduceMotion: boolean | null) {
  return reduceMotion
    ? { duration: 0 }
    : { duration: SIDEBAR_SHELL_LABEL_DURATION_S, ease: SIDEBAR_SHELL_EASE }
}

/** Emil animations.dev sidebar panel swap — spring slide + opacity, fixed side per panel. */
export const EMIL_SIDEBAR_TRANSITION = {
  duration: 0.3,
  type: "spring",
  bounce: 0,
} as const

export const EMIL_LEFT_PANEL = {
  initial: { x: "-20%", opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: "-20%", opacity: 0 },
} as const

export const EMIL_RIGHT_PANEL = {
  initial: { x: "20%", opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: "20%", opacity: 0 },
} as const

export type EmilSidebarPanelSide = "left" | "right"

export function emilSidebarTransition(reduceMotion: boolean | null) {
  return reduceMotion ? { duration: 0 } : EMIL_SIDEBAR_TRANSITION
}

export function emilSidebarPanelProps(
  side: EmilSidebarPanelSide,
  reduceMotion: boolean | null
) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 0 },
    } as const
  }
  return side === "left" ? EMIL_LEFT_PANEL : EMIL_RIGHT_PANEL
}

/** Icon / shortcut tooltips (`ShortcutHintWrap`): fine-pointer hover intent (first open). */
export const TOOLTIP_POINTER_SHOW_MS = 600
/** Keyboard `focus-visible`: faster reveal for accessibility. */
export const TOOLTIP_FOCUS_SHOW_MS = 80
/**
 * After pointer-driven tooltip closes, this grace window keeps “chain mode” active so
 * moving to another trigger opens instantly with no enter animation (`ShortcutHintWrap`).
 */
export const TOOLTIP_POINTER_CHAIN_GRACE_MS = 420
/**
 * @deprecated Chained pointer tooltips use `TOOLTIP_POINTER_CHAIN_GRACE_MS` + open count instead.
 * Kept at 0 for any legacy imports; Radix uses `TOOLTIP_RADIX_SKIP_DELAY_MS`.
 */
export const TOOLTIP_POINTER_SKIP_DELAY_MS = 0
/** @deprecated Prefer `TOOLTIP_POINTER_CHAIN_GRACE_MS` for custom tooltips. */
export const TOOLTIP_SKIP_DELAY_WINDOW_MS = 800
/** Radix `TooltipProvider` `skipDelayDuration`: moving between triggers skips the long delay briefly. */
export const TOOLTIP_RADIX_SKIP_DELAY_MS = 400
