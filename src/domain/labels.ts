import type { PathItemStatus, PathItemType } from "./types.ts"

export const TYPE_LABELS: Record<PathItemType, string> = {
  goal: "Goal",
  step: "Step",
  requirement: "Requirement",
  deadline: "Deadline",
  resource: "Resource",
  person: "Person",
  note: "Note",
}

export const STATUS_LABELS: Record<PathItemStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
}

export const TYPE_OPTIONS: PathItemType[] = [
  "goal",
  "step",
  "requirement",
  "deadline",
  "resource",
  "person",
  "note",
]

export const STATUS_OPTIONS: PathItemStatus[] = [
  "not-started",
  "in-progress",
  "completed",
]
