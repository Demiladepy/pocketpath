import { describe, expect, it } from "vitest"
import { deterministicProvider, extractWithProvider } from "./provider.ts"
import type { ExtractionProvider } from "./types.ts"

const NOW = new Date(2026, 9, 17)

const MESSY_EMAIL = `From: advisor@example.edu
To: student@example.edu
Date: Sat, 17 Oct 2026
Subject: Re: your application!!

hi there,

pls do this before next Friday:
* upload the transcript
* upload the transcript as a PDF
* write the 250 word answer

the portal is https://example.edu/apply
questions: advisor@example.edu

thanks
--
Prof. Lee
Office hours
`

const ASSIGNMENT = `Biology lab report

Write a lab report on the enzyme experiment.

The report must include:
- A methods section
- Your data table
- A short conclusion under 300 words

Submit it by October 30, 2026.
The rubric is at https://example.edu/rubric
Email questions to lab@example.edu
`

describe("ordinary text extraction", () => {
  it("turns a messy email into a draft without saving it", () => {
    const draft = deterministicProvider.extract({ text: MESSY_EMAIL, now: NOW })
    expect(draft.error).toBeNull()
    expect(draft.status).toBe("ready")
    expect(draft.title).toMatch(/application/i)
    expect(draft.items.every((item) => item.reviewStatus === "pending")).toBe(true)
    expect(draft.items.every((item) => item.id.startsWith("draft-"))).toBe(true)

    const upload = draft.items.filter((item) => /transcript/i.test(item.title) && item.type === "step")
    expect(upload).toHaveLength(1)
    expect(upload[0]?.description).toMatch(/PDF/)
    expect(upload[0]?.sourceExcerpt).toMatch(/upload the transcript/i)
    expect(draft.warnings.some((warning) => warning.code === "merged-duplicate")).toBe(true)

    const deadline = draft.items.find((item) => item.type === "deadline")
    expect(deadline?.dueDate).toBe("2026-10-23")
    expect(deadline?.basis).toBe("inferred")
    expect(deadline?.dateLabel).toMatch(/Friday/i)

    expect(draft.items.some((item) => item.type === "resource" && item.description.includes("https://example.edu/apply"))).toBe(true)
    expect(draft.items.some((item) => item.type === "person" && item.title === "advisor@example.edu")).toBe(true)
    expect(draft.items.some((item) => /office hours/i.test(item.title))).toBe(false)
  })

  it("turns an assignment brief into a goal, steps, requirements, a date, and a link", () => {
    const draft = deterministicProvider.extract({ text: ASSIGNMENT, now: NOW })
    expect(draft.title).toBe("Biology lab report")
    expect(draft.items.filter((item) => item.type === "step").map((item) => item.title)).toEqual(
      expect.arrayContaining([expect.stringMatching(/lab report/i)]),
    )
    expect(draft.items.some((item) => item.type === "step" && /submit/i.test(item.title))).toBe(false)
    const requirements = draft.items.filter((item) => item.type === "requirement")
    expect(requirements.map((item) => item.title).join(" ")).toMatch(/methods/i)
    expect(requirements.map((item) => item.title).join(" ")).toMatch(/data table/i)
    expect(requirements.map((item) => item.title).join(" ")).toMatch(/300 words/i)
    const deadline = draft.items.find((item) => item.type === "deadline")
    expect(deadline).toMatchObject({ dueDate: "2026-10-30", dateCertainty: "exact", basis: "stated", confidence: "high" })
    expect(deadline?.description).toMatch(/submit/i)
    expect(draft.items.some((item) => item.type === "resource" && item.sourceExcerpt.includes("https://example.edu/rubric"))).toBe(true)
    expect(draft.items.some((item) => item.type === "person" && item.title === "lab@example.edu")).toBe(true)
  })

  it("does not duplicate a submit-by line as both a deadline and a step", () => {
    const draft = deterministicProvider.extract({
      text: `Biology lab report

Complete the lab report.

1. Read the prompt.
2. Write the results.
3. Submit the report through the portal.

Submit the report by November 6, 2026.
`,
      now: NOW,
    })
    expect(draft.items.filter((item) => item.type === "deadline")).toHaveLength(1)
    expect(draft.items.find((item) => item.type === "deadline")?.dueDate).toBe("2026-11-06")
    expect(draft.items.filter((item) => item.type === "step").map((item) => item.title)).toEqual([
      "Read the prompt",
      "Write the results",
      "Submit the report through the portal",
    ])
  })

  it("does not turn an is-due sentence into a second step", () => {
    const draft = deterministicProvider.extract({
      text: `Finish the lab write-up.

Collect the readings.
Write the discussion.

The draft is due before Friday at 5:00 p.m.
`,
      now: NOW,
    })
    expect(draft.items.filter((item) => item.type === "deadline")).toHaveLength(1)
    expect(draft.items.find((item) => item.type === "deadline")?.dueDate).toBe("2026-10-23")
    expect(draft.items.some((item) => item.type === "step" && /\bis due\b/i.test(item.title))).toBe(false)
    expect(draft.items.filter((item) => item.type === "step").map((item) => item.title)).toEqual([
      "Collect the readings",
      "Write the discussion",
    ])
  })

  it("keeps a document list as requirements and does not invent steps", () => {
    const draft = deterministicProvider.extract({
      text: `Required documents
- Official transcript
- Writing sample
- Letter of recommendation
`,
      now: NOW,
    })
    expect(draft.items.filter((item) => item.type === "step")).toHaveLength(0)
    expect(draft.items.filter((item) => item.type === "requirement")).toHaveLength(3)
    expect(draft.items.every((item) => item.basis === "stated")).toBe(true)
    expect(draft.status).not.toBe("ready")
    expect(draft.notice).toMatch(/no goal or step|no clear steps/i)
  })

  it("does not invent a deadline when none is stated", () => {
    const draft = deterministicProvider.extract({
      text: "Write the reflection essay.\n\nInclude your class notes.",
      now: NOW,
    })
    expect(draft.items.some((item) => item.type === "deadline" || item.dueDate)).toBe(false)
    expect(draft.warnings.some((warning) => warning.code === "missing-deadline")).toBe(true)
    expect(draft.warnings.find((warning) => warning.code === "missing-deadline")?.message).toMatch(/none was added/i)
  })

  it("keeps contradictory dates and asks which one applies", () => {
    const draft = deterministicProvider.extract({
      text: `Submit the form by Friday.
Also, the form is due October 30, 2026.
1. Fill out the form.
`,
      now: NOW,
    })
    const deadlines = draft.items.filter((item) => item.type === "deadline")
    expect(deadlines.map((item) => item.dueDate).sort()).toEqual(["2026-10-23", "2026-10-30"])
    expect(draft.warnings.some((warning) => warning.code === "conflicting-dates")).toBe(true)
    expect(draft.items.some((item) => item.type === "step" && /fill/i.test(item.title))).toBe(true)
  })

  it("asks for text when the input is empty", () => {
    const draft = deterministicProvider.extract({ text: "   \n", now: NOW })
    expect(draft.items).toEqual([])
    expect(draft.error?.code).toBe("empty")
    expect(draft.error?.clarification).toMatch(/paste/i)
  })

  it("merges duplicate instructions and keeps the extra detail", () => {
    const draft = deterministicProvider.extract({
      text: "Upload the transcript.\n\nPlease upload the transcript as a PDF.",
      now: NOW,
    })
    const uploads = draft.items.filter((item) => item.type === "step" && /transcript/i.test(item.title))
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.description).toMatch(/PDF/)
    expect(uploads[0]?.sourceExcerpt).toMatch(/Upload the transcript/)
    expect(draft.warnings.some((warning) => warning.code === "merged-duplicate")).toBe(true)
  })

  it("asks what to do when the text has no actions", () => {
    const draft = deterministicProvider.extract({
      text: "I hope you are well. The campus looks nice this week.",
      now: NOW,
    })
    expect(draft.items).toEqual([])
    expect(draft.error?.code).toBe("no-action")
    expect(draft.error?.clarification).toMatch(/what to do/i)
    expect(draft.items.some((item) => item.type === "step")).toBe(false)
  })

  it("uses a provider interface without calling a network", () => {
    const seen: string[] = []
    const provider: ExtractionProvider = {
      id: "test-double",
      extract(input) {
        seen.push(input.text)
        return deterministicProvider.extract(input)
      },
    }
    const draft = extractWithProvider({ text: "Finish the lab report.\n\nCollect the data.", now: NOW }, provider)
    expect(seen).toEqual(["Finish the lab report.\n\nCollect the data."])
    expect(draft.items.some((item) => item.type === "goal")).toBe(true)
    expect(deterministicProvider.id).toBe("deterministic")
  })
})
