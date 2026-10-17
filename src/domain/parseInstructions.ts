import { createId, nowIso } from "./ids.ts"
import { linkItems } from "./links.ts"
import type { PathItem, PathItemType } from "./types.ts"

const LABELS: Record<string, PathItemType> = {
  goal: "goal",
  step: "step",
  requirement: "requirement",
  deadline: "deadline",
  resource: "resource",
  person: "person",
  contact: "person",
  note: "note",
}

const LABEL_PATTERN = /^(goal|step|requirement|deadline|resource|person|contact|note)\s*:\s*(.+)$/i
const LINK_PATTERN = /^link\s*:\s*(.+?)\s*->\s*(.+)$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function titleFrom(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= 80) return compact
  return `${compact.slice(0, 77).trimEnd()}...`
}

function splitBody(body: string): { title: string; description: string } {
  const parts = body.split(/\s+\|\s+/)
  return {
    title: parts[0]?.trim() ?? "",
    description: parts.slice(1).join(" | ").trim(),
  }
}

export function parseInstructions(text: string): PathItem[] {
  const now = nowIso()
  const items: PathItem[] = []
  const pendingLinks: Array<[string, string]> = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const linkMatch = line.match(LINK_PATTERN)
    if (linkMatch) {
      pendingLinks.push([linkMatch[1].trim(), linkMatch[2].trim()])
      continue
    }

    const labelMatch = line.match(LABEL_PATTERN)
    if (!labelMatch) continue

    const type = LABELS[labelMatch[1].toLowerCase()]
    const body = splitBody(labelMatch[2])
    if (!type || !body.title) continue

    let title = body.title
    let description = body.description
    let dueDate: string | undefined

    if (type === "deadline" && DATE_PATTERN.test(title)) {
      dueDate = title
      title = description || "Deadline"
      description = dueDate ? `Due ${dueDate}` : ""
    }

    const item: PathItem = {
      id: createId(),
      type,
      title,
      description,
      status: "not-started",
      position: items.length,
      linkedItemIds: [],
      createdAt: now,
      updatedAt: now,
    }
    if (dueDate) item.dueDate = dueDate
    items.push(item)
  }

  const structured = items.length > 0 ? items : fallbackItems(text, now)
  return applyPendingLinks(structured, pendingLinks)
}

function fallbackItems(text: string, now: string): PathItem[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const sourceBlocks = blocks.length > 0 ? blocks : []
  if (sourceBlocks.length === 0) return []

  let chunks = sourceBlocks
  if (chunks.length === 1) {
    const sentences = chunks[0].split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean)
    if (sentences.length > 1) chunks = sentences
  }

  const goalId = createId()
  const drafted: PathItem[] = chunks.map((chunk, index) => {
    const isGoal = index === 0
    const type: PathItemType = isGoal ? "goal" : "step"
    return {
      id: isGoal ? goalId : createId(),
      type,
      title: titleFrom(chunk),
      description: isGoal
        ? "Check this goal. It was taken from your text and may need a clearer title."
        : chunk,
      status: "not-started",
      position: index,
      linkedItemIds: [],
      createdAt: now,
      updatedAt: now,
    }
  })

  if (drafted.length < 2) return drafted
  return drafted.map((item, index) => ({
    ...item,
    linkedItemIds: index === 0 ? drafted.slice(1).map((step) => step.id) : [goalId],
  }))
}

function applyPendingLinks(items: PathItem[], pendingLinks: Array<[string, string]>): PathItem[] {
  return pendingLinks.reduce((current, [fromTitle, toTitle]) => {
    const source = findByTitle(current, fromTitle)
    const target = findByTitle(current, toTitle)
    if (!source || !target) return current
    return linkItems(current, source.id, target.id)
  }, items)
}

function findByTitle(items: PathItem[], title: string): PathItem | undefined {
  const key = title.trim().toLowerCase()
  return items.find((item) => item.title.trim().toLowerCase() === key)
}
