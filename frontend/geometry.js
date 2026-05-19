// -------- Geometry Utilities --------

import { SAMPLE_STEP } from './config.js';

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isPointInPolygon(point, polygon) {
  if (polygon.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getPolygonBounds(polygon) {
  if (polygon.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

export function isPointInCameraView(point, camera) {
  const dist = distance(point, camera);
  if (dist > camera.range) return false;
  
  // Calculate angle from camera to point
  const angle = Math.atan2(point.y - camera.y, point.x - camera.x) * 180 / Math.PI;
  
  // Calculate difference from camera's facing direction
  let diff = angle - camera.angle;
  
  // Normalize angle difference to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  
  // Check if within field of view
  return Math.abs(diff) <= camera.fov / 2;
}

export function generateGridPoints(polygon, step = 10) {
  const bounds = getPolygonBounds(polygon);
  const points = [];
  const actualStep = step || SAMPLE_STEP;

  for (let x = bounds.minX; x <= bounds.maxX; x += actualStep) {
    for (let y = bounds.minY; y <= bounds.maxY; y += actualStep) {
      const point = { x, y };
      if (isPointInPolygon(point, polygon)) {
        points.push(point);
      }
    }
  }
  
  return points;
}