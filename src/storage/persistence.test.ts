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

  it("loads an older card that has none of the extraction fields", () => {
    const storage = memoryStorage()
    storage.setItem(
      STORAGE_KEYS.workspaces,
      JSON.stringify([
        {
          id: "path-old",
          title: "Old path",
          sourceText: "Read this",
          currentItemId: "card-old",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
          items: [
            {
              id: "card-old",
              type: "step",
              title: "Read this",
              description: "Saved before extraction fields existed.",
              status: "not-started",
              position: 0,
              linkedItemIds: [],
              createdAt: "2026-10-01T00:00:00.000Z",
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
      ]),
    )
    const loaded = loadAppState(storage)
    const item = loaded.workspaces[0]?.items[0]
    expect(item?.title).toBe("Read this")
    expect(item?.origin).toBeUndefined()
    expect(item?.blockedByIds).toEqual([])
    expect(loaded.notice).toBeNull()
  })

  it("keeps text size, contrast, and reduced motion, and replaces corrupt settings", () => {
    const storage = memoryStorage()
    expect(
      saveAppState(storage, {
        workspaces: [],
        activeId: null,
        preferences: { ...defaultPreferences, fontScale: "extra-large", highContrast: true, reducedMotion: true },
        session: { ...defaultSession, draftItems: null },
      }),
    ).toBeNull()
    const loaded = loadAppState(storage)
    expect(loaded.preferences.fontScale).toBe("extra-large")
    expect(loaded.preferences.highContrast).toBe(true)
    expect(loaded.preferences.reducedMotion).toBe(true)

    storage.setItem(STORAGE_KEYS.preferences, "{")
    const broken = loadAppState(storage)
    expect(broken.preferences).toEqual(defaultPreferences)
    expect(broken.notice).toMatch(/accessibility settings/i)
  })

  it("clears corrupted undo history and a history saved by another version", () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.history, "{")
    const corrupt = loadAppState(storage)
    expect(corrupt.history.undo).toEqual([])
    expect(corrupt.history.redo).toEqual([])
    expect(corrupt.notice).toMatch(/undo history could not be read/i)

    storage.setItem(
      STORAGE_KEYS.history,
      JSON.stringify({ schemaVersion: 99, undo: [{ id: "old" }], redo: [] }),
    )
    const migrated = loadAppState(storage)
    expect(migrated.history.undo).toEqual([])
    expect(migrated.notice).toMatch(/another version/i)
  })

  it("starts fresh when saved paths are corrupted", () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.workspaces, "{")
    const loaded = loadAppState(storage)
    expect(loaded.workspaces).toEqual([])
    expect(loaded.notice).toMatch(/could not be read/i)
  })
})
