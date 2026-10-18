import { describe, expect, it } from "vitest"
import { HISTORY_SCHEMA_VERSION } from "../domain/history.ts"
import { createItem } from "../domain/items.ts"
import type { PathWorkspace } from "../domain/types.ts"
import { defaultPreferences } from "../domain/validate.ts"
import { loadAppState, saveAppState } from "../storage/persistence.ts"
import { createInitialState, sessionFromState, workspaceReducer, type WorkspaceState } from "./workspaceReducer.ts"

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
    redoStack: [],
    undoConflict: null,
    notice: null,
    message: null,
    draftSource: "",
    draftItems: null,
    draftTitle: "",
    extractionNotice: null,
    extractionStatus: null,
    draftRelationships: [],
    draftWarnings: [],
    draftMode: "create",
    draftSourceRef: null,
    settingsReturn: null,
    reextractPlan: null,
    pendingReview: null,
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

  it("cancels a draft review without changing the open path", () => {
    const initial = state()
    const reviewing = workspaceReducer(initial, {
      type: "set-review",
      items: [createItem({ id: "extra", title: "Extra step", type: "step", sourceExcerpt: "Extra step." })],
      mode: "merge",
      notice: "Review this draft.",
    })
    const cancelled = workspaceReducer({ ...reviewing, view: "create" }, { type: "cancel-draft" })
    expect(cancelled.workspaces).toBe(initial.workspaces)
    expect(cancelled.view).toBe("workspace")
    expect(cancelled.draftItems).toBeNull()
  })

  it("does not add the same card when a draft is committed twice", () => {
    const initial = state()
    const draft = {
      ...createItem({
        id: "summary",
        title: "Write the summary",
        type: "step" as const,
        origin: "extracted" as const,
        sourceExcerpt: "Write the summary.",
      }),
      reviewStatus: "accepted" as const,
      reviewAccepted: true,
    }
    const first = workspaceReducer(initial, { type: "commit-merge", items: [draft], relationships: [] })
    const second = workspaceReducer(first, { type: "commit-merge", items: [draft], relationships: [] })
    const titles = second.workspaces[0]?.items.map((item) => item.title) ?? []
    expect(titles.filter((title) => title === "Write the summary")).toHaveLength(1)
    expect(first.workspaces[0]?.items).toHaveLength((initial.workspaces[0]?.items.length ?? 0) + 1)
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

  it("leaves an edited card and a completed card in place when extraction runs again", () => {
    const initial = state()
    const active = initial.workspaces[0]
    if (!active) throw new Error("missing workspace")
    active.sourceText = "Finish the lab report.\n\nCollect the data."
    active.items = [
      createItem({
        id: "goal",
        title: "Kept goal",
        type: "goal",
        origin: "extracted",
        userEdited: true,
        sourceExcerpt: "Finish the lab report.",
        position: 0,
      }),
      createItem({
        id: "step",
        title: "Already done",
        type: "step",
        origin: "extracted",
        status: "completed",
        sourceExcerpt: "Collect the data.",
        position: 1,
      }),
    ]
    const next = workspaceReducer(initial, { type: "organize-again" })
    expect(next.workspaces[0]?.items.map((item) => item.title)).toEqual(["Kept goal", "Already done"])
    expect(next.pendingReview).toBeNull()
    expect(next.workspaces[0]?.items[0]?.title).toBe("Kept goal")
  })

  it("keeps a card whose paragraph was removed until the user removes it", () => {
    const initial = state()
    const active = initial.workspaces[0]
    if (!active) throw new Error("missing workspace")
    active.sourceText = "Finish the lab report."
    active.items = [
      createItem({
        id: "goal",
        title: "Finish the lab report",
        description: "Finish the lab report.",
        type: "goal",
        origin: "extracted",
        sourceExcerpt: "Finish the lab report.",
        sourceId: "draft-goal",
        linkedItemIds: ["write"],
        position: 0,
      }),
      createItem({
        id: "write",
        title: "Write the summary",
        type: "step",
        origin: "extracted",
        sourceExcerpt: "Write the summary.",
        sourceId: "draft-write",
        linkedItemIds: ["goal"],
        position: 1,
      }),
    ]
    const reviewing = workspaceReducer(initial, { type: "organize-again" })
    expect(reviewing.workspaces[0]?.items).toHaveLength(2)
    expect(reviewing.reextractPlan?.entries.some((entry) => entry.change === "removed-from-source" && entry.existingId === "write")).toBe(true)

    const kept = workspaceReducer(reviewing, { type: "commit-reextract" })
    expect(kept.workspaces[0]?.items.map((item) => item.id)).toEqual(["goal", "write"])
    expect(kept.workspaces[0]?.items[0]?.linkedItemIds).toEqual(["write"])

    const decided = workspaceReducer(reviewing, { type: "reextract-decision", id: "write", decision: "remove" })
    const removed = workspaceReducer(decided, { type: "commit-reextract" })
    expect(removed.workspaces[0]?.items.map((item) => item.id)).toEqual(["goal"])
    expect(removed.workspaces[0]?.items[0]?.linkedItemIds).toEqual([])
    expect(removed.message).toMatch(/removed/)
  })

  it("undoes the latest edit and keeps an earlier edit on another card", () => {
    const first = workspaceReducer(state(), {
      type: "update-item",
      id: "active-card",
      patch: { title: "Changed card" },
      recordUndo: true,
    })
    const second = workspaceReducer(first, {
      type: "update-item",
      id: "active-note",
      patch: { title: "Changed note" },
      recordUndo: true,
    })
    const undone = workspaceReducer(second, { type: "undo" })
    expect(undone.workspaces[0]?.items[0]?.title).toBe("Changed card")
    expect(undone.workspaces[0]?.items[1]?.title).toBe("Application note")
    expect(undone.message).toMatch(/undid the last card change/i)
    const again = workspaceReducer(undone, { type: "undo" })
    expect(again.workspaces[0]?.items[0]?.title).toBe("Application")
    const redone = workspaceReducer(again, { type: "redo" })
    expect(redone.workspaces[0]?.items[0]?.title).toBe("Changed card")
    expect(redone.workspaces[0]?.items[1]?.title).toBe("Application note")
    expect(redone.message).toMatch(/redid the last card change/i)
  })

  it("records one step for a typing burst", () => {
    const started = workspaceReducer(state(), {
      type: "update-item",
      id: "active-card",
      patch: { title: "A" },
      recordUndo: true,
    })
    const typed = workspaceReducer(started, {
      type: "update-item",
      id: "active-card",
      patch: { title: "Accidental title" },
      recordUndo: false,
    })
    expect(typed.undoStack).toHaveLength(1)
    const restored = workspaceReducer(typed, { type: "undo" })
    expect(restored.workspaces[0]?.items[0]?.title).toBe("Application")
  })

  it("does not record moving between cards", () => {
    const moved = workspaceReducer(state(), { type: "set-current", id: "active-note" })
    expect(moved.undoStack).toHaveLength(0)
  })

  it("refuses to undo when the card changed again and can skip that step", () => {
    const edited = workspaceReducer(state(), {
      type: "update-item",
      id: "active-card",
      patch: { title: "Accidental title" },
      recordUndo: true,
    })
    const drifted = {
      ...edited,
      workspaces: edited.workspaces.map((workspace) =>
        workspace.id === "active"
          ? {
              ...workspace,
              items: workspace.items.map((item) =>
                item.id === "active-card" ? { ...item, title: "Changed by hand" } : item,
              ),
            }
          : workspace,
      ),
    }
    const blocked = workspaceReducer(drifted, { type: "undo" })
    expect(blocked.workspaces[0]?.items[0]?.title).toBe("Changed by hand")
    expect(blocked.message).toMatch(/edited again/i)
    expect(blocked.undoConflict?.itemId).toBe("active-card")
    expect(blocked.undoStack).toHaveLength(1)
    const skipped = workspaceReducer(blocked, { type: "skip-undo" })
    expect(skipped.undoStack).toHaveLength(0)
    expect(skipped.workspaces[0]?.items[0]?.title).toBe("Changed by hand")
    expect(skipped.message).toMatch(/edit the card yourself/i)
  })

  it("refuses to undo when the card is missing", () => {
    const edited = workspaceReducer(state(), {
      type: "update-item",
      id: "active-card",
      patch: { title: "Accidental title" },
      recordUndo: true,
    })
    const missing = {
      ...edited,
      workspaces: edited.workspaces.map((workspace) =>
        workspace.id === "active"
          ? { ...workspace, items: workspace.items.filter((item) => item.id !== "active-card") }
          : workspace,
      ),
    }
    const blocked = workspaceReducer(missing, { type: "undo" })
    expect(blocked.workspaces[0]?.items.some((item) => item.id === "active-card")).toBe(false)
    expect(blocked.message).toMatch(/no longer on this path/i)
    expect(blocked.undoStack).toHaveLength(1)
  })

  it("undoes one connection and keeps another", () => {
    const first = workspaceReducer(state(), { type: "link", sourceId: "active-card", targetId: "active-note" })
    const added = workspaceReducer(first, { type: "add-item" })
    const newId = added.workspaces[0]?.items.at(-1)?.id
    if (!newId) throw new Error("missing card")
    const second = workspaceReducer(added, { type: "link", sourceId: newId, targetId: "active-note" })
    const undone = workspaceReducer(second, { type: "undo" })
    const note = undone.workspaces[0]?.items.find((item) => item.id === "active-note")
    const created = undone.workspaces[0]?.items.find((item) => item.id === newId)
    expect(note?.linkedItemIds).toEqual(["active-card"])
    expect(created?.linkedItemIds).toEqual([])
    expect(undone.workspaces[0]?.relationships?.map((relationship) => relationship.toId)).toEqual(["active-note"])
    expect(undone.workspaces[0]?.items.some((item) => item.id === newId)).toBe(true)
  })

  it("restores a deleted card together with its connection", () => {
    const linked = workspaceReducer(state(), { type: "link", sourceId: "active-card", targetId: "active-note" })
    const deleted = workspaceReducer(linked, { type: "delete-item", id: "active-card" })
    expect(deleted.workspaces[0]?.relationships).toEqual([])
    const restored = workspaceReducer(deleted, { type: "undo" })
    expect(restored.workspaces[0]?.items.map((item) => item.id)).toEqual(["active-card", "active-note"])
    expect(restored.workspaces[0]?.relationships).toHaveLength(1)
    expect(restored.workspaces[0]?.items.find((item) => item.id === "active-note")?.linkedItemIds).toContain("active-card")
  })
})

