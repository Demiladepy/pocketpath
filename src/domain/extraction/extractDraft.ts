import { findDate, type ParsedDate } from "../dates.ts"
import type { EvidenceBasis, ExtractionConfidence, PathItemType } from "../types.ts"
import { assessCards, screenSource } from "./quality.ts"
import type { DraftItem, ExtractionDraft, ExtractionError, ExtractionInput, ExtractionWarning } from "./types.ts"

const GOAL_START = /^(?:please\s+)?(?:prepare|finish|complete|submit|create)\b/i
const STEP_START =
  /^(?:please\s+|pls\s+)?(?:read|gather|collect|write|draft|submit|ask|upload|review|list|send|open|complete|fill|save|check|email|download|print|sign|finish|prepare|add|make|keep|include)\b/i
const REQUIREMENT = /\b(must|required|requirement|eligibility|eligible|at least|no more than|under\s+\d+|need to|needs a|needs an)\b/i
const DOCUMENT_INTRO = /\b(must include|required documents|documents|please include|include the following|eligibility)\b/i
const DEADLINE_CUE = /\b(due|deadline|closes|no later than|submit by|before|by)\b/i
const URL_PATTERN = /\bhttps?:\/\/\S+/i
const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.\w+\b/
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "before",
  "could",
  "every",
  "first",
  "from",
  "have",
  "must",
  "need",
  "please",
  "required",
  "should",
  "their",
  "there",
  "these",
  "those",
  "under",
  "using",
  "which",
  "would",
  "your",
])

interface Segment {
  text: string
  kind: "list" | "sentence" | "heading"
  intro: string | null
}

export function extractDraft(input: ExtractionInput): ExtractionDraft {
  const text = input.text ?? ""
  const screened = screenSource(text)
  if (screened) return blockedDraft(text, screened)

  const normalized = normalize(text)
  const segments = segmentBody(normalized.body)
  const sourceLines = segments.map((segment) => segment.text)
  const built = buildDrafts(segments, normalized.subject, normalized.heading, input.now, input.timeZone)
  const merged = normalizeDuplicates(built.items)
  const warnings = [...built.warnings, ...merged.warnings, ...dateWarnings(merged.items)]
  return finishDraft(merged.items, built.title, warnings, sourceLines, text)
}

function blockedDraft(
  sourceText: string,
  screened: { status: ExtractionDraft["status"]; notice: string; error: ExtractionError },
): ExtractionDraft {
  return {
    title: "",
    items: [],
    warnings: [],
    error: screened.error,
    status: screened.status,
    notice: screened.notice,
    sourceLines: [],
    sourceText,
  }
}

function normalize(text: string): { subject: string | null; heading: string | null; body: string } {
  const lines = text.split(/\r?\n/)
  const kept: string[] = []
  let subject: string | null = null
  let signature = false

  for (const raw of lines) {
    if (signature) continue
    const line = raw.replace(/^>\s?/, "").trim()
    if (!line) {
      kept.push("")
      continue
    }
    if (line === "--") {
      signature = true
      continue
    }
    const subjectMatch = line.match(/^subject:\s*(.+)$/i)
    if (subjectMatch) {
      subject = cleanSubject(subjectMatch[1])
      continue
    }
    if (/^(from|to|cc|bcc|sent):\s/i.test(line)) continue
    if (/^date:\s/i.test(line) && kept.every((entry) => entry === "")) continue
    kept.push(line)
  }

  const body = kept.join("\n").trim()
  const heading = firstHeading(body)
  return { subject, heading, body }
}

function cleanSubject(value: string): string {
  const cleaned = value.replace(/^(re|fw|fwd)\s*:\s*/i, "").replace(/[!\s]+$/g, "").trim()
  return tidy(cleaned || value.trim())
}

function firstHeading(body: string): string | null {
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  const first = blocks[0]
  if (!first || blocks.length < 2) return null
  const line = first.split("\n")[0]?.trim() ?? ""
  if (!line || line.length > 70 || /[.!?]/.test(line) || /^(?:[-*]|\d+[.)])\s+/.test(line)) return null
  if (STEP_START.test(line) || GOAL_START.test(line) || DEADLINE_CUE.test(line)) return null
  return tidy(line)
}

