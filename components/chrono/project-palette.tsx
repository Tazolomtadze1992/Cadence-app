"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const PROJECT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6b7280",
] as const

export function ProjectColorSwatchGrid({
  value,
  onChange,
}: {
  value?: string
  onChange: (color: string) => void
}) {
  return (
    <div className="grid w-fit grid-cols-5 gap-2">
      {PROJECT_COLORS.map((color) => {
        const isActive = color === value
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              "relative flex h-4 w-4 items-center justify-center rounded-[4px] transition-transform",
              "focus-visible:outline-none",
              !isActive && "hover:scale-[1.08]"
            )}
            style={{ backgroundColor: color }}
          >
            {isActive && <Check className="h-2.5 w-2.5 text-white" />}
          </button>
        )
      })}
    </div>
  )
}
