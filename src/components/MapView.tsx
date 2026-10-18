import { useLayoutEffect, useRef, useState } from "react"
import { readMap, type MapEdgeRole } from "../domain/mapLayout.ts"
import { byPosition } from "../domain/order.ts"
import type { PathItem } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { StatusBadge, TypeBadge } from "./StatusBadge.tsx"

interface Line {
  key: string
  role: MapEdgeRole
  x1: number
  y1: number
  x2: number
  y2: number
}

export function MapView({ items }: { items: PathItem[] }) {
  const { active, setCurrent } = useWorkspace()
  const ordered = byPosition(items)
  const reading = readMap(ordered, active?.relationships ?? [])
  const pairs = reading.edges.flatMap((edge) => {
    const from = ordered.find((item) => item.id === edge.fromId)
    const to = ordered.find((item) => item.id === edge.toId)
    return from && to ? [{ ...edge, from, to }] : []
  })
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
            key: pair.key,
            role: pair.role,
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
              line.role === next[index]?.role &&
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
      <p className="hint">{reading.explanation}</p>
      <ul className="action-row" aria-label="Line types">
        <li className="badge">Dashed line: suggested order</li>
        <li className="badge">Solid line: waits on</li>
        <li className="badge">Dotted line: extra information</li>
      </ul>
      <div className="map" ref={containerRef}>
        <svg className="map-lines" aria-hidden="true" width={mapSize.width} height={mapSize.height}>
          {lines.map((line) => (
            <line key={line.key} className={`edge-${line.role}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </svg>
        <div className="map-grid">
          {ordered.map((item) => {
            const selected = active?.currentItemId === item.id
            const start = reading.startId === item.id
            const className = ["info-card", selected ? "selected" : "", start ? "start" : ""].filter(Boolean).join(" ")
            return (
              <button
                key={item.id}
                type="button"
                className={className}
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
                  {start ? <span className="badge">Start here</span> : null}
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
              <li key={pair.key}>
                {pair.role === "blocker" ? (
                  <>
                    <button type="button" className="text-button" onClick={() => setCurrent(pair.to.id)}>
                      {pair.to.title}
                    </button>
                    <span>waits on</span>
                    <button type="button" className="text-button" onClick={() => setCurrent(pair.from.id)}>
                      {pair.from.title}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="text-button" onClick={() => setCurrent(pair.from.id)}>
                      {pair.from.title}
                    </button>
                    <span>{pair.role === "order" ? "is listed before" : "connects to"}</span>
                    <button type="button" className="text-button" onClick={() => setCurrent(pair.to.id)}>
                      {pair.to.title}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