function segmentBody(body: string): Segment[] {
  if (!body) return []
  const blocks = body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  const segments: Segment[] = []

  for (const block of blocks) {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean)
    const listLines = lines.filter((line) => /^(?:[-*]|\d+[.)])\s+/.test(line))
    if (listLines.length > 0) {
      const intro = lines.filter((line) => !/^(?:[-*]|\d+[.)])\s+/.test(line)).join(" ")
      if (intro && !isBareLabel(intro)) {
        for (const sentence of splitSentences(intro.replace(/:$/, ""))) {
          segments.push({ text: sentence, kind: "sentence", intro: null })
        }
      }
      for (const line of listLines) {
        segments.push({
          text: line.replace(/^(?:[-*]|\d+[.)])\s+/, "").trim(),
          kind: "list",
          intro: intro || null,
        })
      }
      continue
    }
    if (isHeadingLine(lines[0] ?? "", lines.length === 1)) {
      segments.push({ text: lines[0] ?? "", kind: "heading", intro: null })
      continue
    }
    const pieces = lines.length > 1 ? lines : [block.replace(/\s+/g, " ")]
    for (const piece of pieces) {
      for (const sentence of splitSentences(piece)) {
        segments.push({ text: sentence, kind: "sentence", intro: null })
      }
    }
  }

  return segments
}

/**
 * Lines that already produced a deadline must not also become steps.
 * Covers "Submit by …", "Draft is due …", and similar delivery wording.
 */
function isDeadlineAction(text: string, hasDeadline: boolean): boolean {
  if (!hasDeadline) return false
  const trimmed = text.trim()
  if (/^(?:please\s+|pls\s+)?(?:submit|turn\s+in|hand\s+in)\b/i.test(trimmed)) return true
  if (/\bis due\b|\bcloses\b|\bdeadline\b/i.test(trimmed)) return true
  return false
}

function isBareLabel(intro: string): boolean {
  const trimmed = intro.trim().replace(/:$/, "")
  if (!trimmed || DEADLINE_CUE.test(trimmed) || URL_PATTERN.test(trimmed) || EMAIL_PATTERN.test(trimmed)) return false
  const words = trimmed.split(/\s+/)
  if (words.length > 6) return false
  if (DOCUMENT_INTRO.test(trimmed) || /^required\b/i.test(trimmed)) return true
  return /^(?:you\s+)?(?:still\s+|also\s+|just\s+)?(?:need to|have to|should|must|please)$/i.test(trimmed)
}

