"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"
import { FLOATING_MENU_CLOSE_MS, FLOATING_MENU_OPEN_MS } from "@/lib/cadence-motion"

export { Popover, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover"

/**
 * Radix popover content tuned to Cadence floating menus: subtle scale (not zoom-95),
 * fade + slide, and enter/exit durations matching task editor / command bar choosers.
 */
function CadencePopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          `data-[state=open]:duration-[${FLOATING_MENU_OPEN_MS}ms] data-[state=closed]:duration-[${FLOATING_MENU_CLOSE_MS}ms]`,
          "ease-[var(--cadence-ease-out)]",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { CadencePopoverContent }
