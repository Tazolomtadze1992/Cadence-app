"use client"

import { useRef } from "react"
import { Plus, Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface CanvasCommandBarProps {
  onAddNote?: () => void
  onAddImageFile?: (file: File) => void
}

export function CanvasCommandBar({ onAddNote, onAddImageFile }: CanvasCommandBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleClickUpload = () => {
    if (!onAddImageFile) return
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onAddImageFile) return
    onAddImageFile(file)
    // Reset so selecting the same file again still fires change
    e.target.value = ""
  }

  return (
    <>
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-end justify-center">
        <div className="pointer-events-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-border/50 bg-secondary shadow-sm">
          <div className="flex items-center justify-center gap-1 px-4" style={{ height: 52 }}>
            <button
              type="button"
              onClick={onAddNote}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add note</span>
            </button>

            <div className="mx-1 h-4 w-px bg-border" />

            <button
              type="button"
              onClick={handleClickUpload}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Upload image</span>
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  )
}

