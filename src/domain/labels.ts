import type { ItemPriority, PathItemStatus, PathItemType, RelationshipKind } from "./types.ts"

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

export const PRIORITY_OPTIONS: { value: "" | ItemPriority; label: string }[] = [
  { value: "", label: "No priority set" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
]

export const RELATIONSHIP_LABELS: Record<RelationshipKind, string> = {
  satisfies: "Satisfies",
  requires: "Needs",
  before: "Happens before",
  "applies-to": "Applies to",
  supports: "Supports",
  order: "Suggested order",
  connects: "Connected",
}

export const RELATIONSHIP_OPTIONS: RelationshipKind[] = [
  "satisfies",
  "requires",
  "before",
  "applies-to",
  "supports",
  "order",
  "connects",
]
