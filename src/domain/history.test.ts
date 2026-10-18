import { describe, expect, it } from "vitest"
import { createItem } from "./items.ts"
import type { PathWorkspace } from "./types.ts"
import { boundHistory, captureChange, HISTORY_SCHEMA_VERSION, parseHistory, type HistoryEntry } from "./history.ts"

function workspace(): PathWorkspace {
  return {
    id: "path",
    title: "Lab",
    sourceText: "Read the prompt.",
    items: [createItem({ id: "card", title: "Read the prompt", type: "step", position: 0 })],
    relationships: [],
    currentItemId: "card",
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  }
}

describe("history bounds", () => {
  it("drops the oldest saved steps when the history is too large", () => {
    const current = workspace()
    const entries: HistoryEntry[] = []
    let before = current
    for (let index = 0; index < 5; index += 1) {
      const after = {
        ...before,
        items: before.items.map((item) => ({ ...item, title: `Title ${index}` })),
      }
      const entry = captureChange(before, after, `2026-10-18T00:00:0${index}.000Z`)
      if (!entry) throw new Error("missing history entry")
      entries.push(entry)
      before = after
    }
    const stored = JSON.stringify({ schemaVersion: HISTORY_SCHEMA_VERSION, undo: entries, redo: [] })
    const limit = Math.floor(stored.length * 0.6)
    const bounded = boundHistory(entries, [], limit)
    expect(bounded.undo.length).toBeGreaterThan(0)
    expect(bounded.undo.length).toBeLessThan(entries.length)
    expect(bounded.undo.at(-1)?.id).toBe(entries.at(-1)?.id)
    expect(JSON.stringify({ schemaVersion: HISTORY_SCHEMA_VERSION, undo: bounded.undo, redo: [] }).length).toBeLessThanOrEqual(limit)
  })

  it("skips an unreadable history entry and keeps a valid one", () => {
    const entry = captureChange(workspace(), {
      ...workspace(),
      items: [createItem({ id: "card", title: "Changed", type: "step", position: 0 })],
    })
    const parsed = parseHistory(
      { schemaVersion: HISTORY_SCHEMA_VERSION, undo: [entry, { id: "broken" }], redo: [] },
      { missing: false, corrupt: false },
    )
    expect(parsed.history.undo).toHaveLength(1)
    expect(parsed.notice).toMatch(/unreadable/i)
  })
})
