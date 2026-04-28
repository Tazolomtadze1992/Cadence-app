"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X,
  User,
  Mail,
  Sun,
  Keyboard,
  Download,
  Bell,
  MessageCircle,
  Zap,
  LogOut,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CADENCE_EASE_MODAL } from "@/lib/cadence-motion"
import { ElasticSlider } from "@/components/elastic-slider/elastic-slider"
import { PROJECT_COLORS } from "@/components/cadence/project-palette"
import {
  CALENDAR_DURATION_OPTIONS,
  durationIndexToMinutes,
  durationMinutesToIndex,
  getDefaultDurationMinutes,
  getDefaultEventColor,
  setDefaultDurationMinutes,
  setDefaultEventColor,
  type CalendarDurationMinutes,
} from "@/lib/calendar-preferences"

/** Quick picks under the duration slider; only these highlight when `durationMinutes` matches exactly. */
const QUICK_DURATION_OPTIONS = [15, 30, 45, 60, 90] as const

type AccountTabId = "profile" | "invite" | "calendars" | "tasks" | "appearance" | "shortcuts" | "download" | "whats-new" | "contact" | "feedback" | "logout"

const NAV_STRUCTURE: {
  label: string
  items: { id: AccountTabId; label: string; icon?: React.ElementType; iconUrl?: string }[]
}[] = [
  {
    label: "Personal Settings",
    items: [
      { id: "profile", label: "Profile", icon: User },
      { id: "invite", label: "Invite friends", icon: Mail },
    ],
  },
  {
    label: "App Settings",
    items: [
      { id: "calendars", label: "Calendars", iconUrl: "/icons/calendar.svg" },
      { id: "tasks", label: "Tasks", iconUrl: "/icons/taskicon.svg" },
      { id: "appearance", label: "Appearance", icon: Sun },
      { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
      { id: "download", label: "Download apps", icon: Download },
    ],
  },
]

const BOTTOM_ITEMS: { id: AccountTabId; label: string; icon: React.ElementType; iconUrl?: string }[] = [
  { id: "whats-new", label: "What's new", icon: Bell },
  { id: "contact", label: "Contact us", icon: MessageCircle },
  { id: "feedback", label: "Feature requests", icon: Zap },
]

function NavItem({
  id,
  label,
  icon: Icon,
  iconUrl,
  isActive,
  onClick,
}: {
  id: AccountTabId
  label: string
  icon?: React.ElementType
  iconUrl?: string
  isActive: boolean
  onClick: () => void
}) {
  const iconClass = cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-text-faint")
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        isActive
          ? "bg-surface text-primary"
          : "text-text-muted hover:bg-surface/70 hover:text-text"
      )}
    >
      {iconUrl ? (
        <span
          className={cn("block shrink-0", iconClass)}
          style={{
            backgroundColor: "currentColor",
            WebkitMaskImage: `url(${iconUrl})`,
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: `url(${iconUrl})`,
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      ) : (
        Icon && <Icon className={iconClass} />
      )}
      <span className="font-medium">{label}</span>
    </button>
  )
}

