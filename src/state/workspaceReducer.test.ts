import { describe, expect, it } from "vitest"
import { createItem } from "../domain/items.ts"
import type { PathWorkspace } from "../domain/types.ts"
import { workspaceReducer, type WorkspaceState } from "./workspaceReducer.ts"

function workspace(id: string, title: string): PathWorkspace {
  return {
    id,
    title,
    sourceText: "",
    items: [
      createItem({ id: `${id}-card`, title, type: "step", position: 0 }),
      createItem({ id: `${id}-note`, title: `${title} note`, type: "note", position: 1 }),
    ],
    currentItemId: `${id}-card`,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  }
}

function state(): WorkspaceState {
  return {
    workspaces: [workspace("active", "Application"), workspace("other", "Lab")],
    activeId: "active",
    view: "workspace",
    tab: "cards",
    undoStack: [],
    notice: null,
    message: null,
    draftSource: "",
    draftItems: null,
  }
}

describe("undo", () => {
  it("restores a deleted card and leaves the other path unchanged", () => {
    const initial = state()
    const other = initial.workspaces[1]
    const deleted = workspaceReducer(initial, { type: "delete-item", id: "active-card" })
    expect(deleted.workspaces[0]?.items.map((item) => item.id)).toEqual(["active-note"])
    expect(deleted.workspaces[1]).toBe(other)

    const restored = workspaceReducer(deleted, { type: "undo" })
    expect(restored.workspaces[0]?.items.map((item) => item.id)).toEqual(["active-card", "active-note"])
    expect(restored.workspaces[0]?.currentItemId).toBe("active-card")
    expect(restored.workspaces[1]).toBe(other)
    expect(restored.undoStack).toHaveLength(0)
  })

  it("restores a card edit without reverting a different path", () => {
    const initial = state()
    const other = initial.workspaces[1]
    const edited = workspaceReducer(initial, {
      type: "update-item",
      id: "active-card",
      patch: { title: "Accidental title" },
      recordUndo: true,
    })
    expect(edited.workspaces[0]?.items[0]?.title).toBe("Accidental title")

    const restored = workspaceReducer(edited, { type: "undo" })
    expect(restored.workspaces[0]?.items[0]?.title).toBe("Application")
    expect(restored.workspaces[1]).toBe(other)
  })
})
