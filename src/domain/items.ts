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
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  }
  if (partial.dueDate) item.dueDate = partial.dueDate
  return item
}

export function applyItemPatch(item: PathItem, patch: ItemPatch): PathItem {
  const next: PathItem = {
    ...item,
    ...patch,
    updatedAt: nowIso(),
  }
  if (patch.dueDate === "") delete next.dueDate
  return next
}