function CalendarsContent() {
  const [color, setColor] = useState(() => getDefaultEventColor())
  const [durationMinutes, setDurationMinutes] = useState<CalendarDurationMinutes>(() =>
    getDefaultDurationMinutes()
  )
  const durationIndex = durationMinutesToIndex(durationMinutes)

  return (
    <div className="flex flex-col">
      <div>
        <h2 className="text-lg font-semibold text-text">Calendars</h2>
        <p className="mt-0.5 text-sm text-text-muted">Manage your calendar settings</p>
      </div>

      <div className="mt-6 h-px w-full bg-border/40" aria-hidden="true" />

      <div className="mt-16 space-y-16">
        <section>
          <h3 className="text-sm font-medium text-text">Default Event Color</h3>
          <p className="mt-0.5 text-xs text-text-muted">Choose the default color for new events.</p>
          <div className="mt-3">
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto py-1">
              {PROJECT_COLORS.map((c) => {
                const active = color === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Set default event color to ${c}`}
                    aria-pressed={active}
                    onClick={() => {
                      setColor(c)
                      setDefaultEventColor(c)
                    }}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-transform hover:scale-105 focus:outline-none",
                      active ? "" : ""
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {active && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.25} />}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section aria-labelledby="calendars-default-duration-heading">
          <h3 id="calendars-default-duration-heading" className="text-sm font-medium text-text">
            Default duration
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">Set how long new events should be by default.</p>
          <div className="mt-3 w-full space-y-3">
            <ElasticSlider
              label="Duration"
              aria-label="Default event duration"
              min={0}
              max={CALENDAR_DURATION_OPTIONS.length - 1}
              step={1}
              value={durationIndex}
              formatValue={(idx) => `${durationIndexToMinutes(idx)} min`}
              onValueChange={(idx) => {
                const next = durationIndexToMinutes(idx)
                setDurationMinutes(next)
                setDefaultDurationMinutes(next)
              }}
              className={cn(
                "w-full",
                "[--elastic-slider-bg:var(--surface-2)]",
                "[--elastic-slider-fill:color-mix(in_srgb,var(--muted-foreground)_10%,transparent)]",
                "[--elastic-slider-fill-active:color-mix(in_srgb,var(--muted-foreground)_18%,transparent)]",
                "[--elastic-slider-hash:color-mix(in_srgb,var(--muted-foreground)_22%,transparent)]",
                "[--elastic-slider-handle:var(--foreground)]",
                "[--elastic-slider-label:var(--text-muted)]",
                "[--elastic-slider-focus:var(--text)]"
              )}
            />
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Quick duration presets"
            >
              {QUICK_DURATION_OPTIONS.map((m) => {
                const active = durationMinutes === m
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Set default duration to ${m} minutes`}
                    onClick={() => {
                      setDurationMinutes(m)
                      setDefaultDurationMinutes(m)
                    }}
                    className={cn(
                      "rounded border px-2.5 py-1.5 text-[11px] font-medium shadow-sm transition-colors",
                      active
                        ? "border-app-accent bg-app-accent text-app-accent-foreground hover:bg-app-accent/90"
                        : "border-border/50 bg-surface text-text hover:bg-surface-2"
                    )}
                  >
                    {m}m
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ProfileContent() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-text">Profile</h2>
        <p className="mt-0.5 text-sm text-text-muted">Manage your profile</p>
      </div>

      <div className="rounded-xl bg-surface-2/80 p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-xl font-semibold text-primary">
            TZ
          </div>
          <div className="text-center">
            <p className="font-medium text-text">Tazo Lomtadze</p>
            <p className="text-sm text-text-muted">youremail@gmail.com</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-medium text-text">Birthday</h3>
          <p className="mt-0.5 text-xs text-text-muted">Set your birthday. Only day and month will be visible.</p>
          <div className="mt-3 flex gap-3">
            <input
              type="text"
              placeholder="eg. March"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-ring"
              readOnly
              aria-readonly
            />
            <input
              type="text"
              placeholder="Select month first"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              disabled
              aria-disabled
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-text">Location</h3>
          <p className="mt-0.5 text-xs text-text-muted">Set your current location.</p>
          <input
            type="text"
            placeholder="e.g Berlin, Germany"
            className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-ring"
            readOnly
            aria-readonly
          />
        </section>
      </div>
    </div>
  )
}

export function AccountPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<AccountTabId>("profile")
  const shouldReduceMotion = useReducedMotion()
  /** Single timing curve + duration for overlay + content (paired modal layers). */
  const accountPanelEase = CADENCE_EASE_MODAL
  const accountPanelDuration = 0.24
  const overlayTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: accountPanelDuration, ease: accountPanelEase }
  const panelTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: accountPanelDuration, ease: accountPanelEase }

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener("keydown", handleEscape)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = prevOverflow
    }
  }, [open, handleEscape])

  const handleNavClick = (id: AccountTabId) => {
    if (id === "logout") return
    setActiveTab(id)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Account settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={overlayTransition}
        >
          <motion.div
            className="flex h-full w-full"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={panelTransition}
          >
            {/* Left sidebar (settings navigation) — match app sidebar width */}
            <div className="flex w-[260px] shrink-0 flex-col border-r border-border/20 bg-calendar-bg pb-4 pt-6">
              <div className="flex items-center justify-between px-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-sm font-medium text-text">
                    TZ
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">Tazo Lomtadze</p>
                    <p className="text-xs text-text-muted">Workspace Settings</p>
                  </div>
                </div>
              </div>

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
                {NAV_STRUCTURE.map((section) => (
                  <div key={section.label} className="py-3">
                    <p className="px-3 pb-1.5 text-xs font-medium text-text-faint">
                      {section.label}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => (
                        <NavItem
                          key={item.id}
                          id={item.id}
                          label={item.label}
                          icon={item.icon}
                          iconUrl={item.iconUrl}
                          isActive={activeTab === item.id}
                          onClick={() => handleNavClick(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mt-3 space-y-0.5">
                  {BOTTOM_ITEMS.map((item) => (
                    <NavItem
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      icon={item.icon}
                      iconUrl={item.iconUrl}
                      isActive={activeTab === item.id}
                      onClick={() => handleNavClick(item.id)}
                    />
                  ))}
                </div>

                <div className="mt-auto border-t border-border pt-2">
                  <button
                    type="button"
                    onClick={() => handleNavClick("logout")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-2/60 hover:text-text"
                  >
                    <LogOut className="h-4 w-4 shrink-0 text-text-faint" />
                    <span className="font-medium">Log out</span>
                  </button>
                </div>
              </nav>
            </div>

            {/* Right content area */}
            <div className="relative flex-1 min-w-0 overflow-y-auto">
              <div className="absolute right-6 top-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex flex-col items-center gap-0.5 text-text-muted transition-colors hover:text-text"
                  aria-label="Close"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface-2">
                    <X className="h-5 w-5" />
                  </div>
                  <span className="text-[10px]">ESC</span>
                </button>
              </div>
              <div className="p-6 pt-8">
                <div className="mx-auto w-full max-w-xl">
                  {activeTab === "profile" && <ProfileContent />}
                  {activeTab === "calendars" && <CalendarsContent />}
                  {activeTab !== "profile" && activeTab !== "calendars" && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-text-muted">{activeTab} content coming soon</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
