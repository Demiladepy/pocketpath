import type { ExtractionWarning } from "./extraction/types.ts"
import { linkItems } from "./links.ts"
import type { ExtractionConfidence, PathItem, PathItemType, Relationship, RelationshipKind } from "./types.ts"

const STOP = new Set([
  "about", "after", "again", "before", "could", "every", "first", "from", "have", "must",
  "need", "please", "required", "should", "their", "there", "these", "those", "under",
  "using", "which", "would", "your", "with", "this", "that", "each",
])

export interface ExplicitLink {
  fromTitle: string
  toTitle: string
}

export function proposeRelationships(
  items: PathItem[],
  sourceText: string,
  explicitLinks: ExplicitLink[] = [],
): { relationships: Relationship[]; warnings: ExtractionWarning[] } {
  const relationships: Relationship[] = []
  const warnings: ExtractionWarning[] = []

  for (const link of explicitLinks) {
    const from = findByTitle(items, link.fromTitle)
    const to = findByTitle(items, link.toTitle)
    if (!from || !to) {
      warnings.push({
        code: "missing-prerequisite",
        message: `A link to “${link.fromTitle}” or “${link.toTitle}” could not be matched to a card. Nothing was invented.`,
      })
      continue
    }
    const oriented = orient(from, to, kindForPair(from, to))
    addRelationship(relationships, warnings, {
      from: oriented.from,
      to: oriented.to,
      kind: oriented.kind,
      reason: "The text links these cards.",
      basis: "stated",
      confidence: "high",
    })
  }

  for (const pair of beforePairs(sourceText)) {
    const later = matchPhrase(items, pair.later, ["step"])
    const prerequisite = matchPhrase(items, pair.prerequisite, ["requirement", "resource", "step", "person"])
    if (!later || !prerequisite || later.id === prerequisite.id) {
      warnings.push({
        code: "missing-prerequisite",
        message: `“${pair.sentence.trim()}” names a dependency, but one side is not a card. Nothing was added.`,
      })
      continue
    }
    addRelationship(relationships, warnings, {
      from: prerequisite,
      to: later,
      kind: "before",
      reason: `The text says to finish “${prerequisite.title}” before “${later.title}”.`,
      basis: "stated",
      confidence: "high",
    })
  }

  for (const step of items.filter((item) => item.type === "step")) {
    for (const other of items) {
      if (other.id === step.id) continue
      const word = sharedStem(step.title, other.title)
      if (!word) continue
      if (other.type === "requirement") {
        const document = isDocument(other)
        addRelationship(relationships, warnings, {
          from: step,
          to: other,
          kind: document ? "requires" : "satisfies",
          reason: document
            ? `“${step.title}” mentions “${word}”, so it may need “${other.title}”.`
            : `“${step.title}” mentions “${word}”, so it may satisfy “${other.title}”.`,
          basis: "inferred",
          confidence: "medium",
        })
      } else if (other.type === "resource") {
        addRelationship(relationships, warnings, {
          from: other,
          to: step,
          kind: "supports",
          reason: `“${other.title}” mentions “${word}”, so it may support “${step.title}”.`,
          basis: "inferred",
          confidence: "medium",
        })
      } else if (other.type === "person") {
        const named = step.sourceExcerpt?.toLowerCase().includes(other.title.toLowerCase())
        if (!named) continue
        addRelationship(relationships, warnings, {
          from: other,
          to: step,
          kind: "supports",
          reason: `“${step.title}” names ${other.title}.`,
          basis: "stated",
          confidence: "high",
        })
      }
    }
  }

  for (const deadline of items.filter((item) => item.type === "deadline")) {
    const label = (deadline.dateLabel ?? deadline.title).toLowerCase()
    const cue = label.split(/\s+/).find((word) => word.length >= 3) ?? ""
    for (const target of items) {
      if (target.id === deadline.id || (target.type !== "goal" && target.type !== "step")) continue
      const haystack = `${target.title} ${target.description} ${target.sourceExcerpt ?? ""}`.toLowerCase()
      if (!cue || !haystack.includes(cue)) continue
      addRelationship(relationships, warnings, {
        from: deadline,
        to: target,
        kind: "applies-to",
        reason: `“${deadline.dateLabel ?? deadline.title}” appears with “${target.title}”.`,
        basis: "stated",
        confidence: "high",
      })
    }
  }

  const listed = listedSteps(items, sourceText)
  for (let index = 0; index < listed.length - 1; index += 1) {
    const from = listed[index]
    const to = listed[index + 1]
    if (!from || !to) continue
    addRelationship(relationships, warnings, {
      from,
      to,
      kind: "order",
      reason: "These steps are listed in this order. That is a suggestion, not a rule that one must wait.",
      basis: "inferred",
      confidence: "low",
    })
  }

  return { relationships: validateRelationships(items, relationships).relationships, warnings }
}

