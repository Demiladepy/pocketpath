export function sourceItemId(type: string, excerpt: string): string {
  const key = `${type}:${excerpt.trim().toLowerCase().replace(/\s+/g, " ")}`
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `draft-${(hash >>> 0).toString(16).padStart(8, "0")}`
}
