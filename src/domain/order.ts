import type { PathItem } from "./types.ts"

export function compareByPosition(a: PathItem, b: PathItem): number {
  return a.position - b.position || a.createdAt.localeCompare(b.createdAt)
}

export function byPosition(items: PathItem[]): PathItem[] {
  return [...items].sort(compareByPosition)
}
