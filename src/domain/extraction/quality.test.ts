import { describe, expect, it } from "vitest"
import { parseInstructions } from "../parseInstructions.ts"
import { extractWithProvider } from "./provider.ts"
import { assessCards, assessRelationships, MAX_SOURCE_CHARS } from "./quality.ts"
import type { ExtractionProvider } from "./types.ts"
import type { PathItem, Relationship } from "../types.ts"

const NOW = new Date(2026, 9, 18, 12, 0, 0)

function card(partial: Pick<PathItem, "id" | "title" | "type"> & Partial<PathItem>): PathItem {
  return {
    description: partial.description ?? "",
    status: "not-started",
    position: 0,
    linkedItemIds: [],
    blockedByIds: [],
    origin: "extracted",
    sourceExcerpt: partial.sourceExcerpt ?? partial.title,
    basis: partial.basis ?? "stated",
    confidence: partial.confidence ?? "high",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...partial,
  }
}

function link(fromId: string, toId: string, kind: Relationship["kind"] = "before"): Relationship {
  return {
    id: `${kind}-${fromId}-${toId}`,
    fromId,
    toId,
    kind,
    reason: "Test link",
    basis: "stated",
    confidence: "high",
    reviewStatus: "pending",
  }
}

describe("extraction quality", () => {
  it("does not turn low-quality paragraphs into a ready path", () => {
    const source = [
      "This paragraph talks about the history of the lab and the people who worked there for many years.",
      "Another long paragraph describes the room and the weather without asking the student to do anything specific.",
      "A third paragraph continues the background and never names an action the student must take today.",
      "Submit the form.",
    ].join("\n\n")
    const assessed = assessCards({
      sourceText: source,
      title: "Follow these steps",
      items: [
        card({
          id: "history",
          type: "step",
          title: "This paragraph talks about the history of the lab and the people who worked there for many years.",
          sourceExcerpt: "This paragraph talks about the history of the lab and the people who worked there for many years.",
        }),
        card({
          id: "room",
          type: "step",
          title: "Another long paragraph describes the room and the weather without asking the student to do anything specific.",
          sourceExcerpt: "Another long paragraph describes the room and the weather without asking the student to do anything specific.",
        }),
        card({
          id: "background",
          type: "step",
          title: "A third paragraph continues the background and never names an action the student must take today.",
          sourceExcerpt: "A third paragraph continues the background and never names an action the student must take today.",
        }),
        card({ id: "submit", type: "step", title: "Submit the form", sourceExcerpt: "Submit the form." }),
      ],
      warnings: [],
    })
    expect(assessed.status).toBe("partial")
    expect(assessed.items.map((item) => item.id)).toEqual(["submit"])
    expect(assessed.warnings.some((warning) => warning.code === "generic-steps")).toBe(true)
    expect(assessed.warnings.some((warning) => warning.code === "no-goal")).toBe(true)
    expect(assessed.notice).toMatch(/not a checked reading/i)
  })

  it("keeps useful cards when a deadline cannot be resolved", () => {
    const source = "Submit the form.\n\nThe form is due sometime soon."
    const assessed = assessCards({
      sourceText: source,
      title: "Submit the form",
      items: [
        card({ id: "goal", type: "goal", title: "Submit the form", sourceExcerpt: "Submit the form." }),
        card({ id: "submit", type: "step", title: "Submit the form", sourceExcerpt: "Submit the form." }),
        card({
          id: "due",
          type: "deadline",
          title: "Due sometime soon",
          sourceExcerpt: "The form is due sometime soon.",
          dateLabel: "sometime soon",
          dateCertainty: "unresolved",
        }),
      ],
      warnings: [],
    })
    expect(assessed.status).toBe("partial")
    expect(assessed.items.map((item) => item.id)).toEqual(["goal", "submit", "due"])
    expect(assessed.items.find((item) => item.id === "due")?.dueDate).toBeUndefined()
    expect(assessed.warnings.some((warning) => warning.code === "unresolved-deadline")).toBe(true)
    expect(assessed.notice).toMatch(/review what was kept/i)
  })

  it("asks for text when the input is empty and does not invent cards", () => {
    const result = parseInstructions("   \n", NOW)
    expect(result.status).toBe("failed")
    expect(result.items).toEqual([])
    expect(result.error?.code).toBe("empty")
    expect(result.notice).toMatch(/paste/i)
  })

  it("leaves out a broken connection and a circular dependency", () => {
    const read = card({ id: "read", type: "step", title: "Read the prompt", sourceExcerpt: "Read the prompt." })
    const submit = card({ id: "submit", type: "step", title: "Submit the form", sourceExcerpt: "Submit the form." })
    const checked = assessRelationships(
      [read, submit],
      [link("read", "submit"), link("submit", "read"), link("read", "missing"), link("read", "read", "connects")],
      [],
    )
    expect(checked.changed).toBe(true)
    expect(checked.relationships.map((relationship) => relationship.id)).toEqual(["before-read-submit"])
    expect(checked.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["circular-dependency", "malformed-link"]),
    )
  })

  it("preserves the source when a provider throws", () => {
    const source = "Finish the lab report.\n\nCollect the data."
    const provider: ExtractionProvider = {
      id: "broken",
      extract() {
        throw new Error("simulated provider failure")
      },
    }
    const draft = extractWithProvider({ text: source, now: NOW }, provider)
    expect(draft.status).toBe("failed")
    expect(draft.items).toEqual([])
    expect(draft.error?.code).toBe("provider")
    expect(draft.sourceText).toBe(source)
    expect(draft.notice).toMatch(/still in the box/i)
    expect(draft.notice).not.toMatch(/simulated provider failure/)
  })

  it("does not treat a valid-looking draft as accurate when the cards are not in the source", () => {
    const provider: ExtractionProvider = {
      id: "invented",
      extract() {
        return {
          title: "Looks complete",
          items: [
            {
              id: "draft-invented",
              type: "step",
              title: "Submit the invented form",
              description: "This was not written by the user.",
              sourceExcerpt: "Submit the invented form by tomorrow.",
              confidence: "high",
              basis: "stated",
              reviewStatus: "pending",
              blockedByIds: [],
              warnings: [],
            },
          ],
          warnings: [],
          error: null,
          status: "ready",
          notice: "Ready",
          sourceLines: [],
          sourceText: "Hello there.",
        }
      },
    }
    const draft = extractWithProvider({ text: "Hello there.", now: NOW }, provider)
    expect(draft.status).not.toBe("ready")
    expect(draft.items).toEqual([])
    expect(draft.warnings.some((warning) => warning.code === "insufficient-evidence")).toBe(true)
    expect(draft.notice).not.toMatch(/^Ready$/)
    expect(draft.notice).toMatch(/what to do|not a checked reading|still in the box/i)
  })

  it("refuses a source that is too long or not plain text", () => {
    const tooLong = parseInstructions(`${"Write the summary. ".repeat(MAX_SOURCE_CHARS)}`, NOW)
    expect(tooLong.status).toBe("unsupported")
    expect(tooLong.items).toEqual([])
    expect(tooLong.error?.code).toBe("too-long")
    expect(tooLong.notice).toMatch(/too long/i)

    const binary = parseInstructions(`%PDF-1.7 ${"x".repeat(80)}`, NOW)
    expect(binary.status).toBe("unsupported")
    expect(binary.items).toEqual([])
    expect(binary.notice).toMatch(/plain instructions/i)
  })

  it("drops an empty card and a duplicate without inventing a date", () => {
    const source = "Submit the form."
    const assessed = assessCards({
      sourceText: source,
      title: "Submit the form",
      items: [
        card({ id: "goal", type: "goal", title: "Submit the form", sourceExcerpt: "Submit the form." }),
        card({ id: "first", type: "step", title: "Submit the form", description: "Short.", sourceExcerpt: "Submit the form." }),
        card({
          id: "second",
          type: "step",
          title: "Submit the form",
          description: "Submit the form and keep the receipt.",
          sourceExcerpt: "Submit the form.",
        }),
        card({ id: "blank", type: "note", title: " ", description: " ", sourceExcerpt: " " }),
      ],
      warnings: [],
    })
    expect(assessed.items.map((item) => item.id)).toEqual(["goal", "second"])
    expect(assessed.status).toBe("partial")
    expect(assessed.warnings.some((warning) => warning.code === "duplicate-card")).toBe(true)
    expect(assessed.warnings.some((warning) => warning.code === "empty-card")).toBe(true)
    expect(assessed.items.every((item) => item.dueDate === undefined)).toBe(true)
  })
})
