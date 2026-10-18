import { createId, nowIso } from "./ids.ts"
import type { ItemPatch, PathItem, PathItemType } from "./types.ts"

export function createItem(
  partial: Partial<PathItem> & { title: string; type?: PathItemType },
): PathItem {
  const now = nowIso()
  const item: PathItem = {
    id: partial.id ?? createId(),
    type: partial.type ?? "step",
    title: partial.title,
    description: partial.description ?? "",
    status: partial.status ?? "not-started",
    position: partial.position ?? 0,
    linkedItemIds: partial.linkedItemIds ? [...partial.linkedItemIds] : [],
    blockedByIds: partial.blockedByIds ? [...partial.blockedByIds] : [],
    origin: partial.origin ?? "manual",
    userEdited: partial.userEdited ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  }
  if (partial.dueDate) item.dueDate = partial.dueDate
  if (partial.sourceExcerpt) item.sourceExcerpt = partial.sourceExcerpt
  if (partial.sourceId) item.sourceId = partial.sourceId
  if (partial.dateLabel) item.dateLabel = partial.dateLabel
  if (partial.dateCertainty) item.dateCertainty = partial.dateCertainty
  if (partial.spokenInstruction) item.spokenInstruction = partial.spokenInstruction
  if (partial.priority) item.priority = partial.priority
  if (partial.actionInstruction?.trim()) item.actionInstruction = partial.actionInstruction.trim()
  return item
}

export function applyItemPatch(item: PathItem, patch: ItemPatch): PathItem {
  const { priority, actionInstruction, ...rest } = patch
  const next: PathItem = {
    ...item,
    ...rest,
    updatedAt: nowIso(),
  }
  if (patch.dueDate === "") delete next.dueDate
  if (priority) next.priority = priority
  if (priority === "") delete next.priority
  if (actionInstruction !== undefined) {
    const instruction = actionInstruction.trim()
    if (instruction) next.actionInstruction = instruction
    else delete next.actionInstruction
  }
  return next
}
