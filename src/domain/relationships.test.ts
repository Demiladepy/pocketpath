import { describe, expect, it } from "vitest"
import { createItem } from "./items.ts"
import { readMap } from "./mapLayout.ts"
import { applyRelationships, proposeRelationships, validateRelationships } from "./relationships.ts"

function step(id: string, title: string, position: number, excerpt = title) {
  return createItem({ id, type: "step", title, description: title, position, sourceExcerpt: excerpt })
}

describe("proposeRelationships", () => {
  it("does not invent a prerequisite that is missing", () => {
    const submit = step("submit", "Submit the form", 0)
    const result = proposeRelationships([submit], "Submit the form.\n\nYou must upload the transcript before you submit.")
    expect(result.relationships.some((relationship) => relationship.kind === "before")).toBe(false)
    expect(result.warnings.some((warning) => warning.code === "missing-prerequisite")).toBe(true)
  })

  it("does not turn unrelated tasks into a hard dependency", () => {
    const items = [step("cat", "Feed the cat", 0), step("plants", "Water the plants", 1)]
    const result = proposeRelationships(items, "Feed the cat.\n\nWater the plants.")
    expect(result.relationships.filter((relationship) => relationship.kind === "before")).toEqual([])
    expect(result.relationships.filter((relationship) => relationship.kind === "order")).toEqual([])
    expect(result.relationships.filter((relationship) => relationship.kind === "requires")).toEqual([])
  })

  it("keeps one copy of a repeated link", () => {
    const upload = step("upload", "Upload the transcript", 0)
    const submit = step("submit", "Submit the form", 1)
    const text = "You must upload the transcript before you submit.\nYou must upload the transcript before you submit."
    const result = proposeRelationships([upload, submit], text)
    expect(result.relationships.filter((relationship) => relationship.kind === "before")).toHaveLength(1)
    expect(result.warnings.some((warning) => warning.code === "duplicate-link")).toBe(true)
  })

  it("refuses a dependency that would loop", () => {
    const write = step("write", "Write the draft", 0)
    const submit = step("submit", "Submit the form", 1)
    const text = "You must write the draft before you submit.\nYou must submit the form before you write."
    const result = proposeRelationships([write, submit], text)
    expect(result.relationships.filter((relationship) => relationship.kind === "before")).toHaveLength(1)
    expect(result.relationships[0]).toMatchObject({ fromId: "write", toId: "submit", basis: "stated", confidence: "high" })
    expect(result.warnings.some((warning) => warning.code === "cycle-prevented")).toBe(true)
  })

  it("treats a numbered list as suggested order and keeps a stated document link", () => {
    const read = step("read", "Read the prompt", 0, "1. Read the prompt")
    const gather = step("gather", "Gather your transcript", 1, "2. Gather your transcript")
    const transcript = createItem({
      id: "transcript",
      type: "requirement",
      title: "Official transcript",
      description: "Official transcript as a PDF",
      position: 2,
    })
    const result = proposeRelationships(
      [read, gather, transcript],
      "1. Read the prompt\n2. Gather your transcript",
      [{ fromTitle: "Gather your transcript", toTitle: "Official transcript" }],
    )
    const order = result.relationships.find((relationship) => relationship.kind === "order")
    expect(order).toMatchObject({ fromId: "read", toId: "gather", basis: "inferred", confidence: "low" })
    expect(order?.reason).toMatch(/not a rule/i)
    const needs = result.relationships.find((relationship) => relationship.kind === "requires")
    expect(needs).toMatchObject({ fromId: "gather", toId: "transcript", basis: "stated", confidence: "high" })
    expect(result.relationships.some((relationship) => relationship.kind === "before")).toBe(false)
  })

  it("drops a relationship whose card does not exist", () => {
    const read = step("read", "Read the prompt", 0)
    const dangling = {
      id: "rel-missing",
      fromId: "read",
      toId: "missing",
      kind: "connects" as const,
      reason: "The text links these cards.",
      basis: "stated" as const,
      confidence: "high" as const,
      reviewStatus: "pending" as const,
    }
    const result = validateRelationships([read], [dangling])
    expect(result.dropped).toBe(true)
    expect(result.relationships).toEqual([])
  })

  it("makes an accepted relationship navigable from both cards without turning order into a blocker", () => {
    const read = step("read", "Read the prompt", 0, "1. Read the prompt")
    const gather = step("gather", "Gather your transcript", 1, "2. Gather your transcript")
    const proposed = proposeRelationships([read, gather], "1. Read the prompt\n2. Gather your transcript")
    const accepted = proposed.relationships.map((relationship) => ({ ...relationship, reviewStatus: "accepted" as const }))
    const linked = applyRelationships([read, gather], accepted)
    expect(linked.find((item) => item.id === "read")?.linkedItemIds).toContain("gather")
    expect(linked.find((item) => item.id === "gather")?.linkedItemIds).toContain("read")
    expect(linked.every((item) => (item.blockedByIds ?? []).length === 0)).toBe(true)

    const reading = readMap(linked, accepted)
    expect(reading.startId).toBe("read")
    expect(reading.explanation).toMatch(/Start with “Read the prompt”/)
    expect(reading.edges.some((edge) => edge.role === "order")).toBe(true)
    expect(reading.edges.some((edge) => edge.role === "blocker")).toBe(false)
  })
})
