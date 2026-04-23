import type { TaskAssignee } from "@/components/chrono/task-editor-modal"

/** Display label for popover and hover tooltips (`Unassigned` when empty). */
export function formatAssigneeLabel(assignee: TaskAssignee | undefined | null): string {
  if (assignee === "tazo") return "Tazo"
  if (assignee === "mebo") return "Mebo"
  return "Unassigned"
}

/** True when the task should show the compact assignee chip (not unassigned). */
export function isAssignedDesignee(assignee: TaskAssignee | undefined | null): assignee is "tazo" | "mebo" {
  return assignee === "tazo" || assignee === "mebo"
}
