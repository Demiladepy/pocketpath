import { describe, expect, it } from "vitest"
import { parseInstructions } from "./parseInstructions.ts"
import { SAMPLE_SOURCE } from "./sample.ts"

const NOW = new Date(2026, 9, 17)

const APPLICATION_EMAIL = `Subject: Application due Friday

Please prepare your application before Friday at 5:00 p.m.

You must upload an official transcript as a PDF.
Each short answer must stay under 250 words.

1. Read the prompt and list every question.
2. Gather your transcript and writing sample.
3. Draft the short answers.
4. Ask someone to review the draft.
5. Submit the form and save the confirmation.

The application portal is https://example.edu/apply
You must upload the transcript before you submit.
`

describe("parseInstructions", () => {
  it("turns the sample brief into linked cards", () => {
    const result = parseInstructions(SAMPLE_SOURCE, NOW)
    const items = result.items
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
    expect(deadline?.dateCertainty).toBe("exact")
    const stated = result.relationships.find(
      (relationship) => relationship.basis === "stated" && relationship.fromId === goal?.id && relationship.toId === read?.id,
    )
    expect(stated?.kind).toBe("connects")
    expect(stated?.reason).toMatch(/text links/i)
    expect(goal?.linkedItemIds).toEqual([])
  })

  it("turns an ordinary application email into a reviewable path", () => {
    const result = parseInstructions(APPLICATION_EMAIL, NOW)
    expect(result.status).toBe("ready")
    expect(result.title).toBe("Application due Friday")

    const goal = result.items.find((item) => item.type === "goal")
    const steps = result.items.filter((item) => item.type === "step")
    const transcript = result.items.find((item) => item.title === "Official transcript")
    const deadline = result.items.find((item) => item.type === "deadline")
    const portal = result.items.find((item) => item.type === "resource")
    const submit = steps.find((item) => /submit/i.test(item.title))
    const gather = steps.find((item) => /transcript/i.test(item.title))

    expect(goal?.title).toBe("Prepare your application")
    expect(steps).toHaveLength(5)
    expect(result.items.filter((item) => item.type === "requirement")).toHaveLength(2)
    expect(deadline?.dueDate).toBe("2026-10-23")
    expect(deadline?.dateCertainty).toBe("resolved")
    expect(deadline?.dateLabel).toMatch(/Friday/i)
    expect(portal?.description).toBe("The application portal is https://example.edu/apply")
    const needs = result.relationships.find((relationship) => relationship.kind === "requires")
    expect(needs).toMatchObject({ fromId: gather?.id, toId: transcript?.id, basis: "inferred", confidence: "medium" })
    const blocker = result.relationships.find((relationship) => relationship.kind === "before")
    expect(blocker).toMatchObject({ fromId: transcript?.id, toId: submit?.id, basis: "stated", confidence: "high" })
    expect(result.relationships.filter((relationship) => relationship.kind === "order").length).toBeGreaterThan(0)
    expect(result.relationships.filter((relationship) => relationship.kind === "before")).toHaveLength(1)
    expect(gather?.linkedItemIds).toEqual([])
    expect(submit?.blockedByIds).toEqual([])
    expect(submit?.spokenInstruction).toMatch(/submit/i)
  })

  it("keeps imperative paragraphs as a goal and steps", () => {
    const result = parseInstructions("Finish the lab report.\n\nCollect the data.\n\nWrite the summary.", NOW)
    expect(result.items[0]?.type).toBe("goal")
    expect(result.items.filter((item) => item.type === "step")).toHaveLength(2)
    expect(result.relationships.some((relationship) => relationship.kind === "before")).toBe(false)
    expect(result.items.every((item) => item.linkedItemIds.length === 0)).toBe(true)
  })

  it("returns a failed result for empty or unusable text", () => {
    expect(parseInstructions("   \n", NOW)).toMatchObject({ status: "failed", items: [] })
    const gibberish = parseInstructions("asdf qwer zxcv blah", NOW)
    expect(gibberish.status).toBe("failed")
    expect(gibberish.items).toEqual([])
    expect(gibberish.notice).toMatch(/what to do/i)
  })

  it("does not treat a prose Note: line as a labeled brief", () => {
    const result = parseInstructions(
      `Summer internship announcement

Gather the official transcript.
Upload the statement of interest.
Submit the application by December 1, 2026.

Note: the form is due 05/06/2026 according to an older flyer.
`,
      NOW,
    )
    expect(result.items.filter((item) => item.type === "step").length).toBeGreaterThanOrEqual(2)
    expect(result.items.some((item) => item.type === "deadline" && item.dueDate === "2026-12-01")).toBe(true)
    expect(result.items.some((item) => item.type === "deadline" && item.description.includes("05/06/2026"))).toBe(true)
    expect(result.items.every((item) => item.type !== "note" || !/05\/06\/2026/.test(item.title))).toBe(true)
    expect(result.title.toLowerCase()).toContain("internship")
  })
})