describe("undo persistence", () => {
  it("undoes a card edit after the history is saved and loaded", () => {
    const edited = workspaceReducer(state(), {
      type: "update-item",
      id: "active-card",
      patch: { title: "Accidental title" },
      recordUndo: true,
    })
    const storage = memoryStorage()
    saveAppState(storage, {
      workspaces: edited.workspaces,
      activeId: edited.activeId,
      preferences: defaultPreferences,
      session: sessionFromState(edited),
      history: { schemaVersion: HISTORY_SCHEMA_VERSION, undo: edited.undoStack, redo: edited.redoStack },
    })
    const restored = createInitialState(loadAppState(storage))
    expect(restored.undoStack).toHaveLength(1)
    const undone = workspaceReducer(restored, { type: "undo" })
    expect(undone.workspaces[0]?.items[0]?.title).toBe("Application")
    expect(undone.workspaces[1]?.title).toBe("Lab")
    expect(undone.redoStack).toHaveLength(1)
  })
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe("focus selection", () => {
  it("opens focus on the earlier deadline and moves on after that step is completed", () => {
    const base = state()
    const first = createItem({
      id: "first",
      title: "Read the chapter",
      type: "step",
      position: 0,
      dueDate: "2026-11-01",
    })
    const second = createItem({
      id: "second",
      title: "Submit the form",
      type: "step",
      position: 1,
      dueDate: "2026-12-01",
    })
    const ready = {
      ...base,
      workspaces: [
        { ...base.workspaces[0]!, items: [first, second], currentItemId: "first", relationships: [] },
        base.workspaces[1]!,
      ],
    }
    const edited = workspaceReducer(ready, {
      type: "update-item",
      id: "second",
      patch: { dueDate: "2026-10-20" },
      recordUndo: true,
    })
    expect(edited.workspaces[0]?.items.find((item) => item.id === "first")?.dueDate).toBe("2026-11-01")
    expect(edited.workspaces[0]?.items.find((item) => item.id === "second")?.dueDate).toBe("2026-10-20")

    const focused = workspaceReducer(edited, { type: "enter-focus" })
    expect(focused.view).toBe("focus")
    expect(focused.workspaces[0]?.currentItemId).toBe("second")
    expect(focused.message).toMatch(/deadline/i)

    const done = workspaceReducer(focused, { type: "complete-current" })
    expect(done.workspaces[0]?.items.find((item) => item.id === "second")?.status).toBe("completed")
    expect(done.workspaces[0]?.currentItemId).toBe("first")
    expect(done.workspaces[1]).toBe(base.workspaces[1])
  })

  it("moves between equally ready steps without using card position", () => {
    const base = state()
    const alpha = createItem({ id: "alpha", title: "Alpha step", type: "step", position: 5 })
    const beta = createItem({ id: "beta", title: "Beta step", type: "step", position: 0 })
    const ready = {
      ...base,
      workspaces: [
        { ...base.workspaces[0]!, items: [beta, alpha], currentItemId: "beta", relationships: [] },
        base.workspaces[1]!,
      ],
    }
    const focused = workspaceReducer(ready, { type: "enter-focus" })
    expect(focused.workspaces[0]?.currentItemId).toBe("alpha")
    const next = workspaceReducer(focused, { type: "move-step", direction: 1 })
    expect(next.workspaces[0]?.currentItemId).toBe("beta")
  })

  it("switches away from a step when a new dependency blocks it", () => {
    const base = state()
    const write = createItem({ id: "write", title: "Write the summary", type: "step", position: 1 })
    const submit = createItem({
      id: "submit",
      title: "Submit the form",
      type: "step",
      position: 0,
      dueDate: "2026-10-01",
      blockedByIds: ["write"],
    })
    const ready = {
      ...base,
      view: "focus" as const,
      workspaces: [
        { ...base.workspaces[0]!, items: [submit, write], currentItemId: "submit", relationships: [] },
        base.workspaces[1]!,
      ],
    }
    const focused = workspaceReducer(ready, { type: "enter-focus" })
    expect(focused.workspaces[0]?.currentItemId).toBe("write")
    expect(focused.workspaces[0]?.items.find((item) => item.id === "submit")?.blockedByIds).toEqual(["write"])
    expect(focused.message).toMatch(/ready to start/)
  })

  it("returns to the screen that opened settings", () => {
    const focused = { ...state(), view: "focus" as const }
    const settings = workspaceReducer(focused, { type: "go-settings" })
    expect(settings.view).toBe("settings")
    expect(settings.settingsReturn).toBe("focus")
    expect(workspaceReducer(settings, { type: "close-settings" }).view).toBe("focus")
  })

  it("renames a path without changing its cards", () => {
    const renamed = workspaceReducer(state(), { type: "rename-workspace", id: "active", title: " Summer research " })
    expect(renamed.workspaces[0]?.title).toBe("Summer research")
    expect(renamed.workspaces[0]?.items.map((item) => item.id)).toEqual(["active-card", "active-note"])
    expect(renamed.workspaces[1]?.title).toBe("Lab")
    expect(renamed.message).toMatch(/renamed/i)
  })

  it("deletes the active path, clears its undo history, and returns home", () => {
    const initial = state()
    const edited = workspaceReducer(initial, {
      type: "update-item",
      id: "active-card",
      patch: { title: "Changed" },
      recordUndo: true,
    })
    expect(edited.undoStack).toHaveLength(1)
    const deleted = workspaceReducer(edited, { type: "delete-workspace", id: "active" })
    expect(deleted.workspaces.map((workspace) => workspace.id)).toEqual(["other"])
    expect(deleted.activeId).toBe("other")
    expect(deleted.view).toBe("home")
    expect(deleted.undoStack).toEqual([])
    expect(deleted.redoStack).toEqual([])
    expect(deleted.message).toMatch(/deleted/i)
  })

  it("keeps the open path when a different path is deleted", () => {
    const deleted = workspaceReducer(state(), { type: "delete-workspace", id: "other" })
    expect(deleted.workspaces.map((workspace) => workspace.id)).toEqual(["active"])
    expect(deleted.activeId).toBe("active")
    expect(deleted.view).toBe("workspace")
  })
})

describe("path persistence safety", () => {
  it("preserves remaining paths after deleting the active one across refresh", () => {
    const storage = memoryStorage()
    let current = state()
    current = workspaceReducer(current, { type: "delete-workspace", id: "active" })
    saveAppState(storage, {
      workspaces: current.workspaces,
      activeId: current.activeId,
      preferences: defaultPreferences,
      session: sessionFromState(current),
      history: { schemaVersion: HISTORY_SCHEMA_VERSION, undo: current.undoStack, redo: current.redoStack },
    })
    const restored = createInitialState(loadAppState(storage))
    expect(restored.workspaces.map((workspace) => workspace.id)).toEqual(["other"])
    expect(restored.activeId).toBe("other")
    expect(restored.view).toBe("home")
  })
})
