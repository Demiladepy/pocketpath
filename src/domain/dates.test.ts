import { describe, expect, it } from "vitest"
import { findDate, normalizeDeadline } from "./dates.ts"

const SATURDAY = new Date(2026, 9, 17)
const FRIDAY = new Date(2026, 9, 23)
const REFERENCE = "2026-10-17"

describe("normalizeDeadline", () => {
  it("keeps a fully written date and does not invent a time zone", () => {
    expect(normalizeDeadline({ text: "October 23, 2026", referenceDate: REFERENCE })).toMatchObject({
      dueDate: "2026-10-23",
      dateLabel: "October 23, 2026",
      certainty: "exact",
      basis: "stated",
      timeZone: "unspecified",
    })
    expect(normalizeDeadline({ text: "23 October 2026", referenceDate: REFERENCE })?.dueDate).toBe("2026-10-23")
  })

  it("reads an unambiguous numeric date and refuses an ambiguous one", () => {
    expect(normalizeDeadline({ text: "23/10/2026", referenceDate: REFERENCE })).toMatchObject({
      dueDate: "2026-10-23",
      certainty: "exact",
    })
    expect(normalizeDeadline({ text: "10/23/2026", referenceDate: REFERENCE })?.dueDate).toBe("2026-10-23")
    const ambiguous = normalizeDeadline({ text: "due 05/06/2026", referenceDate: REFERENCE })
    expect(ambiguous?.dueDate).toBeUndefined()
    expect(ambiguous?.ambiguous).toBe(true)
    expect(ambiguous?.certainty).toBe("unresolved")
    expect(ambiguous?.deadlineReview).toMatch(/2026-06-05/)
    expect(ambiguous?.deadlineReview).toMatch(/2026-05-06/)
  })

  it("resolves weekdays and relative phrases only from the injected reference date", () => {
    expect(findDate("before Friday at 5:00 p.m.", SATURDAY)).toMatchObject({
      dueDate: "2026-10-23",
      dueTime: "17:00",
      certainty: "resolved",
      basis: "inferred",
      dateLabel: "Friday at 5:00 p.m.",
    })
    expect(findDate("tomorrow", SATURDAY)?.dueDate).toBe("2026-10-18")
    expect(findDate("next Friday", FRIDAY)?.dueDate).toBe("2026-10-30")
    expect(findDate("Friday", FRIDAY)?.dueDate).toBe("2026-10-23")
    expect(normalizeDeadline({ text: "next Monday", referenceDate: REFERENCE })?.dueDate).toBe("2026-10-19")
    expect(normalizeDeadline({ text: "in three days", referenceDate: REFERENCE })).toMatchObject({
      dueDate: "2026-10-20",
      certainty: "resolved",
      basis: "inferred",
    })
    expect(normalizeDeadline({ text: "by the end of the month", referenceDate: REFERENCE })?.dueDate).toBe("2026-10-31")
  })

  it("does not treat a missing reference as today", () => {
    const tomorrow = normalizeDeadline({ text: "tomorrow" })
    expect(tomorrow?.dueDate).toBeUndefined()
    expect(tomorrow?.certainty).toBe("unresolved")
    expect(tomorrow?.dateLabel).toBe("tomorrow")
    expect(normalizeDeadline({ text: "October 23" })?.dueDate).toBeUndefined()
  })

  it("keeps next week as a range and records time phrases", () => {
    expect(normalizeDeadline({ text: "next week", referenceDate: REFERENCE })).toMatchObject({
      dateLabel: "next week",
      rangeStart: "2026-10-19",
      rangeEnd: "2026-10-25",
      certainty: "approximate",
    })
    expect(normalizeDeadline({ text: "next week", referenceDate: REFERENCE })?.dueDate).toBeUndefined()
    expect(normalizeDeadline({ text: "by 5 p.m.", referenceDate: REFERENCE })).toMatchObject({
      dueTime: "17:00",
      certainty: "unresolved",
    })
    expect(normalizeDeadline({ text: "Friday before midnight", referenceDate: REFERENCE })).toMatchObject({
      dueDate: "2026-10-23",
      dueTime: "23:59",
    })
    expect(normalizeDeadline({ text: "Friday at noon ET", referenceDate: REFERENCE })).toMatchObject({
      dueTime: "12:00",
      timeZone: "ET",
    })
  })

  it("keeps a date range, a repeating weekday, and a past date", () => {
    expect(normalizeDeadline({ text: "October 20-23, 2026", referenceDate: REFERENCE })).toMatchObject({
      rangeStart: "2026-10-20",
      rangeEnd: "2026-10-23",
      certainty: "exact",
    })
    expect(normalizeDeadline({ text: "every Friday", referenceDate: REFERENCE })).toMatchObject({
      recurrence: "weekly:friday",
      dueDate: "2026-10-23",
      certainty: "resolved",
    })
    const past = normalizeDeadline({ text: "October 1, 2026", referenceDate: REFERENCE })
    expect(past?.dueDate).toBe("2026-10-01")
    expect(past?.past).toBe(true)
    expect(past?.deadlineReview).toMatch(/kept for review/i)
  })

  it("flags daylight-saving gaps and overlaps in the injected time zone", () => {
    const gap = normalizeDeadline({
      text: "March 8, 2026 at 2:30 a.m.",
      referenceDate: "2026-03-01",
      timeZone: "America/New_York",
    })
    expect(gap?.dueDate).toBe("2026-03-08")
    expect(gap?.dueTime).toBe("02:30")
    expect(gap?.deadlineReview).toMatch(/clocks move forward/i)

    const overlap = normalizeDeadline({
      text: "November 1, 2026 at 1:30 a.m.",
      referenceDate: "2026-11-01",
      timeZone: "America/New_York",
    })
    expect(overlap?.dueDate).toBe("2026-11-01")
    expect(overlap?.dueTime).toBe("01:30")
    expect(overlap?.deadlineReview).toMatch(/clocks move back/i)
  })
})
