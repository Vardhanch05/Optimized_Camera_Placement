import { generateBoundaryCandidates, generateGridPoints, isPointInCameraView } from './geometry.js';
import { SAMPLE_STEP, COVERAGE_SAMPLE_STEP, CANDIDATE_STEP } from './config.js';

function getPointWeight(point, priorityZones = []) {
  let weight = 1;

  for (const zone of priorityZones || []) {
    const zoneLeft = Math.min(zone.x, zone.x + zone.width);
    const zoneRight = Math.max(zone.x, zone.x + zone.width);
    const zoneTop = Math.min(zone.y, zone.y + zone.height);
    const zoneBottom = Math.max(zone.y, zone.y + zone.height);

    if (point.x >= zoneLeft && point.x <= zoneRight && point.y >= zoneTop && point.y <= zoneBottom) {
      const zoneWeight = Number(zone.weight ?? 1);
      if (Number.isFinite(zoneWeight) && zoneWeight > weight) {
        weight = zoneWeight;
      }
    }
  }

  return Math.max(weight, 0.1);
}

// -------- Coverage Calculation --------

export function calculateCoverage(polygon, cameras, sampleStep = SAMPLE_STEP, priorityZones = []) {
  if (polygon.length === 0 || !cameras) return 0;
  
  const points = generateGridPoints(polygon, sampleStep);
  if (points.length === 0) return 0;
  
  let totalWeight = 0;
  let coveredWeight = 0;
  
  for (const point of points) {
    const pointWeight = getPointWeight(point, priorityZones);
    totalWeight += pointWeight;

    if (isPointCoveredByAnCamera(point, cameras, polygon)) {
      coveredWeight += pointWeight;
    }
  }
  
  if (totalWeight === 0) return 0;

  return (coveredWeight / totalWeight * 100).toFixed(1);
}

export function isPointCoveredByAnCamera(point, cameras, polygon = null) {
  for (const camera of cameras) {
    if (isPointInCameraView(point, camera, polygon)) {
      return true;
    }
  }
  return false;
}

// -------- Optimization Algorithm --------

export async function optimizeCameraPlacement(polygon, maxCameras = 10, cameraRange = 150, cameraFov = 90) {
  const candidates = generateBoundaryCandidates(polygon, CANDIDATE_STEP);

  // Sample points (universe for set-cover)
  const samplePoints = generateGridPoints(polygon, COVERAGE_SAMPLE_STEP);
  if (samplePoints.length === 0) return [];

  // Build candidate coverage sets (camera variants around each boundary candidate)
  const candidateEntries = [];
  for (const pos of candidates) {
    for (let offset = -60; offset <= 60; offset += 30) {
      const angle = (pos.angle + offset + 360) % 360;
      const cam = { x: pos.x, y: pos.y, angle, range: cameraRange, fov: cameraFov };

      const covers = new Set();
      for (let i = 0; i < samplePoints.length; i++) {
        const pt = samplePoints[i];
        if (isPointInCameraView(pt, cam, polygon)) covers.add(i);
      }

      if (covers.size > 0) {
        candidateEntries.push({ cam, covers });
      }
    }
  }

  // Greedy set-cover selection
  const uncovered = new Set(samplePoints.map((_, i) => i));
  const selected = [];

  for (let k = 0; k < maxCameras; k++) {
    let bestIdx = -1;
    let bestNewCover = null;
    let bestSize = 0;

    for (let i = 0; i < candidateEntries.length; i++) {
      const entry = candidateEntries[i];
      let newCount = 0;
      for (const idx of entry.covers) {
        if (uncovered.has(idx)) newCount++;
      }
      if (newCount > bestSize) {
        bestSize = newCount;
        bestIdx = i;
      }
    }

    if (bestIdx === -1 || bestSize === 0) break;

    const chosen = candidateEntries.splice(bestIdx, 1)[0];
    const cam = Object.assign({ id: Date.now() + Math.random() }, chosen.cam);
    selected.push(cam);

    // Remove covered indices
    for (const idx of chosen.covers) uncovered.delete(idx);

    if (uncovered.size === 0) break;
  }

  return selected;
}

function calculateNewCoverage(polygon, cameras) {
  const points = generateGridPoints(polygon, COVERAGE_SAMPLE_STEP);
  let covered = 0;
  
  for (const point of points) {
    if (isPointCoveredByAnCamera(point, cameras, polygon)) {
      covered++;
    }
  }
  
  return covered;
}