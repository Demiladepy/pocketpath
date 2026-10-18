import type { DateCertainty } from "./types.ts"

export interface DeadlineContext {
  referenceDate?: string
  referenceTime?: string
  timeZone?: string
}

export interface ParsedDate {
  dueDate?: string
  dueTime?: string
  dateLabel: string
  certainty: DateCertainty
  basis: "stated" | "inferred"
  timeZone: string
  deadlineReview?: string
  rangeStart?: string
  rangeEnd?: string
  recurrence?: string
  ambiguous?: boolean
  past?: boolean
}

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4,
  june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const MONTH_PATTERN =
  "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)"
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

export function formatISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function findDate(text: string, now?: Date, timeZone?: string): ParsedDate | null {
  return normalizeDeadline({
    text,
    referenceDate: now ? formatISODate(now) : undefined,
    timeZone,
  })
}

export function normalizeDeadline(input: DeadlineContext & { text: string }): ParsedDate | null {
  const source = input.text.trim()
  if (!source) return null
  const referenceDate = input.referenceDate
  const sourceZone = sourceTimeZone(source)
  const time = extractTime(source)
  const recurrence = extractRecurrence(source, referenceDate)
  if (recurrence) return finish(source, recurrence, time, sourceZone, input)

  const range = extractRange(source, referenceDate)
  if (range) return finish(source, range, time, sourceZone, input)

  const single = extractSingle(source, referenceDate)
  if (single) return finish(source, single, time, sourceZone, input)

  if (time) {
    return finish(source, {
      dateLabel: time.label,
      certainty: "unresolved",
      basis: "stated",
      deadlineReview: "A time was written, but no date. No day was assumed.",
    }, time, sourceZone, input)
  }
  return null
}

function finish(
  source: string,
  found: Omit<ParsedDate, "timeZone" | "dueTime" | "basis"> & { basis?: ParsedDate["basis"] },
  time: { value?: string; label: string; review?: string } | null,
  sourceZone: string | null,
  input: DeadlineContext,
): ParsedDate {
  const result: ParsedDate = {
    dateLabel: time && !found.dateLabel.toLowerCase().includes(time.label.toLowerCase())
      ? `${found.dateLabel} ${time.label}`.trim()
      : found.dateLabel,
    certainty: found.certainty,
    basis: found.basis ?? (found.certainty === "exact" ? "stated" : "inferred"),
    timeZone: sourceZone ?? "unspecified",
  }
  if (found.dueDate) result.dueDate = found.dueDate
  if (time?.value) result.dueTime = time.value
  if (found.rangeStart) result.rangeStart = found.rangeStart
  if (found.rangeEnd) result.rangeEnd = found.rangeEnd
  if (found.recurrence) result.recurrence = found.recurrence
  if (found.ambiguous) result.ambiguous = true
  const notes = [found.deadlineReview, time?.review].filter(Boolean)
  if (input.referenceDate && result.dueDate && result.dueDate < input.referenceDate) {
    result.past = true
    notes.push("This is before the reference date. It was kept for review.")
  }
  if (input.timeZone && result.dueDate && result.dueTime) {
    const wall = wallTimeStatus(result.dueDate, result.dueTime, input.timeZone)
    if (wall === "gap") {
      notes.push(`The time ${result.dueTime} does not occur on ${result.dueDate} in ${input.timeZone} because clocks move forward.`)
    }
    if (wall === "overlap") {
      notes.push(`The time ${result.dueTime} occurs twice on ${result.dueDate} in ${input.timeZone} because clocks move back.`)
    }
  }
  if (notes.length > 0) result.deadlineReview = notes.join(" ")
  if (!source.toLowerCase().includes(result.dateLabel.toLowerCase()) && found.dateLabel) {
    result.dateLabel = found.dateLabel
  }
  return result
}

