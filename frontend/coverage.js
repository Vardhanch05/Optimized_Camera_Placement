import { generateGridPoints, isPointInCameraView } from './geometry.js';
import { SAMPLE_STEP, COVERAGE_SAMPLE_STEP, CANDIDATE_STEP } from './config.js';

// -------- Coverage Calculation --------

export function calculateCoverage(polygon, cameras, sampleStep = SAMPLE_STEP) {
  if (polygon.length === 0 || !cameras) return 0;
  
  const points = generateGridPoints(polygon, sampleStep);
  if (points.length === 0) return 0;
  
  let coveredPoints = 0;
  
  for (const point of points) {
    if (isPointCoveredByAnCamera(point, cameras)) {
      coveredPoints++;
    }
  }
  
  return (coveredPoints / points.length * 100).toFixed(1);
}

export function isPointCoveredByAnCamera(point, cameras) {
  for (const camera of cameras) {
    if (isPointInCameraView(point, camera)) {
      return true;
    }
  }
  return false;
}

// -------- Optimization Algorithm --------

export async function optimizeCameraPlacement(polygon, maxCameras = 10, cameraRange = 150, cameraFov = 90) {
  const candidates = generateGridPoints(polygon, CANDIDATE_STEP);
  const cameras = [];
  
  // Greedy algorithm: iteratively place cameras that cover the most uncovered area
  for (let iteration = 0; iteration < maxCameras; iteration++) {
    let bestCamera = null;
    let bestCoverage = 0;
    
    // Try each candidate position with different angles
    for (const pos of candidates) {
      for (let angle = 0; angle < 360; angle += 45) {
        const testCamera = {
          id: Date.now() + Math.random(),
          x: pos.x,
          y: pos.y,
          angle,
          range: cameraRange,
          fov: cameraFov
        };
        
        const testCameras = [...cameras, testCamera];
        const coverage = calculateNewCoverage(polygon, testCameras);
        
        if (coverage > bestCoverage) {
          bestCoverage = coverage;
          bestCamera = testCamera;
        }
      }
    }
    
    if (bestCamera && bestCoverage > calculateNewCoverage(polygon, cameras)) {
      cameras.push(bestCamera);
    } else {
      break; // No improvement found
    }
  }
  
  return cameras;
}

function calculateNewCoverage(polygon, cameras) {
  const points = generateGridPoints(polygon, COVERAGE_SAMPLE_STEP);
  let covered = 0;
  
  for (const point of points) {
    if (isPointCoveredByAnCamera(point, cameras)) {
      covered++;
    }
  }
  
  return covered;
}