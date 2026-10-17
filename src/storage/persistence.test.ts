import { describe, expect, it } from "vitest"
import { createItem } from "../domain/items.ts"
import type { PathWorkspace } from "../domain/types.ts"
import { defaultPreferences, defaultSession } from "../domain/validate.ts"
import { loadAppState, saveAppState, STORAGE_KEYS } from "./persistence.ts"

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

function workspace(): PathWorkspace {
  const item = createItem({
    id: "step-1",
    title: "Read the prompt",
    type: "step",
    position: 0,
    linkedItemIds: ["missing"],
  })
  return {
    id: "path-1",
    title: "Prepare an application before Friday",
    sourceText: "Goal: Prepare an application before Friday",
    items: [item],
    currentItemId: "missing",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  }
}

describe("persistence", () => {
  it("round-trips workspaces and repairs a missing link", () => {
    const storage = memoryStorage()
    const saved = workspace()
    expect(
      saveAppState(storage, {
        workspaces: [saved],
        activeId: saved.id,
        preferences: { ...defaultPreferences, fontScale: "large" },
        session: { ...defaultSession, view: "focus", draftItems: null },
      }),
    ).toBeNull()

    const loaded = loadAppState(storage)
    expect(loaded.activeId).toBe(saved.id)
    expect(loaded.preferences.fontScale).toBe("large")
    expect(loaded.session.view).toBe("focus")
    expect(loaded.workspaces[0]?.items[0]?.linkedItemIds).toEqual([])
    expect(loaded.workspaces[0]?.currentItemId).toBe("step-1")
    expect(loaded.notice).toMatch(/repaired/i)
  })

  it("starts fresh when saved paths are corrupted", () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.workspaces, "{")
    const loaded = loadAppState(storage)
    expect(loaded.workspaces).toEqual([])
    expect(loaded.notice).toMatch(/could not be read/i)
  })
})