export function applyRelationships(items: PathItem[], relationships: Relationship[]): PathItem[] {
  const accepted = validateRelationships(items, relationships).relationships.filter(
    (relationship) => relationship.reviewStatus === "accepted",
  )
  let next: PathItem[] = items.map((item) => ({
    ...item,
    linkedItemIds: [...item.linkedItemIds],
    blockedByIds: [...(item.blockedByIds ?? [])],
  }))
  for (const relationship of accepted) {
    next = linkItems(next, relationship.fromId, relationship.toId)
    if (relationship.kind !== "before") continue
    next = next.map((item) => {
      if (item.id !== relationship.toId || item.blockedByIds?.includes(relationship.fromId)) return item
      return { ...item, blockedByIds: [...(item.blockedByIds ?? []), relationship.fromId] }
    })
  }
  return next
}

export function validateRelationships(
  items: PathItem[],
  relationships: Relationship[],
): { relationships: Relationship[]; dropped: boolean } {
  const known = new Set(items.map((item) => item.id))
  const seen = new Set<string>()
  let dropped = false
  const kept: Relationship[] = []
  for (const relationship of relationships) {
    const key = `${relationship.kind}:${relationship.fromId}:${relationship.toId}`
    const valid =
      relationship.fromId !== relationship.toId &&
      known.has(relationship.fromId) &&
      known.has(relationship.toId) &&
      !seen.has(key)
    if (!valid) {
      dropped = true
      continue
    }
    seen.add(key)
    kept.push(relationship)
  }
  return { relationships: kept, dropped }
}

export function canUseKind(relationships: Relationship[], id: string, kind: RelationshipKind): boolean {
  if (kind !== "before") return true
  const current = relationships.find((relationship) => relationship.id === id)
  if (!current) return false
  const others = relationships.filter(
    (relationship) => relationship.id !== id && relationship.kind === "before" && relationship.reviewStatus !== "rejected",
  )
  return !reaches(others, current.toId, current.fromId)
}

export function userConnection(fromId: string, toId: string): Relationship {
  return {
    id: relationshipId("connects", fromId, toId),
    fromId,
    toId,
    kind: "connects",
    reason: "You connected these cards.",
    basis: "stated",
    confidence: "high",
    reviewStatus: "accepted",
  }
}

function addRelationship(
  relationships: Relationship[],
  warnings: ExtractionWarning[],
  input: {
    from: PathItem
    to: PathItem
    kind: RelationshipKind
    reason: string
    basis: Relationship["basis"]
    confidence: ExtractionConfidence
  },
) {
  if (input.from.id === input.to.id) return
  const key = `${input.kind}:${input.from.id}:${input.to.id}`
  if (relationships.some((relationship) => `${relationship.kind}:${relationship.fromId}:${relationship.toId}` === key)) {
    warnings.push({
      code: "duplicate-link",
      message: `A duplicate ${input.kind} link between “${input.from.title}” and “${input.to.title}” was skipped.`,
    })
    return
  }
  if (input.kind === "before" && reaches(relationships.filter((relationship) => relationship.kind === "before"), input.to.id, input.from.id)) {
    warnings.push({
      code: "cycle-prevented",
      message: `“${input.from.title}” was not set to block “${input.to.title}” because that would make a circle.`,
    })
    return
  }
  relationships.push({
    id: relationshipId(input.kind, input.from.id, input.to.id),
    fromId: input.from.id,
    toId: input.to.id,
    kind: input.kind,
    reason: input.reason,
    basis: input.basis,
    confidence: input.confidence,
    reviewStatus: "pending",
  })
}

function reaches(relationships: Relationship[], startId: string, goalId: string): boolean {
  const pending = [startId]
  const seen = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || seen.has(current)) continue
    if (current === goalId) return true
    seen.add(current)
    for (const relationship of relationships) {
      if (relationship.fromId === current) pending.push(relationship.toId)
    }
  }
  return false
}

