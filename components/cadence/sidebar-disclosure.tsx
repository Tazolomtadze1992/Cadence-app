"use client"

import { type ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { CADENCE_EASE_SLIDE, SIDEBAR_DISCLOSURE_DURATION_S } from "@/lib/cadence-motion"

/** Disclosure body only: tied to height via the same `transition` (no separate exit timing). */
const SIDEBAR_DISCLOSURE_CONTENT_SOFT = {
  opacity: 0.96,
  filter: "blur(1.5px)",
} as const
const SIDEBAR_DISCLOSURE_CONTENT_CRISP = {
  opacity: 1,
  filter: "blur(0px)",
} as const

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
  const transition = reduce
    ? { duration: 0 }
    : { duration: SIDEBAR_DISCLOSURE_DURATION_S, ease: CADENCE_EASE_SLIDE }

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key={motionKey}
          initial={
            reduce
              ? false
              : { height: 0, ...SIDEBAR_DISCLOSURE_CONTENT_SOFT }
          }
          animate={{ height: "auto", ...SIDEBAR_DISCLOSURE_CONTENT_CRISP }}
          exit={
            reduce
              ? { height: 0, ...SIDEBAR_DISCLOSURE_CONTENT_CRISP }
              : { height: 0, ...SIDEBAR_DISCLOSURE_CONTENT_SOFT }
          }
          transition={transition}
          className={cn("overflow-hidden", indented && "ml-2")}
        >
          <div className={innerClassName}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
