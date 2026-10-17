import { useLayoutEffect, useRef, useState } from "react"
import { linkPairs } from "../domain/links.ts"
import { byPosition } from "../domain/order.ts"
import type { PathItem } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { StatusBadge, TypeBadge } from "./StatusBadge.tsx"

interface Line {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export function MapView({ items }: { items: PathItem[] }) {
  const { active, setCurrent } = useWorkspace()
  const ordered = byPosition(items)
  const pairs = linkPairs(ordered)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const [lines, setLines] = useState<Line[]>([])
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const bounds = container.getBoundingClientRect()
      const centers = new Map<string, { x: number; y: number }>()
      for (const item of ordered) {
        const card = cardRefs.current.get(item.id)
        if (!card) continue
        const rect = card.getBoundingClientRect()
        centers.set(item.id, {
          x: Math.round(rect.left - bounds.left + rect.width / 2),
          y: Math.round(rect.top - bounds.top + rect.height / 2),
        })
      }
      const next = pairs.flatMap((pair) => {
        const from = centers.get(pair.from.id)
        const to = centers.get(pair.to.id)
        if (!from || !to) return []
        return [
          {
            key: `${pair.from.id}:${pair.to.id}`,
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
          },
        ]
      })
      const width = Math.round(container.clientWidth)
      const height = Math.round(container.clientHeight)
      setMapSize((current) => (current.width === width && current.height === height ? current : { width, height }))
      setLines((current) => {
        const same =
          current.length === next.length &&
          current.every(
            (line, index) =>
              line.key === next[index]?.key &&
              line.x1 === next[index]?.x1 &&
              line.y1 === next[index]?.y1 &&
              line.x2 === next[index]?.x2 &&
              line.y2 === next[index]?.y2,
          )
        return same ? current : next
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [ordered, pairs])

  return (
    <div className="stack">
      <div className="map" ref={containerRef}>
        <svg className="map-lines" aria-hidden="true" width={mapSize.width} height={mapSize.height}>
          {lines.map((line) => (
            <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </svg>
        <div className="map-grid">
          {ordered.map((item) => {
            const selected = active?.currentItemId === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={selected ? "info-card selected" : "info-card"}
                aria-current={selected ? "true" : undefined}
                ref={(node) => {
                  if (node) cardRefs.current.set(item.id, node)
                  else cardRefs.current.delete(item.id)
                }}
                onClick={() => setCurrent(item.id)}
              >
                <span className="badge-row">
                  <TypeBadge type={item.type} />
                  <StatusBadge status={item.status} />
                  {selected ? <span className="badge">Selected</span> : null}
                </span>
                <span className="card-title">{item.title}</span>
              </button>
            )
          })}
        </div>
      </div>
      <section aria-labelledby="connections-heading">
        <h2 id="connections-heading">Connections</h2>
        {pairs.length === 0 ? (
          <p className="empty">No cards are linked yet. Select a card and add a link.</p>
        ) : (
          <ul className="connection-list">
            {pairs.map((pair) => (
              <li key={`${pair.from.id}:${pair.to.id}`}>
                <button type="button" className="text-button" onClick={() => setCurrent(pair.from.id)}>
                  {pair.from.title}
                </button>
                <span aria-hidden="true">→</span>
                <button type="button" className="text-button" onClick={() => setCurrent(pair.to.id)}>
                  {pair.to.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