function kindForPair(from: PathItem, to: PathItem): RelationshipKind {
  const types = new Set<PathItemType>([from.type, to.type])
  if (types.has("deadline")) return "applies-to"
  if (types.has("step") && types.has("requirement")) return isDocument(from.type === "requirement" ? from : to) ? "requires" : "satisfies"
  if (types.has("person") || (types.has("resource") && types.has("step"))) return "supports"
  return "connects"
}

function orient(from: PathItem, to: PathItem, kind: RelationshipKind): { from: PathItem; to: PathItem; kind: RelationshipKind } {
  if (kind === "applies-to" && to.type === "deadline") return { from: to, to: from, kind }
  if (kind === "supports" && from.type === "step") return { from: to, to: from, kind }
  if ((kind === "requires" || kind === "satisfies") && from.type !== "step") return { from: to, to: from, kind }
  return { from, to, kind }
}

function beforePairs(sourceText: string): Array<{ prerequisite: string; later: string; sentence: string }> {
  const sentences = sourceText.split(/\n+|(?<=[.!?])\s+/)
  const pairs: Array<{ prerequisite: string; later: string; sentence: string }> = []
  for (const sentence of sentences) {
    const must = sentence.match(/\bmust\s+(.+?)\s+before\s+you\s+([a-z]+)/i)
    if (must?.[1] && must[2]) pairs.push({ prerequisite: must[1], later: must[2], sentence })
    const after = sentence.match(/\b([a-z]+)\b[^.!?\n]{0,40}\bafter\s+you\s+(?:have\s+|finish\s+|complete\s+)?(.+?)(?:[.!]|$)/i)
    if (after?.[1] && after[2]) pairs.push({ prerequisite: after[2], later: after[1], sentence })
  }
  return pairs
}

function listedSteps(items: PathItem[], sourceText: string): PathItem[] {
  const found: PathItem[] = []
  for (const line of sourceText.split(/\n/)) {
    const trimmed = line.trim()
    if (!/^(?:\d+[.)]|[-*])\s+\S/.test(trimmed)) continue
    const bare = trimmed.replace(/^(?:\d+[.)]|[-*])\s+/, "")
    const step = items.find(
      (item) =>
        item.type === "step" &&
        !found.some((entry) => entry.id === item.id) &&
        (item.sourceExcerpt?.includes(bare) || bare.toLowerCase().includes(item.title.toLowerCase())),
    )
    if (step) found.push(step)
  }
  return found
}

function isDocument(item: PathItem): boolean {
  return /\b(transcript|document|pdf|file|form|sample|letter|passport|resume)\b/i.test(`${item.title} ${item.description}`)
}

function findByTitle(items: PathItem[], title: string): PathItem | undefined {
  const key = title.trim().toLowerCase()
  return items.find((item) => item.title.trim().toLowerCase() === key)
}

function matchPhrase(items: PathItem[], phrase: string, types: PathItemType[]): PathItem | undefined {
  const phraseStems = new Set(stems(phrase))
  const verb = phrase.trim().toLowerCase().match(/[a-z]+/)?.[0] ?? ""
  let best: { item: PathItem; score: number } | null = null
  for (const item of items) {
    if (!types.includes(item.type)) continue
    const titleStems = stems(item.title)
    let score = titleStems.filter((stem) => phraseStems.has(stem)).length
    const titleVerb = item.title.trim().toLowerCase().match(/[a-z]+/)?.[0] ?? ""
    if (verb && titleVerb && (titleVerb.startsWith(verb) || verb.startsWith(titleVerb))) score += 1
    if (score === 0) continue
    const prefer =
      best !== null &&
      score === best.score &&
      item.type === "requirement" &&
      best.item.type === "step"
    if (!best || score > best.score || prefer) best = { item, score }
  }
  return best?.item
}

function sharedStem(left: string, right: string): string | null {
  const words = new Set(stems(right))
  return stems(left).find((stem) => words.has(stem)) ?? null
}

function stems(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) ?? [])
    .map((word) => (word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word))
    .filter((word) => !STOP.has(word) && word.length >= 4)
}

function relationshipId(kind: string, fromId: string, toId: string): string {
  const key = `${kind}:${fromId}:${toId}`
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `rel-${(hash >>> 0).toString(16).padStart(8, "0")}`
}
