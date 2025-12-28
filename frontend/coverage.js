import { pointInPolygon, distance } from "./geometry.js"

export function computeCoverage(polygon, cameras, step = 12) {
  const points = []

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  polygon.forEach(p => {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  })

  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      const p = { x, y }
      if (!pointInPolygon(p, polygon)) continue

      let covered = false
      for (const cam of cameras) {
        if (distance(p, cam) <= cam.radius) {
          covered = true
          break
        }
      }

      points.push({ ...p, covered })
    }
  }

  return points
}