function isHeadingLine(line: string, alone: boolean): boolean {
  if (!alone) return false
  if (!line || line.length > 70 || /[.!?]/.test(line)) return false
  if (STEP_START.test(line) || GOAL_START.test(line) || URL_PATTERN.test(line) || EMAIL_PATTERN.test(line)) return false
  return true
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function buildDrafts(
  segments: Segment[],
  subject: string | null,
  heading: string | null,
  now: Date,
  timeZone?: string,
): { items: DraftItem[]; warnings: ExtractionWarning[]; title: string } {
  const items: DraftItem[] = []
  const warnings: ExtractionWarning[] = []
  const seenDates = new Set<string>()

  for (const segment of segments) {
    if (segment.kind === "heading") continue
    const dated = DEADLINE_CUE.test(segment.text) ? findDate(segment.text, now, timeZone) : null
    if (dated) addDeadline(items, warnings, segment.text, dated, seenDates)

    if (segment.kind === "list") {
      if (listIsRequirement(segment)) items.push(requirementFrom(segment.text, "high"))
      else if (STEP_START.test(segment.text) && !isDeadlineAction(segment.text, Boolean(dated))) {
        items.push(stepFrom(segment.text, "high"))
      }
      if (URL_PATTERN.test(segment.text)) items.push(resourceFrom(segment.text))
      pushContact(items, segment.text)
      continue
    }

    if (!items.some((item) => item.type === "goal") && /^(?:please\s+|pls\s+)?(?:prepare|finish|complete|create)\b/i.test(segment.text)) {
      items.push(goalFrom(segment.text))
      continue
    }

    if (STEP_START.test(segment.text) && !isDeadlineAction(segment.text, Boolean(dated))) {
      items.push(stepFrom(segment.text, "medium"))
      pushContact(items, segment.text)
      continue
    }

    if (REQUIREMENT.test(segment.text)) {
      items.push(requirementFrom(segment.text, "high"))
      continue
    }

    if (URL_PATTERN.test(segment.text) || /\bportal\b/i.test(segment.text)) {
      items.push(resourceFrom(segment.text))
      continue
    }

    pushContact(items, segment.text)
  }

  if (!items.some((item) => item.type === "goal") && items.some((item) => item.type === "step")) {
    const statedTitle = subject ?? heading
    if (statedTitle) {
      items.unshift(draft({
        type: "goal",
        title: statedTitle,
        description: subject
          ? "Taken from the subject line. Rename it if that is not the goal."
          : "Taken from the heading. Rename it if that is not the goal.",
        sourceExcerpt: statedTitle,
        confidence: "medium",
        basis: "stated",
      }))
    } else {
      const placeholder = draft({
        type: "goal",
        title: "Follow these steps",
        description: "No goal sentence was found. Rename this if it is wrong.",
        sourceExcerpt: "",
        confidence: "low",
        basis: "inferred",
      })
      items.unshift(placeholder)
      warnings.push({
        code: "inferred-goal",
        draftId: placeholder.id,
        message: "No goal was stated. The goal title is a placeholder, so rename it.",
      })
    }
  }

  const goal = items.find((item) => item.type === "goal")
  const title = workspaceTitle(subject, heading, goal)
  return { items, warnings, title }
}

function pushContact(items: DraftItem[], sentence: string) {
  const email = sentence.match(EMAIL_PATTERN)
  if (!email) return
  if (items.some((item) => item.type === "person" && item.title === email[0])) return
  items.push(draft({
    type: "person",
    title: email[0],
    description: sentence,
    sourceExcerpt: sentence,
    confidence: "high",
    basis: "stated",
  }))
}

function listIsRequirement(segment: Segment): boolean {
  if (STEP_START.test(segment.text)) return false
  if (segment.intro && (DOCUMENT_INTRO.test(segment.intro) || REQUIREMENT.test(segment.intro))) return true
  if (REQUIREMENT.test(segment.text)) return true
  return !STEP_START.test(segment.text) && segment.intro != null && DOCUMENT_INTRO.test(segment.intro)
}

function addDeadline(items: DraftItem[], warnings: ExtractionWarning[], sentence: string, dated: ParsedDate, seen: Set<string>) {
  const key = dated.dueDate ?? dated.dateLabel.toLowerCase()
  if (seen.has(key)) {
    const existing = items.find((item) => item.type === "deadline" && (item.dueDate === dated.dueDate || item.dateLabel?.toLowerCase() === dated.dateLabel.toLowerCase()))
    if (existing && !existing.description.includes(sentence)) {
      existing.description = `${existing.description} ${sentence}`.trim()
      existing.sourceExcerpt = `${existing.sourceExcerpt}\n${sentence}`
    }
    return
  }
  seen.add(key)
  const resolved = dated.certainty === "resolved" || dated.certainty === "approximate"
  const item = draft({
    type: "deadline",
    title: dated.certainty === "approximate" || dated.certainty === "unresolved"
      ? dated.dateLabel
      : `Due ${dated.dateLabel}`,
    description: sentence,
    sourceExcerpt: sentence,
    dueDate: dated.dueDate,
    dateLabel: dated.dateLabel,
    dateCertainty: dated.certainty,
    confidence: dated.certainty === "exact" ? "high" : dated.certainty === "resolved" ? "medium" : "low",
    basis: dated.basis ?? (resolved ? "inferred" : "stated"),
  })
  if (dated.dueTime) item.dueTime = dated.dueTime
  if (dated.timeZone) item.timeZone = dated.timeZone
  if (dated.deadlineReview) item.deadlineReview = dated.deadlineReview
  if (dated.rangeStart) item.rangeStart = dated.rangeStart
  if (dated.rangeEnd) item.rangeEnd = dated.rangeEnd
  if (dated.recurrence) item.recurrence = dated.recurrence
  items.push(item)
  if (dated.ambiguous) {
    warnings.push({
      code: "ambiguous-date",
      draftId: item.id,
      message: dated.deadlineReview ?? "A numeric date could be read two ways. Choose the one you mean.",
    })
  }
  if (dated.past) {
    warnings.push({
      code: "past-deadline",
      draftId: item.id,
      message: "A deadline is before the reference date. It was kept for review.",
    })
  }
  if (dated.deadlineReview && /clocks move/i.test(dated.deadlineReview)) {
    warnings.push({ code: "dst-time", draftId: item.id, message: dated.deadlineReview })
  }
}

function goalFrom(sentence: string): DraftItem {
  let title = sentence.replace(/^(?:please|pls)\s+/i, "").replace(/[.!?]$/, "")
  title = title.replace(/\s+\b(?:before|by|due)\b[\s\S]*$/i, "").trim()
  return draft({
    type: "goal",
    title: tidy(title || sentence),
    description: sentence,
    sourceExcerpt: sentence,
    confidence: "high",
    basis: "stated",
  })
}

function stepFrom(sentence: string, confidence: ExtractionConfidence): DraftItem {
  return draft({
    type: "step",
    title: tidy(sentence.replace(/[.!?]$/, "")),
    description: sentence,
    sourceExcerpt: sentence,
    confidence,
    basis: "stated",
  })
}

function requirementFrom(sentence: string, confidence: ExtractionConfidence): DraftItem {
  const under = sentence.match(/\bunder\s+(\d+)\s+words\b/i)
  let title = sentence.replace(/^(?:you\s+)?/i, "").replace(/[.!?]$/, "")
  if (under && /answer/i.test(sentence)) title = `Short answers under ${under[1]} words`
  else if (/transcript/i.test(sentence)) title = "Official transcript"
  else title = title.replace(/^(?:must|need to|include)\s+/i, "")
  return draft({
    type: "requirement",
    title: tidy(title),
    description: sentence,
    sourceExcerpt: sentence,
    confidence,
    basis: "stated",
  })
}

function resourceFrom(sentence: string): DraftItem {
  const url = sentence.match(URL_PATTERN)?.[0]?.replace(/[).,]+$/, "") ?? ""
  const portal = sentence.match(/\b((?:[a-z]+\s+){0,3}portal)\b/i)
  const title = portal
    ? tidy(portal[1].replace(/^the\s+/i, ""))
    : url
      ? "Link from the instructions"
      : "Resource"
  return draft({
    type: "resource",
    title,
    description: url ? sentence.replace(URL_PATTERN, url) : sentence,
    sourceExcerpt: sentence,
    confidence: url ? "high" : "medium",
    basis: "stated",
  })
}

