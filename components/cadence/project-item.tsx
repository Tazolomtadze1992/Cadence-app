"use client"

import type { RefObject } from "react"
import { ChevronRight, Plus, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProjectItem({
  label,
  color,
  count,
  hasChevron,
  isExpanded,
  onToggleExpand,
  onRowClick,
  isActive,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onPlusClick,
  onMoreClick,
}: {
  label: string
  color?: string
  count?: number
  hasChevron?: boolean
  isExpanded?: boolean
  /** Calendar/tasks: expand nested tasks. Prefer `onRowClick` in canvas mode. */
  onToggleExpand?: () => void
  /** Canvas: select project; takes precedence over `onToggleExpand` when set. */
  onRowClick?: () => void
  /** Canvas: selected canvas project */
  isActive?: boolean
  isRenaming?: boolean
  renameValue?: string
  renameInputRef?: RefObject<HTMLInputElement | null>
  onRenameChange?: (value: string) => void
  onRenameCommit?: (value: string) => void
  onRenameCancel?: () => void
  onPlusClick?: () => void
  onMoreClick?: (anchor: { top: number; left: number; right: number; bottom: number }) => void
}) {
  const handleRowClick = () => {
    if (onRowClick) onRowClick()
    else onToggleExpand?.()
  }

  return (
    <div
      className={cn(
        "group flex w-full items-center rounded px-2 py-1 text-sm cursor-pointer transition-colors",
        isRenaming ? "bg-transparent" : isActive ? "bg-faint" : ""
      )}
      onClick={handleRowClick}
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {hasChevron && (
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 text-text-faint transition-transform duration-200 ease-[var(--cadence-ease-slide)] motion-reduce:transition-none",
                onToggleExpand && "group-hover:text-text",
                isExpanded && "rotate-90"
              )}
            />
          )}
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full opacity-70 transition-opacity duration-150 group-hover:opacity-100"
            style={{ backgroundColor: color ?? "#94a3b8" }}
          />
          {isRenaming ? (
            <input
              ref={renameInputRef as RefObject<HTMLInputElement>}
              value={renameValue ?? ""}
              onChange={(e) => onRenameChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onRenameCommit?.(renameValue ?? "")
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  onRenameCancel?.()
                }
              }}
              onBlur={() => onRenameCommit?.(renameValue ?? "")}
              className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium text-text outline-none placeholder:text-text-muted"
            />
          ) : (
            <span className="truncate text-text/80 transition-colors duration-150 group-hover:text-text">{label}</span>
          )}
          {count !== undefined && (
            <span className="shrink-0 text-[11px] text-text-faint tabular-nums">{count}</span>
          )}
        </div>

        {!isRenaming && (onPlusClick || onMoreClick) && (
          <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {onPlusClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPlusClick()
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            {onMoreClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  onMoreClick({
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom,
                  })
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
