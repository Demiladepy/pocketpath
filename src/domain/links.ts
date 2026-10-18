import { nowIso } from "./ids.ts"
import { byPosition } from "./order.ts"
import type { PathItem } from "./types.ts"

export function linkItems(items: PathItem[], sourceId: string, targetId: string): PathItem[] {
  if (sourceId === targetId) return items
  const known = new Set(items.map((item) => item.id))
  if (!known.has(sourceId) || !known.has(targetId)) return items

  let changed = false
  const next = items.map((item) => {
    if (item.id !== sourceId && item.id !== targetId) return item
    const otherId = item.id === sourceId ? targetId : sourceId
    if (item.linkedItemIds.includes(otherId)) return item
    changed = true
    return {
      ...item,
      linkedItemIds: [...item.linkedItemIds, otherId],
      updatedAt: nowIso(),
    }
  })

  return changed ? next : items
}

export function unlinkItems(items: PathItem[], sourceId: string, targetId: string): PathItem[] {
  let changed = false
  const next = items.map((item) => {
    if (item.id !== sourceId && item.id !== targetId) return item
    const otherId = item.id === sourceId ? targetId : sourceId
    if (!item.linkedItemIds.includes(otherId)) return item
    changed = true
    return {
      ...item,
      linkedItemIds: item.linkedItemIds.filter((id) => id !== otherId),
      updatedAt: nowIso(),
    }
  })
  return changed ? next : items
}

export function removeItem(items: PathItem[], itemId: string): PathItem[] {
  return items
    .filter((item) => item.id !== itemId)
    .map((item) => {
      const linked = item.linkedItemIds.includes(itemId)
      const blocked = (item.blockedByIds ?? []).includes(itemId)
      if (!linked && !blocked) return item
      return {
        ...item,
        linkedItemIds: item.linkedItemIds.filter((id) => id !== itemId),
        blockedByIds: (item.blockedByIds ?? []).filter((id) => id !== itemId),
        updatedAt: nowIso(),
      }
    })
}

export function linkPairs(items: PathItem[]): Array<{ from: PathItem; to: PathItem }> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const pairs: Array<{ from: PathItem; to: PathItem }> = []
  for (const item of byPosition(items)) {
    for (const otherId of item.linkedItemIds) {
      const key = [item.id, otherId].sort().join(":")
      if (seen.has(key)) continue
      const other = byId.get(otherId)
      if (!other) continue
      seen.add(key)
      pairs.push({ from: item, to: other })
    }
  }
  return pairs
}

export function sanitizeLinks(items: PathItem[]): { items: PathItem[]; repaired: boolean } {
  const known = new Set(items.map((item) => item.id))
  let repaired = false

  const cleaned = items.map((item) => {
    const linked = [...new Set(item.linkedItemIds.filter((id) => id !== item.id && known.has(id)))]
    const same =
      linked.length === item.linkedItemIds.length &&
      linked.every((id, index) => id === item.linkedItemIds[index])
    if (same) return item
    repaired = true
    return { ...item, linkedItemIds: linked }
  })

  const byId = new Map(cleaned.map((item) => [item.id, item]))
  for (const item of cleaned) {
    for (const otherId of item.linkedItemIds) {
      const other = byId.get(otherId)
      if (!other || other.linkedItemIds.includes(item.id)) continue
      repaired = true
      byId.set(otherId, { ...other, linkedItemIds: [...other.linkedItemIds, item.id] })
    }
  }

  return {
    items: cleaned.map((item) => byId.get(item.id) ?? item),
    repaired,
  }
}