function normalizeDuplicates(items: DraftItem[]): { items: DraftItem[]; warnings: ExtractionWarning[] } {
  const kept: DraftItem[] = []
  const warnings: ExtractionWarning[] = []

  for (const item of items) {
    const match = kept.find((existing) => sameInstruction(existing, item))
    if (!match) {
      kept.push(item)
      continue
    }
    const extra = item.description.trim()
    if (extra && !match.description.includes(extra)) match.description = `${match.description} ${extra}`.trim()
    if (item.sourceExcerpt && !match.sourceExcerpt.includes(item.sourceExcerpt)) {
      match.sourceExcerpt = `${match.sourceExcerpt}\n${item.sourceExcerpt}`.trim()
    }
    if (item.title.length > match.title.length) match.title = item.title
    match.confidence = lowerConfidence(match.confidence, item.confidence)
    warnings.push({
      code: "merged-duplicate",
      draftId: match.id,
      message: `Combined repeated instructions for “${match.title}” so the extra detail was kept.`,
    })
  }

  return { items: kept, warnings }
}

function sameInstruction(left: DraftItem, right: DraftItem): boolean {
  if (left.type !== right.type) return false
  if (left.type !== "step" && left.type !== "requirement" && left.type !== "resource" && left.type !== "person") {
    return false
  }
  const a = left.title.trim().toLowerCase()
  const b = right.title.trim().toLowerCase()
  if (a === b) return true
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) return true
  const verbA = leadingVerb(left.title)
  const verbB = leadingVerb(right.title)
  if (!verbA || verbA !== verbB) return false
  const shared = distinctiveWords(left.title).filter((word) => distinctiveWords(right.title).includes(word))
  return shared.length > 0
}

