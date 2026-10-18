import { describe, expect, it } from "vitest"
import { createItem } from "./items.ts"
import { stageExtraction } from "./mergeExtraction.ts"

describe("stageExtraction", () => {
  it("does not replace an edited card or a completed card", () => {
    const edited = createItem({
      id: "edited",
      title: "My title",
      type: "step",
      origin: "extracted",
      userEdited: true,
      sourceExcerpt: "Read the prompt.",
    })
    const completed = createItem({
      id: "done",
      title: "Gather documents",
      type: "step",
      origin: "extracted",
      status: "completed",
      sourceExcerpt: "Gather documents.",
    })
    const proposedEdited = createItem({
      title: "Read the prompt",
      type: "step",
      origin: "extracted",
      sourceExcerpt: "Read the prompt.",
    })
    const proposedDone = createItem({
      title: "Gather documents",
      type: "step",
      origin: "extracted",
      sourceExcerpt: "Gather documents.",
    })
    const proposedNew = createItem({
      title: "Ask for a review",
      type: "step",
      origin: "extracted",
      sourceExcerpt: "Ask for a review.",
    })

    const staged = stageExtraction([edited, completed], [proposedEdited, proposedDone, proposedNew])
    expect(staged.updates).toEqual([])
    expect(staged.additions.map((item) => item.title)).toEqual(["Ask for a review"])
  })

  it("keeps a deadline separate when it shares a sentence with an existing step", () => {
    const existing = createItem({
      id: "submit",
      title: "Submit the form by Friday",
      type: "requirement",
      origin: "extracted",
      userEdited: true,
      sourceExcerpt: "Submit the form by Friday.",
    })
    const step = createItem({
      id: "draft-step",
      title: "Submit the form by Friday",
      type: "step",
      origin: "extracted",
      sourceExcerpt: "Submit the form by Friday.",
    })
    const deadline = createItem({
      id: "draft-date",
      title: "Due Friday",
      type: "deadline",
      origin: "extracted",
      sourceExcerpt: "Submit the form by Friday.",
    })
    const staged = stageExtraction([existing], [deadline, step])
    expect(staged.updates).toEqual([])
    expect(staged.additions.map((item) => item.title)).toEqual(["Due Friday"])
  })

  it("does not offer a card again after a link was saved", () => {
    const existing = createItem({
      id: "friday",
      title: "Due Friday",
      type: "deadline",
      origin: "extracted",
      dueDate: "2026-10-23",
      dateLabel: "Friday",
      sourceExcerpt: "Submit the form by Friday.",
      linkedItemIds: ["submit"],
    })
    const proposed = createItem({
      id: "draft-date",
      title: "Due Friday",
      type: "deadline",
      origin: "extracted",
      dueDate: "2026-10-23",
      dateLabel: "Friday",
      sourceExcerpt: "Submit the form by Friday.",
    })
    const staged = stageExtraction([existing], [proposed])
    expect(staged.additions).toEqual([])
    expect(staged.updates).toEqual([])
  })
})