function extractSingle(source: string, referenceDate: string | undefined): Omit<ParsedDate, "timeZone"> | null {
  const iso = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const date = isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    if (!date) return null
    return { dueDate: date, dateLabel: iso[0], certainty: "exact", basis: "stated" }
  }

  const named = matchNamedDate(source)
  if (named) return namedDate(named, referenceDate)

  const numeric = source.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/)
  if (numeric && !iso) return numericDate(numeric)

  const inDays = source.match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/i)
  if (inDays) {
    const count = Number(inDays[1]) || NUMBER_WORDS[inDays[1].toLowerCase()] || 0
    const label = inDays[0]
    if (!referenceDate || count < 1) {
      return { dateLabel: label, certainty: "unresolved", basis: "stated", deadlineReview: "This relative date needs a reference date." }
    }
    return { dueDate: addDays(referenceDate, count), dateLabel: label, certainty: "resolved", basis: "inferred" }
  }

  if (/\btomorrow\b/i.test(source)) return relativeDay(referenceDate, 1, "tomorrow")
  if (/\btoday\b/i.test(source)) return relativeDay(referenceDate, 0, "today")
  if (/\byesterday\b/i.test(source)) return relativeDay(referenceDate, -1, "yesterday")

  const weekday = source.match(/\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (weekday) {
    const label = weekday[0]
    if (!referenceDate) {
      return { dateLabel: label, certainty: "unresolved", basis: "stated", deadlineReview: "This weekday needs a reference date." }
    }
    const index = WEEKDAYS.indexOf(weekday[2].toLowerCase())
    return {
      dueDate: nextWeekday(referenceDate, index, weekday[1]?.toLowerCase() === "next"),
      dateLabel: label,
      certainty: "resolved",
      basis: "inferred",
    }
  }

  if (/\b(?:by\s+)?(?:the\s+)?end of the month\b/i.test(source)) {
    const label = source.match(/\b(?:by\s+)?(?:the\s+)?end of the month\b/i)?.[0] ?? "end of the month"
    if (!referenceDate) {
      return { dateLabel: label, certainty: "unresolved", basis: "stated", deadlineReview: "The end of the month needs a reference date." }
    }
    return { dueDate: endOfMonth(referenceDate), dateLabel: label, certainty: "resolved", basis: "inferred" }
  }

  if (/\bnext week\b/i.test(source)) {
    if (!referenceDate) {
      return { dateLabel: "next week", certainty: "unresolved", basis: "stated", deadlineReview: "Next week needs a reference date." }
    }
    const start = nextWeekday(referenceDate, 1, true)
    return {
      dateLabel: "next week",
      rangeStart: start,
      rangeEnd: addDays(start, 6),
      certainty: "approximate",
      basis: "inferred",
      deadlineReview: "Next week is a range, so no single day was chosen.",
    }
  }

  if (/\bsoon\b/i.test(source)) {
    return { dateLabel: "soon", certainty: "approximate", basis: "stated", deadlineReview: "Soon is not a calendar date." }
  }

  return null
}

function extractRange(source: string, referenceDate: string | undefined): Omit<ParsedDate, "timeZone"> | null {
  const span = source.match(new RegExp(`\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to)\\s*(?:${MONTH_PATTERN}\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s*(\\d{4})\\b`, "i"))
  if (span) {
    const monthA = MONTHS[span[1].toLowerCase()]
    const monthB = span[3] ? MONTHS[span[3].toLowerCase()] : monthA
    const year = Number(span[5])
    const start = isoFromParts(year, monthA + 1, Number(span[2]))
    const end = isoFromParts(year, monthB + 1, Number(span[4]))
    if (start && end) {
      return {
        dueDate: start,
        rangeStart: start,
        rangeEnd: end,
        dateLabel: span[0],
        certainty: "exact",
        basis: "stated",
      }
    }
  }

  const between = source.match(/\b(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+?)(?:[.!]|$)/i)
  if (!between) return null
  const start = extractSingle(between[1], referenceDate)
  const end = extractSingle(between[2], referenceDate)
  if (!start?.dueDate || !end?.dueDate) return null
  return {
    dueDate: start.dueDate,
    rangeStart: start.dueDate,
    rangeEnd: end.dueDate,
    dateLabel: between[0].replace(/[.!]$/, "").trim(),
    certainty: start.certainty === "exact" && end.certainty === "exact" ? "exact" : "resolved",
    basis: start.basis === "stated" && end.basis === "stated" ? "stated" : "inferred",
  }
}

