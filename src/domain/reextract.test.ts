import { describe, expect, it } from "vitest"
import { createItem } from "./items.ts"
import { parseInstructions } from "./parseInstructions.ts"
import { applyReextract, cardProvenance, compareExtraction } from "./reextract.ts"
import { commitReview } from "./reviewCommit.ts"
import type { PathItem, Relationship } from "./types.ts"

const NOW = new Date(2026, 9, 18, 12, 0, 0)

function extracted(partial: Partial<PathItem> & { title: string }): PathItem {
  return createItem({ origin: "extracted", userEdited: false, ...partial })
}

function accepted(items: PathItem[]): PathItem[] {
  return items.map((item) => ({ ...item, reviewStatus: "accepted" as const, reviewAccepted: true }))
}

describe("safe re-extraction", () => {
  it("keeps a manual edit until the new version is accepted", () => {
    const current = extracted({
      id: "write",
      title: "Write my summary",
      description: "Use your own words.",
      type: "step",
      sourceExcerpt: "Write the summary.",
      sourceId: "draft-write",
      userEdited: true,
    })
    const proposed = extracted({
      id: "draft-write",
      title: "Write the summary",
      description: "Write the summary.",
      type: "step",
      sourceExcerpt: "Write the summary.",
      sourceId: "draft-write",
    })
    expect(cardProvenance(current)).toBe("user-edited")
    const plan = compareExtraction({
      existing: [current],
      proposed: [proposed],
      sourceText: "Write the summary.",
    })
    expect(plan.entries.map((entry) => entry.change)).toEqual(["conflicting"])
    expect(plan.entries[0]?.existingId).toBe("write")

    const kept = applyReextract({
      existing: [current],
      plan: {
        ...plan,
        entries: plan.entries.map((entry) => ({ ...entry, decision: "keep" as const })),
      },
    })
    expect(kept.items.map((item) => item.title)).toEqual(["Write my summary"])
    expect(kept.items[0]?.userEdited).toBe(true)

    const replaced = applyReextract({
      existing: [current],
      plan: {
        ...plan,
        entries: plan.entries.map((entry) => ({
          ...entry,
          decision: "accept" as const,
          fields: { title: "accept", description: "accept" },
        })),
      },
    })
    expect(replaced.items).toHaveLength(1)
    expect(replaced.items[0]).toMatchObject({ id: "write", title: "Write the summary", userEdited: false })
  })

  it("can keep the edited title and take the new deadline", () => {
    const current = extracted({
      id: "due",
      title: "My deadline",
      type: "deadline",
      dueDate: "2026-10-30",
      dateLabel: "October 30, 2026",
      sourceExcerpt: "Also, the form is due October 30, 2026.",
      sourceId: "draft-oct",
      userEdited: true,
    })
    const proposed = extracted({
      id: "draft-nov",
      title: "Due November 2, 2026",
      description: "Also, the form is due November 2, 2026.",
      type: "deadline",
      dueDate: "2026-11-02",
      dateLabel: "November 2, 2026",
      sourceExcerpt: "Also, the form is due November 2, 2026.",
      sourceId: "draft-nov",
    })
    const plan = compareExtraction({
      existing: [current],
      proposed: [proposed],
      sourceText: "Also, the form is due November 2, 2026.",
    })
    expect(plan.entries[0]).toMatchObject({
      change: "conflicting",
      existingId: "due",
      changedFields: ["title", "description", "deadline"],
    })
    const merged = applyReextract({
      existing: [current],
      plan: {
        ...plan,
        entries: plan.entries.map((entry) => ({
          ...entry,
          decision: "accept" as const,
          fields: { title: "keep", description: "keep", deadline: "accept" },
        })),
      },
    })
    expect(merged.items[0]).toMatchObject({
      id: "due",
      title: "My deadline",
      dueDate: "2026-11-02",
      userEdited: true,
    })
  })

  it("does not delete a card when its paragraph leaves the source", () => {
    const kept = extracted({
      id: "finish",
      title: "Finish the lab report",
      type: "goal",
      sourceExcerpt: "Finish the lab report.",
      sourceId: "draft-finish",
    })
    const missing = extracted({
      id: "write",
      title: "Write the summary",
      type: "step",
      sourceExcerpt: "Write the summary.",
      sourceId: "draft-write",
    })
    const plan = compareExtraction({
      existing: [kept, missing],
      proposed: [kept],
      sourceText: "Finish the lab report.",
    })
    const removal = plan.entries.find((entry) => entry.existingId === "write")
    expect(removal).toMatchObject({ change: "removed-from-source", decision: "keep" })
    const stayed = applyReextract({ existing: [kept, missing], plan })
    expect(stayed.removed).toBe(0)
    expect(stayed.items.map((item) => item.id)).toEqual(["finish", "write"])

    const dropped = applyReextract({
      existing: [kept, missing],
      plan: {
        ...plan,
        entries: plan.entries.map((entry) =>
          entry.existingId === "write" ? { ...entry, decision: "remove" as const } : entry,
        ),
      },
    })
    expect(dropped.items.map((item) => item.id)).toEqual(["finish"])
    expect(dropped.removed).toBe(1)
  })

  it("treats a changed deadline as a modification of the same card", () => {
    const text = "Finish the lab report.\n\nCollect the data by October 30, 2026.\n\nWrite the summary."
    const updated = "Finish the lab report.\n\nCollect the data by November 2, 2026.\n\nWrite the summary."
    const first = commitReview({
      existing: [],
      draft: accepted(parseInstructions(text, NOW).items),
      relationships: [],
    })
    const second = parseInstructions(updated, NOW)
    const plan = compareExtraction({
      existing: first.items,
      proposed: second.items,
      proposedRelationships: second.relationships,
      sourceText: updated,
    })
    const deadline = plan.entries.find((entry) => entry.current?.type === "deadline" || entry.proposed?.type === "deadline")
    expect(deadline).toMatchObject({ change: "modified" })
    expect(deadline?.existingId).toBeTruthy()
    expect(deadline?.proposed?.dueDate).toBe("2026-11-02")
    expect(plan.entries.some((entry) => entry.change === "removed-from-source" && entry.current?.type === "deadline")).toBe(false)
  })

  it("does not add a second card for duplicate text", () => {
    const excerpt = "Upload the transcript."
    const first = extracted({
      id: "upload",
      title: "Upload the transcript",
      type: "step",
      sourceExcerpt: excerpt,
      sourceId: "draft-upload",
    })
    const duplicate = extracted({
      id: "upload-again",
      title: "Upload the transcript",
      type: "step",
      sourceExcerpt: excerpt,
      sourceId: "draft-upload",
    })
    const proposed = extracted({
      id: "draft-upload",
      title: "Upload the transcript",
      type: "step",
      sourceExcerpt: excerpt,
      sourceId: "draft-upload",
    })
    const plan = compareExtraction({
      existing: [first, duplicate],
      proposed: [proposed],
      sourceText: "Upload the transcript.\n\nPlease upload the transcript.",
    })
    expect(plan.entries.filter((entry) => entry.change === "new")).toHaveLength(0)
    expect(plan.entries.find((entry) => entry.existingId === "upload-again")?.change).toBe("unchanged")
    const applied = applyReextract({
      existing: [first, duplicate],
      plan: {
        ...plan,
        entries: plan.entries.map((entry) => ({ ...entry, decision: entry.decision === "pending" ? "accept" as const : entry.decision })),
      },
    })
    expect(applied.added).toBe(0)
    expect(applied.items).toHaveLength(2)
  })

  it("keeps the same cards when instructions are reordered", () => {
    const original = "Finish the lab report.\n\nWrite the summary.\n\nCollect the data."
    const reordered = "Collect the data.\n\nFinish the lab report.\n\nWrite the summary."
    const first = commitReview({
      existing: [],
      draft: accepted(parseInstructions(original, NOW).items),
      relationships: [],
    })
    const second = parseInstructions(reordered, NOW)
    const plan = compareExtraction({
      existing: first.items,
      proposed: second.items,
      sourceText: reordered,
    })
    expect(plan.entries.every((entry) => entry.change === "unchanged")).toBe(true)
    const applied = applyReextract({ existing: first.items, plan })
    expect(applied.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id))
    expect(applied.added).toBe(0)
    expect(applied.removed).toBe(0)
  })

  it("explains a connection that breaks when a linked card is removed", () => {
    const goal = extracted({
      id: "goal",
      title: "Finish the lab report",
      type: "goal",
      sourceExcerpt: "Finish the lab report.",
      sourceId: "draft-goal",
      linkedItemIds: ["write"],
    })
    const write = extracted({
      id: "write",
      title: "Write the summary",
      type: "step",
      sourceExcerpt: "Write the summary.",
      sourceId: "draft-write",
      linkedItemIds: ["goal"],
      blockedByIds: ["goal"],
    })
    const relationship: Relationship = {
      id: "rel-goal-write",
      fromId: "goal",
      toId: "write",
      kind: "connects",
      reason: "You linked these cards.",
      basis: "stated",
      confidence: "high",
      reviewStatus: "accepted",
    }
    const plan = compareExtraction({
      existing: [goal, write],
      existingRelationships: [relationship],
      proposed: [goal],
      sourceText: "Finish the lab report.",
    })
    const removal = plan.entries.find((entry) => entry.existingId === "write")
    expect(removal?.change).toBe("removed-from-source")
    expect(removal?.linkNotes.join(" ")).toMatch(/Finish the lab report/)
    const applied = applyReextract({
      existing: [goal, write],
      existingRelationships: [relationship],
      plan: {
        ...plan,
        entries: plan.entries.map((entry) =>
          entry.existingId === "write" ? { ...entry, decision: "remove" as const } : entry,
        ),
      },
    })
    expect(applied.items.find((item) => item.id === "goal")?.linkedItemIds).toEqual([])
    expect(applied.relationships).toEqual([])
    expect(applied.repairs.join(" ")).toMatch(/removed/)
  })

  it("leaves a card the user added by hand on the path", () => {
    const manual = createItem({ id: "note", title: "Office hours", type: "note", origin: "manual" })
    expect(cardProvenance(manual)).toBe("manual")
    const plan = compareExtraction({
      existing: [manual],
      proposed: [],
      sourceText: "Finish the lab report.",
    })
    expect(plan.entries[0]).toMatchObject({ change: "unchanged", decision: "keep" })
    const applied = applyReextract({ existing: [manual], plan })
    expect(applied.items.map((item) => item.id)).toEqual(["note"])
  })
})