function dateWarnings(items: DraftItem[]): ExtractionWarning[] {
  const warnings: ExtractionWarning[] = []
  const concrete = items.filter((item) => item.type === "deadline" && item.dueDate)
  const distinct = [...new Set(concrete.map((item) => item.dueDate))]
  if (distinct.length > 1) {
    const labels = concrete.map((item) => item.dateLabel || item.dueDate).join(" and ")
    warnings.push({
      code: "conflicting-dates",
      message: `These deadlines disagree: ${labels}. Choose which one applies.`,
    })
  }
  const hasStep = items.some((item) => item.type === "step")
  if (hasStep && !items.some((item) => item.type === "deadline")) {
    warnings.push({
      code: "missing-deadline",
      message: "No deadline was stated. None was added.",
    })
  }
  return warnings
}

function finishDraft(
  items: DraftItem[],
  title: string,
  warnings: ExtractionWarning[],
  sourceLines: string[],
  sourceText: string,
): ExtractionDraft {
  const assessed = assessCards({ sourceText, title, items, warnings })
  return {
    title: assessed.title,
    items: assessed.items,
    warnings: assessed.warnings,
    error: assessed.error,
    status: assessed.status,
    notice: assessed.notice,
    sourceLines,
    sourceText,
  }
}

function workspaceTitle(subject: string | null, heading: string | null, goal: DraftItem | undefined): string {
  if (subject && subject.length > 0 && subject.length <= 80) return subject
  if (heading && heading.length <= 80) return heading
  if (!goal) return "Untitled path"
  return goal.title.length <= 80 ? goal.title : `${goal.title.slice(0, 77).trimEnd()}...`
}

function draft(partial: {
  type: PathItemType
  title: string
  description: string
  sourceExcerpt: string
  confidence: ExtractionConfidence
  basis: EvidenceBasis
  dueDate?: string
  dateLabel?: string
  dateCertainty?: ParsedDate["certainty"]
}): DraftItem {
  const item: DraftItem = {
    id: draftId(partial.type, partial.sourceExcerpt || partial.title),
    type: partial.type,
    title: partial.title,
    description: partial.description,
    sourceExcerpt: partial.sourceExcerpt,
    confidence: partial.confidence,
    basis: partial.basis,
    reviewStatus: "pending",
    blockedByIds: [],
    warnings: [],
  }
  if (partial.dueDate) item.dueDate = partial.dueDate
  if (partial.dateLabel) item.dateLabel = partial.dateLabel
  if (partial.dateCertainty) item.dateCertainty = partial.dateCertainty
  return item
}

function draftId(type: string, excerpt: string): string {
  const key = `${type}:${excerpt.trim().toLowerCase().replace(/\s+/g, " ")}`
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `draft-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function leadingVerb(title: string): string | null {
  return title.trim().toLowerCase().match(/^[a-z]+/)?.[0] ?? null
}

function distinctiveWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z]{5,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? []
}

function lowerConfidence(left: ExtractionConfidence, right: ExtractionConfidence): ExtractionConfidence {
  const rank = { high: 3, medium: 2, low: 1 }
  return rank[left] <= rank[right] ? left : right
}

function tidy(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim()
  if (!clean) return clean
  const capped = clean.charAt(0).toUpperCase() + clean.slice(1)
  if (capped.length <= 80) return capped
  return `${capped.slice(0, 77).trimEnd()}...`
}
