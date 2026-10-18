import { describe, expect, it } from "vitest"
import { createItem } from "./items.ts"
import { commitReview } from "./reviewCommit.ts"
import type { PathItem } from "./types.ts"

function accepted(partial: Partial<PathItem> & { title: string }): PathItem {
  return {
    ...createItem(partial),
    reviewStatus: "accepted",
    reviewAccepted: true,
  }
}

describe("commitReview", () => {
  it("does not save a rejected item", () => {
    const kept = accepted({ id: "keep", title: "Keep this step", type: "step", sourceExcerpt: "Keep this step." })
    const rejected = {
      ...createItem({ id: "drop", title: "Drop this step", type: "step", sourceExcerpt: "Drop this step." }),
      reviewStatus: "rejected" as const,
    }
    const result = commitReview({ existing: [], draft: [kept, rejected], relationships: [] })
    expect(result.items.map((item) => item.title)).toEqual(["Keep this step"])
  })

  it("saves edits made during review", () => {
    const existing = createItem({
      id: "collect",
      title: "Collect the data",
      type: "step",
      origin: "extracted",
      sourceExcerpt: "Collect the data.",
    })
    const edited = accepted({
      id: "draft-collect",
      title: "Collect the data carefully",
      description: "Include the table.",
      type: "step",
      origin: "extracted",
      sourceExcerpt: "Collect the data.",
      userEdited: true,
    })
    const result = commitReview({ existing: [existing], draft: [edited], relationships: [] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: "collect",
      title: "Collect the data carefully",
      description: "Include the table.",
      userEdited: true,
    })
  })

  it("does not add the same card when the draft is committed twice", () => {
    const draft = [
      accepted({ id: "goal", title: "Finish the lab report", type: "goal", sourceExcerpt: "Finish the lab report." }),
      accepted({ id: "write", title: "Write the summary", type: "step", sourceExcerpt: "Write the summary." }),
    ]
    const first = commitReview({ existing: [], draft, relationships: [] })
    const second = commitReview({
      existing: first.items,
      existingRelationships: first.relationships,
      draft,
      relationships: [],
    })
    expect(first.added).toBe(2)
    expect(second.added).toBe(0)
    expect(second.items).toHaveLength(2)
    expect(second.items.map((item) => item.title)).toEqual(["Finish the lab report", "Write the summary"])
  })

  it("leaves a card the user already edited unchanged", () => {
    const existing = createItem({
      id: "goal",
      title: "My goal wording",
      type: "goal",
      origin: "extracted",
      userEdited: true,
      sourceExcerpt: "Finish the lab report.",
    })
    const draft = accepted({
      id: "other",
      title: "Finish the lab report",
      type: "goal",
      origin: "extracted",
      sourceExcerpt: "Finish the lab report.",
    })
    const result = commitReview({ existing: [existing], draft: [draft], relationships: [] })
    expect(result.added).toBe(0)
    expect(result.items.map((item) => item.title)).toEqual(["My goal wording"])
  })

  it("adds a deadline that shares a sentence with an existing step, once", () => {
    const existing = createItem({
      id: "submit",
      title: "Submit the form by Friday",
      type: "requirement",
      origin: "extracted",
      userEdited: true,
      sourceExcerpt: "Submit the form by Friday.",
    })
    const deadline = accepted({
      id: "draft-date",
      title: "Due Friday",
      type: "deadline",
      origin: "extracted",
      sourceExcerpt: "Submit the form by Friday.",
    })
    const first = commitReview({ existing: [existing], draft: [deadline], relationships: [] })
    const second = commitReview({ existing: first.items, draft: [deadline], relationships: [] })
    expect(first.added).toBe(1)
    expect(first.items.map((item) => item.title)).toEqual(["Submit the form by Friday", "Due Friday"])
    expect(second.added).toBe(0)
    expect(second.items).toHaveLength(2)
  })
})
