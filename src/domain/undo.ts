import { nowIso } from "./ids.ts"
import type { PathItem, PathWorkspace } from "./types.ts"

export interface UndoEntry {
  workspaceId: string
  items: PathItem[]
  currentItemId: string | null
}

function cloneItems(items: PathItem[]): PathItem[] {
  return items.map((item) => ({ ...item, linkedItemIds: [...item.linkedItemIds] }))
}

export function pushUndo(stack: UndoEntry[], entry: UndoEntry, limit = 30): UndoEntry[] {
  const snapshot: UndoEntry = {
    workspaceId: entry.workspaceId,
    items: cloneItems(entry.items),
    currentItemId: entry.currentItemId,
  }
  return [...stack, snapshot].slice(-limit)
}

export function applyUndo(workspaces: PathWorkspace[], entry: UndoEntry): PathWorkspace[] {
  return workspaces.map((workspace) => {
    if (workspace.id !== entry.workspaceId) return workspace
    return {
      ...workspace,
      items: cloneItems(entry.items),
      currentItemId: entry.currentItemId,
      updatedAt: nowIso(),
    }
  })
}
