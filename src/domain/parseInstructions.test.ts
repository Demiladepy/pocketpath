import { describe, expect, it } from "vitest"
import { parseInstructions } from "./parseInstructions.ts"
import { SAMPLE_SOURCE } from "./sample.ts"

describe("parseInstructions", () => {
  it("turns the sample brief into linked cards", () => {
    const items = parseInstructions(SAMPLE_SOURCE)
    expect(items.filter((item) => item.type === "goal")).toHaveLength(1)
    expect(items.filter((item) => item.type === "step")).toHaveLength(5)
    expect(items.filter((item) => item.type === "requirement")).toHaveLength(2)
    expect(items.filter((item) => item.type === "deadline")).toHaveLength(1)
    expect(items.filter((item) => item.type === "resource")).toHaveLength(1)

    const goal = items.find((item) => item.type === "goal")
    const read = items.find((item) => item.title === "Read the prompt")
    const deadline = items.find((item) => item.type === "deadline")
    expect(goal?.title).toBe("Prepare an application before Friday")
    expect(deadline?.dueDate).toBe("2026-10-23")
    expect(deadline?.title).toBe("Application closes at 5:00 p.m.")
    expect(goal && read && goal.linkedItemIds).toContain(read?.id)
    expect(read?.linkedItemIds).toContain(goal?.id)
  })

  it("splits unlabeled paragraphs into an editable goal and steps", () => {
    const items = parseInstructions("Finish the lab report.\n\nCollect the data.\n\nWrite the summary.")
    expect(items[0]?.type).toBe("goal")
    expect(items.filter((item) => item.type === "step")).toHaveLength(2)
    expect(items[1]?.linkedItemIds).toContain(items[0]?.id)
    expect(items[0]?.linkedItemIds).toContain(items[1]?.id)
  })

  it("returns nothing for empty text", () => {
    expect(parseInstructions("   \n")).toEqual([])
  })
})
