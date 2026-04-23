import type { Task } from "@/app/page"
import type { CanvasProject } from "@/components/cadence/canvas-board"
import { bucketForSchedulePickedDate } from "@/components/cadence/picked-due-bucket"

/** Mirrors sidebar `taskBelongsToOverdueBucket`. */
function taskBelongsToOverdueBucket(t: Task): boolean {
  if (t.completed) return false
  if (t.schedule === "picked" && t.schedulePickedDate) {
    return bucketForSchedulePickedDate(t.schedulePickedDate) === "overdue"
  }
  return false
}

/** Same bucketing as `AppSidebar` for incomplete tasks (sidebar All tab). */
export function computeIncompleteSidebarBuckets(tasks: Task[]) {
  const overdue: Task[] = []
  const dueToday: Task[] = []
  const dueTomorrow: Task[] = []
  const dueSoon: Task[] = []

  for (const t of tasks) {
    if (t.completed) continue

    if (taskBelongsToOverdueBucket(t)) {
      overdue.push(t)
      continue
    }

    const hasTime = t.startMinutes != null && t.endMinutes != null

    if (!hasTime) {
      const s = t.schedule
      if (s === "anytime" || !s) {
        continue
      } else if (s === "today") {
        dueToday.push(t)
      } else if (s === "tomorrow") {
        dueTomorrow.push(t)
      } else if (s === "next-week") {
        dueSoon.push(t)
      } else if (s === "picked" && t.schedulePickedDate) {
        switch (bucketForSchedulePickedDate(t.schedulePickedDate)) {
          case "overdue":
            overdue.push(t)
            break
          case "dueToday":
            dueToday.push(t)
            break
          case "dueTomorrow":
            dueTomorrow.push(t)
            break
          case "dueSoon":
            dueSoon.push(t)
            break
        }
      } else {
        dueSoon.push(t)
      }
      continue
    }

    const s = t.schedule
    if (s === "today") {
      dueToday.push(t)
      continue
    }
    if (s === "tomorrow") {
      dueTomorrow.push(t)
      continue
    }
    if (s === "next-week" || s === "anytime") {
      dueSoon.push(t)
      continue
    }
    if (s === "picked") {
      const pd = t.schedulePickedDate
      if (pd) {
        switch (bucketForSchedulePickedDate(pd)) {
          case "overdue":
            overdue.push(t)
            break
          case "dueToday":
            dueToday.push(t)
            break
          case "dueTomorrow":
            dueTomorrow.push(t)
            break
          case "dueSoon":
            dueSoon.push(t)
            break
        }
      } else {
        dueSoon.push(t)
      }
      continue
    }
    dueSoon.push(t)
  }

  return { overdue, dueToday, dueTomorrow, dueSoon }
}

const BUCKET_RENDER_ORDER = ["Due today", "Due tomorrow", "Due Soon", "Overdue"] as const

/**
 * Flat task id order for the sidebar All tab: scheduled groups (fixed order), then each project's tasks in `projects` order.
 */
export function getVisibleAllTabTaskOrder(tasks: Task[], projects: CanvasProject[]): string[] {
  const buckets = computeIncompleteSidebarBuckets(tasks)
  const bucketMap: Record<string, Task[]> = {
    Overdue: buckets.overdue,
    "Due today": buckets.dueToday,
    "Due tomorrow": buckets.dueTomorrow,
    "Due Soon": buckets.dueSoon,
  }

  const ids: string[] = []
  for (const label of BUCKET_RENDER_ORDER) {
    for (const t of bucketMap[label]) {
      ids.push(t.id)
    }
  }

  const projectTaskMap: Record<string, Task[]> = {}
  for (const t of tasks) {
    if (t.completed) continue
    const pid = (t.projectId ?? "general").trim() || "general"
    if (!projectTaskMap[pid]) projectTaskMap[pid] = []
    projectTaskMap[pid].push(t)
  }

  for (const p of projects) {
    const list = projectTaskMap[p.id] ?? []
    for (const t of list) {
      ids.push(t.id)
    }
  }

  return ids
}

/** Completed tab: same order as `tasks.filter(completed)` render (array order in `completedTasks` helper). */
export function getVisibleCompletedTabTaskOrder(tasks: Task[]): string[] {
  return tasks.filter((t) => t.completed).map((t) => t.id)
}
