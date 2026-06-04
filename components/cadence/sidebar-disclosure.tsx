"use client"

import { type ReactNode } from "react"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { CADENCE_EASE_SLIDE_CSS, SIDEBAR_DISCLOSURE_DURATION_S } from "@/lib/cadence-motion"

export function SidebarDisclosure({
  show,
  motionKey,
  children,
  indented = true,
  /** `pl-0`: rows use full disclosure width on the left (align with group content). `pr-1.5`: match All/Completed horizontal inset on the right. */
  innerClassName = "mt-0.5 mb-1 space-y-1 pl-0 pr-1.5",
}: {
  show: boolean
  motionKey: string
  children: ReactNode
  /** Task lists under a row use `ml-2` to match header row `px-2` (was `ml-5`, which left an extra left gap vs chevron/row inset). Full-width section bodies set `false`. */
  indented?: boolean
  innerClassName?: string
}) {
  const reduce = useReducedMotion()
  const durationMs = reduce ? 0 : SIDEBAR_DISCLOSURE_DURATION_S * 1000

  return (
    <div
      key={motionKey}
      className={cn(
        "grid transition-[grid-template-rows,opacity,filter] motion-reduce:transition-none",
        indented && "ml-2",
        show ? "grid-rows-[1fr] opacity-100 blur-0" : "grid-rows-[0fr] opacity-[0.96] blur-[1.5px]"
      )}
      style={{
        transitionDuration: reduce ? "0ms" : `${durationMs}ms`,
        transitionTimingFunction: CADENCE_EASE_SLIDE_CSS,
      }}
    >
      <div className="overflow-hidden">
        <div className={innerClassName}>{children}</div>
      </div>
    </div>
  )
}
