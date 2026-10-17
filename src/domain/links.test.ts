import { describe, expect, it } from "vitest"
import { createItem } from "./items.ts"
import { linkItems, linkPairs, removeItem, sanitizeLinks, unlinkItems } from "./links.ts"

describe("links", () => {
  const alpha = createItem({ id: "a", title: "Alpha", position: 0 })
  const beta = createItem({ id: "b", title: "Beta", position: 1 })

  it("links and unlinks both cards", () => {
    const linked = linkItems([alpha, beta], "a", "b")
    expect(linked.find((item) => item.id === "a")?.linkedItemIds).toEqual(["b"])
    expect(linked.find((item) => item.id === "b")?.linkedItemIds).toEqual(["a"])
    expect(linkPairs(linked)).toHaveLength(1)

    const unlinked = unlinkItems(linked, "a", "b")
    expect(unlinked.every((item) => item.linkedItemIds.length === 0)).toBe(true)
  })

  it("ignores a link to a missing card or the same card", () => {
    expect(linkItems([alpha, beta], "a", "missing")).toEqual([alpha, beta])
    expect(linkItems([alpha, beta], "a", "a")).toEqual([alpha, beta])
  })

  it("removes a card and the links that pointed at it", () => {
    const linked = linkItems([alpha, beta], "a", "b")
    const remaining = removeItem(linked, "a")
    expect(remaining.map((item) => item.id)).toEqual(["b"])
    expect(remaining[0]?.linkedItemIds).toEqual([])
  })

  it("drops dangling ids and makes a one-sided link mutual", () => {
    const broken = [
      { ...alpha, linkedItemIds: ["missing", "b"] },
      { ...beta, linkedItemIds: [] },
    ]
    const result = sanitizeLinks(broken)
    expect(result.repaired).toBe(true)
    expect(result.items[0]?.linkedItemIds).toEqual(["b"])
    expect(result.items[1]?.linkedItemIds).toEqual(["a"])
  })
})