function extractRecurrence(source: string, referenceDate: string | undefined): Omit<ParsedDate, "timeZone"> | null {
  const match = source.match(/\b(?:every|each)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (!match) return null
  const day = match[1].toLowerCase()
  const found: Omit<ParsedDate, "timeZone"> = {
    dateLabel: match[0],
    recurrence: `weekly:${day}`,
    certainty: referenceDate ? "resolved" : "unresolved",
    basis: "inferred",
    deadlineReview: referenceDate
      ? `This repeats every ${day}. The first date was worked out from the reference date.`
      : "This repeats, and the first date needs a reference date.",
  }
  if (referenceDate) found.dueDate = nextWeekday(referenceDate, WEEKDAYS.indexOf(day), false)
  return found
}

function namedDate(
  match: { label: string; month: number; day: number; year: number | null },
  referenceDate: string | undefined,
): Omit<ParsedDate, "timeZone"> | null {
  const month = match.month
  const day = match.day
  const year = match.year
  if (month === undefined) return null
  if (year !== null) {
    const date = isoFromParts(year, month + 1, day)
    if (!date) return null
    return { dueDate: date, dateLabel: match.label, certainty: "exact", basis: "stated" }
  }
  if (!referenceDate) {
    return { dateLabel: match.label, certainty: "unresolved", basis: "stated", deadlineReview: "The year was not written, and no reference date was provided." }
  }
  const refYear = Number(referenceDate.slice(0, 4))
  let date = isoFromParts(refYear, month + 1, day)
  let rolled = false
  if (date && date < referenceDate) {
    date = isoFromParts(refYear + 1, month + 1, day)
    rolled = true
  }
  if (!date) return null
  return {
    dueDate: date,
    dateLabel: match.label,
    certainty: "resolved",
    basis: "inferred",
    deadlineReview: rolled ? "The year was not written, so the next occurrence was used." : "The year was not written, so the reference year was used.",
  }
}

function numericDate(match: RegExpMatchArray): Omit<ParsedDate, "timeZone"> | null {
  const first = Number(match[1])
  const second = Number(match[2])
  const year = Number(match[3])
  const label = match[0]
  if (first > 12 && second > 12) return null
  if (first > 12) {
    const date = isoFromParts(year, second, first)
    return date ? { dueDate: date, dateLabel: label, certainty: "exact", basis: "stated" } : null
  }
  if (second > 12) {
    const date = isoFromParts(year, first, second)
    return date ? { dueDate: date, dateLabel: label, certainty: "exact", basis: "stated" } : null
  }
  const dayFirst = isoFromParts(year, second, first)
  const monthFirst = isoFromParts(year, first, second)
  return {
    dateLabel: label,
    certainty: "unresolved",
    basis: "stated",
    ambiguous: true,
    deadlineReview: `This could be ${dayFirst} or ${monthFirst}. Choose one.`,
  }
}

function relativeDay(referenceDate: string | undefined, offset: number, label: string): Omit<ParsedDate, "timeZone"> {
  if (!referenceDate) {
    return { dateLabel: label, certainty: "unresolved", basis: "stated", deadlineReview: `${label} needs a reference date.` }
  }
  return { dueDate: addDays(referenceDate, offset), dateLabel: label, certainty: "resolved", basis: "inferred" }
}

function matchNamedDate(source: string): { label: string; month: number; day: number; year: number | null } | null {
  const monthFirst = source.match(new RegExp(`\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?(?:\\s+(\\d{4}))?\\b`, "i"))
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()]
    if (month === undefined) return null
    return { label: monthFirst[0], month, day: Number(monthFirst[2]), year: monthFirst[3] ? Number(monthFirst[3]) : null }
  }
  const dayFirst = source.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}\\.?(?:,)?(?:\\s+(\\d{4}))?\\b`, "i"))
  if (!dayFirst) return null
  const month = MONTHS[dayFirst[2].toLowerCase()]
  if (month === undefined) return null
  return { label: dayFirst[0], month, day: Number(dayFirst[1]), year: dayFirst[3] ? Number(dayFirst[3]) : null }
}

function extractTime(source: string): { value?: string; label: string; review?: string } | null {
  if (/\bbefore\s+midnight\b/i.test(source)) return { value: "23:59", label: "before midnight" }
  if (/\bmidnight\b/i.test(source)) return { value: "00:00", label: "midnight" }
  if (/\bnoon\b/i.test(source)) return { value: "12:00", label: "noon" }
  const match = source.match(/\b(?:(?:at|by|before)\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)(?!\w)/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? "0")
  const meridiem = match[3].toLowerCase().replace(/\./g, "")
  if (hour < 1 || hour > 12 || minute > 59) return null
  if (meridiem === "pm" && hour !== 12) hour += 12
  if (meridiem === "am" && hour === 12) hour = 0
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, label: match[0] }
}

function sourceTimeZone(source: string): string | null {
  const match = source.match(/\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|ET|CT|MT|PT)\b/)
  return match ? match[1] : null
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) ?? iso
}

function endOfMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month, 0))
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) ?? iso
}

function nextWeekday(iso: string, weekday: number, forceNextWeek: boolean): string {
  const [year, month, day] = iso.split("-").map(Number)
  const current = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  let delta = (weekday - current + 7) % 7
  if (forceNextWeek && delta === 0) delta = 7
  return addDays(iso, delta)
}

function wallTimeStatus(isoDate: string, time: string, timeZone: string): "ok" | "gap" | "overlap" {
  const [year, month, day] = isoDate.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const offset = offsetMinutes(new Date(guess), timeZone)
  const utc = new Date(guess - offset * 60000)
  const back = partsInZone(utc, timeZone)
  const matches = back.year === year && back.month === month && back.day === day && back.hour === hour && back.minute === minute
  if (!matches) return "gap"
  const earlierOffset = offsetMinutes(new Date(utc.getTime() - 60 * 60000), timeZone)
  const laterOffset = offsetMinutes(new Date(utc.getTime() + 60 * 60000), timeZone)
  if (earlierOffset === laterOffset) return "ok"
  const other = offset === earlierOffset ? laterOffset : earlierOffset
  const otherUtc = new Date(guess - other * 60000)
  if (otherUtc.getTime() === utc.getTime()) return "ok"
  const otherBack = partsInZone(otherUtc, timeZone)
  const otherMatches = otherBack.year === year && otherBack.month === month && otherBack.day === day && otherBack.hour === hour && otherBack.minute === minute
  return otherMatches ? "overlap" : "ok"
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((asUtc - instant.getTime()) / 60000)
}

function partsInZone(instant: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const map: Record<string, string> = {}
  for (const part of formatted) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  let hour = Number(map.hour)
  if (hour === 24) hour = 0
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

export function describeDeadline(item: {
  dateLabel?: string
  dueDate?: string
  dueTime?: string
  timeZone?: string
  dateCertainty?: DateCertainty
  deadlineReview?: string
  rangeStart?: string
  rangeEnd?: string
  recurrence?: string
}): string {
  const parts: string[] = []
  if (item.dateLabel) parts.push(`From the text: ${item.dateLabel.replace(/\.$/, "")}.`)
  if (item.rangeStart && item.rangeEnd) parts.push(`Normalized range: ${item.rangeStart} to ${item.rangeEnd}.`)
  else if (item.dueDate) parts.push(`Normalized: ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ""}.`)
  else parts.push("No calendar date was saved.")
  if (item.recurrence) parts.push(`Repeats: ${item.recurrence}.`)
  parts.push(item.timeZone && item.timeZone !== "unspecified" ? `Time zone: ${item.timeZone}.` : "Time zone was not specified.")
  if (item.dateCertainty === "exact") parts.push("The date was written in full.")
  if (item.dateCertainty === "resolved") parts.push("The calendar day was worked out from the reference date.")
  if (item.dateCertainty === "approximate") parts.push("This is approximate.")
  if (item.dateCertainty === "unresolved") parts.push("This could not be resolved safely.")
  if (item.deadlineReview) parts.push(item.deadlineReview)
  return parts.join(" ")
}
