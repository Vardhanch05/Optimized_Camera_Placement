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

export function getPolygonCentroid(polygon) {
  if (polygon.length === 0) {
    return { x: 0, y: 0 };
  }

  let area = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const factor = current.x * next.y - next.x * current.y;
    area += factor;
    centroidX += (current.x + next.x) * factor;
    centroidY += (current.y + next.y) * factor;
  }

  if (Math.abs(area) < 1e-6) {
    const sum = polygon.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });
    return {
      x: sum.x / polygon.length,
      y: sum.y / polygon.length
    };
  }

  const scale = 1 / (3 * area);
  return {
    x: centroidX * scale,
    y: centroidY * scale
  };
}

function pointOnSegment(point, start, end, epsilon = 1e-6) {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > epsilon) return false;

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < -epsilon) return false;

  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= squaredLength + epsilon;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-6) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(p1, p2, q1, q2) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && pointOnSegment(q1, p1, p2)) return true;
  if (o2 === 0 && pointOnSegment(q2, p1, p2)) return true;
  if (o3 === 0 && pointOnSegment(p1, q1, q2)) return true;
  if (o4 === 0 && pointOnSegment(p2, q1, q2)) return true;

  return false;
}

function lineOfSightClear(camera, point, polygon) {
  if (!polygon || polygon.length < 3) return true;

  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];

    if (pointOnSegment(camera, start, end)) {
      continue;
    }

    if (segmentsIntersect(camera, point, start, end)) {
      return false;
    }
  }

  return true;
}

export function generateBoundaryCandidates(polygon, step = 30) {
  if (polygon.length < 2) return [];

  const centroid = getPolygonCentroid(polygon);
  const candidateOffsets = [-60, -30, 0, 30, 60];
  const candidates = [];
  const seen = new Set();

  const addCandidate = (x, y, angle) => {
    const normalizedAngle = ((angle % 360) + 360) % 360;
    const key = `${x.toFixed(3)}:${y.toFixed(3)}:${normalizedAngle.toFixed(1)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x, y, angle: normalizedAngle });
  };

  // Corners are common real-world mounting points.
  for (const point of polygon) {
    const baseAngle = Math.atan2(centroid.y - point.y, centroid.x - point.x) * 180 / Math.PI;
    for (const offset of candidateOffsets) {
      addCandidate(point.x, point.y, baseAngle + offset);
    }
  }

  // Also sample along the edges so straight walls can host cameras.
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const length = distance(start, end);
    const sampleCount = Math.max(1, Math.ceil(length / step));

    for (let index = 0; index < sampleCount; index++) {
      const t = (index + 0.5) / sampleCount;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      const baseAngle = Math.atan2(centroid.y - y, centroid.x - x) * 180 / Math.PI;

      for (const offset of candidateOffsets) {
        addCandidate(x, y, baseAngle + offset);
      }
    }
  }

  return candidates;
}

export function isPointInCameraView(point, camera, polygon = null) {
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
  if (Math.abs(diff) > camera.fov / 2) return false;

  return lineOfSightClear(camera, point, polygon);
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