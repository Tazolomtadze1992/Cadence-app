"use client"

import { type ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { jakubSidebarLabelTransition } from "@/lib/cadence-motion"

/** Jakub Variant A: short labels unmount with opacity-only enter/exit. */
export function SidebarCollapseLabel({
  expanded,
  children,
  className,
}: {
  expanded: boolean
  children: ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const transition = jakubSidebarLabelTransition(reduceMotion)

  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          className={className}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** Dense sidebar regions: stay mounted, opacity-only fade on collapse/expand. */
export function SidebarCollapseRegion({
  expanded,
  children,
  className,
}: {
  expanded: boolean
  children: ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const transition = jakubSidebarLabelTransition(reduceMotion)

  return (
    <motion.div
      initial={false}
      animate={{ opacity: expanded ? 1 : 0 }}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  )
}
