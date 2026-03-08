"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface IconTooltipButtonProps {
  iconUrl: string
  label: string
  shortcut: string
  isActive?: boolean
  onClick: () => void
  tooltipPosition?: "above" | "below"
  className?: string

  // Optional: keep icon color primary even when inactive (useful for collapse button)
  alwaysPrimary?: boolean
}

export function IconTooltipButton({
  iconUrl,
  label,
  shortcut,
  isActive = false,
  onClick,
  tooltipPosition = "above",
  className,
  alwaysPrimary = false,
}: IconTooltipButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  // How many px we need to nudge the tooltip so it stays in the viewport
  const [xNudge, setXNudge] = useState(0)

  useEffect(() => {
    if (!isHovered) {
      setXNudge(0)
      return
    }

    // Wait a tick so the tooltip is in the DOM and has size
    const raf = requestAnimationFrame(() => {
      const wrap = wrapRef.current
      const tip = tipRef.current
      if (!wrap || !tip) return

      const pad = 10 // viewport padding
      const tipRect = tip.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()

      // Ideal left if perfectly centered over the icon
      const idealLeft = wrapRect.left + wrapRect.width / 2 - tipRect.width / 2

      // Clamp to viewport
      const minLeft = pad
      const maxLeft = window.innerWidth - pad - tipRect.width
      const clampedLeft = Math.min(Math.max(idealLeft, minLeft), maxLeft)

      // Difference = how much we need to push it
      const nudge = clampedLeft - idealLeft
      setXNudge(nudge)
    })

    // Recompute on resize while hovered
    const onResize = () => {
      const wrap = wrapRef.current
      const tip = tipRef.current
      if (!wrap || !tip) return

      const pad = 10
      const tipRect = tip.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()

      const idealLeft = wrapRect.left + wrapRect.width / 2 - tipRect.width / 2
      const minLeft = pad
      const maxLeft = window.innerWidth - pad - tipRect.width
      const clampedLeft = Math.min(Math.max(idealLeft, minLeft), maxLeft)
      setXNudge(clampedLeft - idealLeft)
    }

    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
    }
  }, [isHovered])

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <button
        onClick={onClick}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
          isActive
            ? "bg-background text-primary"
            : alwaysPrimary
              ? "text-primary hover:bg-surface-2"
              : "text-text-muted hover:text-text hover:bg-surface-2",
          className
        )}
      >
        <span
          className="block h-5 w-5"
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
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            ref={tipRef}
            initial={{ opacity: 0, y: tooltipPosition === "above" ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: tooltipPosition === "above" ? 6 : -6 }}
            transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              "absolute z-50",
              tooltipPosition === "above" ? "bottom-full mb-2" : "top-full mt-2"
            )}
            style={{
              left: "50%",
              transform: `translateX(calc(-50% + ${xNudge}px))`,
            }}
          >
            <div className="flex items-center gap-2 whitespace-nowrap rounded border border-border/30 bg-calendar-bg px-2 py-1 text-[11px] text-text shadow-lg">
              <span>{label}</span>
              <span className="rounded border border-border/30 bg-surface/70 px-1.5 py-0.5 text-[10px] text-text-muted">
                {shortcut}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}