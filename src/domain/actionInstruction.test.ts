import { describe, expect, it } from "vitest"
import { actionInstructionFor, suggestActionInstruction } from "./actionInstruction.ts"
import { createItem } from "./items.ts"
import { validateItem } from "./validate.ts"

describe("action instruction", () => {
  it("builds a suggestion from an imperative title", () => {
    expect(suggestActionInstruction({ title: "Submit the form", description: "" })).toBe("Submit the form.")
  })

  it("uses an imperative description when the title is a noun", () => {
    expect(
      suggestActionInstruction({
        title: "Form",
        description: "Send the form to the office. Keep a copy.",
      }),
    ).toBe("Send the form to the office.")
  })

  it("labels a generated instruction differently from text the user wrote", () => {
    const generated = createItem({ title: "Lab report", description: "The report covers the experiment." })
    const suggestion = actionInstructionFor(generated)
    expect(suggestion.authored).toBe(false)
    expect(suggestion.text).toBe("Work on Lab report.")
    expect(generated.actionInstruction).toBeUndefined()

    const written = createItem({
      title: "Lab report",
      description: "The report covers the experiment.",
      actionInstruction: "send it",
    })
    expect(actionInstructionFor(written)).toEqual({ text: "send it", authored: true })
  })

  it("keeps a saved instruction when the path is loaded again", () => {
    const item = createItem({
      title: "Submit the form",
      priority: "high",
      actionInstruction: "Send the form today.",
    })
    const loaded = validateItem({ ...item })
    expect(loaded?.priority).toBe("high")
    expect(loaded?.actionInstruction).toBe("Send the form today.")
  })
})
