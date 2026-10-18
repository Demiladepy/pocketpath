import type { PathItem } from "./types.ts"

export interface ExtractionUpdate {
  existingId: string
  proposed: PathItem
}

export function isProtectedItem(item: PathItem): boolean {
  if (item.origin !== "extracted") return true
  if (item.userEdited) return true
  if (item.status !== "not-started") return true
  return false
}

export function stageExtraction(
  existing: PathItem[],
  proposed: PathItem[],
): { additions: PathItem[]; updates: ExtractionUpdate[] } {
  const additions: PathItem[] = []
  const updates: ExtractionUpdate[] = []
  const used = new Set<string>()
  const idMap = new Map<string, string>()

  for (const sameType of [true, false]) {
    for (const item of existing) {
      if (used.has(item.id)) continue
      const match = matchProposal(proposed, item, idMap, sameType)
      if (!match) continue
      used.add(item.id)
      idMap.set(match.id, item.id)
    }
  }

  for (const proposal of proposed) {
    const remapped = remapItem(proposal, idMap)
    const match = existing.find((item) => item.id === idMap.get(proposal.id))
    if (!match) {
      additions.push(remapped)
      continue
    }
    if (isProtectedItem(match) || sameExtraction(match, remapped)) continue
    updates.push({ existingId: match.id, proposed: remapped })
  }

  return { additions, updates }
}

function matchProposal(
  proposed: PathItem[],
  item: PathItem,
  claimed: Map<string, string>,
  sameType: boolean,
): PathItem | undefined {
  const excerpt = item.sourceExcerpt?.trim().toLowerCase()
  if (!excerpt) return undefined
  const candidates = proposed.filter((proposal) => {
    if (claimed.has(proposal.id)) return false
    if (proposal.sourceExcerpt?.trim().toLowerCase() !== excerpt) return false
    if (sameType) return proposal.type === item.type
    return (proposal.type === "deadline") === (item.type === "deadline")
  })
  return candidates.find((proposal) => proposal.type === item.type) ?? candidates[0]
}

function sameExtraction(existing: PathItem, proposed: PathItem): boolean {
  return (
    existing.title === proposed.title &&
    existing.description === proposed.description &&
    existing.type === proposed.type &&
    (existing.dueDate ?? "") === (proposed.dueDate ?? "") &&
    (existing.dateLabel ?? "") === (proposed.dateLabel ?? "")
  )
}

function remapItem(item: PathItem, idMap: Map<string, string>): PathItem {
  const id = idMap.get(item.id) ?? item.id
  return {
    ...item,
    id,
    linkedItemIds: item.linkedItemIds.map((linkedId) => idMap.get(linkedId) ?? linkedId),
    blockedByIds: (item.blockedByIds ?? []).map((blockedId) => idMap.get(blockedId) ?? blockedId),
  }
}
