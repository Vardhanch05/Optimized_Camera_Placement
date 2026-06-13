import { AppState, InteractionState, pushState } from './state.js';
import { render } from './render.js';
import { distance } from './geometry.js';

const VERTEX_HIT_RADIUS = 12;
const EDGE_HIT_DISTANCE = 10;

function setExtractionWorkingPolygon(data) {
  if (Array.isArray(data.outer_polygon) && data.outer_polygon.length > 0) {
    const points = data.outer_polygon.map(([x, y]) => ({ x, y }));
    const first = points[0];
    const last = points[points.length - 1];
    if (first && last && first.x === last.x && first.y === last.y) {
      points.pop();
    }
    AppState.polygon = points;
    AppState.polygonClosed = true;
    AppState.isClosed = true;
    AppState.mode = 'draw';
  } else {
    AppState.polygon = [];
    AppState.polygonClosed = false;
    AppState.isClosed = false;
    AppState.mode = 'draw';
  }
}

function setExtractionWorkingRooms(data) {
  AppState.rooms = Array.isArray(data.rooms) ? data.rooms : [];
  AppState.wallSegments = Array.isArray(data.wall_segments) ? data.wall_segments : [];
  AppState.doorways = Array.isArray(data.doorways) ? data.doorways : [];
  AppState.polygon = [];
  AppState.polygonClosed = false;
  AppState.isClosed = false;
  AppState.mode = 'place';
  AppState.isRoomExtractionMode = true;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projected = { x: start.x + t * dx, y: start.y + t * dy };
  return distance(point, projected);
}

function findNearestVertexIndex(point) {
  if (!Array.isArray(AppState.polygon) || AppState.polygon.length === 0) return -1;
  let bestIndex = -1;
  let bestDistance = VERTEX_HIT_RADIUS;
  for (let index = 0; index < AppState.polygon.length; index++) {
    const currentDistance = distance(point, AppState.polygon[index]);
    if (currentDistance <= bestDistance) {
      bestDistance = currentDistance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function findNearestEdgeIndex(point) {
  if (!Array.isArray(AppState.polygon) || AppState.polygon.length < 2) return -1;
  let bestIndex = -1;
  let bestDistance = EDGE_HIT_DISTANCE;
  for (let index = 0; index < AppState.polygon.length; index++) {
    const start = AppState.polygon[index];
    const end = AppState.polygon[(index + 1) % AppState.polygon.length];
    const currentDistance = pointToSegmentDistance(point, start, end);
    if (currentDistance <= bestDistance) {
      bestDistance = currentDistance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function clampPolygonMinimumVertices() {
  if (AppState.polygon.length < 3) {
    AppState.isClosed = false;
    AppState.mode = 'draw';
  }
}

export async function uploadAndExtract(file) {
  if (!file) return;
  if (AppState.isRoomExtractionMode) {
    return uploadAndExtractRooms(file);
  }
  AppState.extractionPending = true;
  render(AppState, {});

  try {
    const form = new FormData();
    form.append('file', file, file.name);

    const resp = await fetch(`${location.origin}/extract`, {
      method: 'POST',
      body: form
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert('Extraction failed: ' + (err.detail || resp.statusText || resp.status));
      return;
    }

    const data = await resp.json();
    // Store image as HTMLImageElement for rendering background
    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Uploaded image could not be loaded for review"));
    });

    AppState.extractedImage = img;
    AppState.extractionWarnings = data.warnings || [];
    // Temporarily store extraction result on AppState for review
    AppState._extractionResult = data;
    setExtractionWorkingPolygon(data);
    AppState.isReviewingExtraction = true;
    InteractionState.reviewDraggingVertexIndex = null;
    InteractionState.reviewPointerDownOnVertex = false;
    render(AppState, {});

  } catch (e) {
    console.error('Extraction error', e);
    alert('Extraction error: ' + e.message);
  } finally {
    AppState.extractionPending = false;
    render(AppState, {});
  }
}

export async function uploadAndExtractRooms(file) {
  if (!file) return;
  AppState.extractionPending = true;
  render(AppState, {});

  try {
    const form = new FormData();
    form.append('file', file, file.name);

    const resp = await fetch(`${location.origin}/extract-rooms`, {
      method: 'POST',
      body: form
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert('Extraction failed: ' + (err.detail || resp.statusText || resp.status));
      return;
    }

    const data = await resp.json();
    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Uploaded image could not be loaded for review"));
    });

    AppState.extractedImage = img;
    AppState.extractionWarnings = data.warnings || [];
    AppState._extractionResult = data;
    setExtractionWorkingRooms(data);
    AppState.isReviewingExtraction = true;
    InteractionState.reviewDraggingVertexIndex = null;
    InteractionState.reviewPointerDownOnVertex = false;
    render(AppState, {});
  } catch (e) {
    console.error('Extraction error', e);
    alert('Extraction error: ' + e.message);
  } finally {
    AppState.extractionPending = false;
    render(AppState, {});
  }
}

export function confirmExtraction() {
  const data = AppState._extractionResult;
  if (!data) return;

  pushState();
  if (AppState.isRoomExtractionMode) {
    AppState.rooms = Array.isArray(data.rooms) ? data.rooms : [];
    AppState.wallSegments = Array.isArray(data.wall_segments) ? data.wall_segments : [];
    AppState.doorways = Array.isArray(data.doorways) ? data.doorways : [];
    AppState.polygon = [];
    AppState.isClosed = false;
    AppState.polygonClosed = false;
    AppState.mode = 'place';
  } else {
    AppState.isClosed = Array.isArray(AppState.polygon) && AppState.polygon.length >= 3;
    AppState.polygonClosed = AppState.isClosed === true;
    AppState.mode = 'place';
  }
  InteractionState.previewPoint = null;

  // Load priority zones
  if (!AppState.isRoomExtractionMode && Array.isArray(data.suggested_priority_zones)) {
    AppState.priorityZones = data.suggested_priority_zones.map(z => ({
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      weight: z.weight ?? 1,
      label: z.label ?? 'Suggested'
    }));
  }

  AppState.isReviewingExtraction = false;
  AppState.extractedImage = null;
  AppState._extractionResult = null;
  AppState.extractionWarnings = [];
  InteractionState.reviewDraggingVertexIndex = null;
  InteractionState.reviewPointerDownOnVertex = false;
  render(AppState, {});
}

export function rejectExtraction() {
  AppState.isReviewingExtraction = false;
  AppState.extractedImage = null;
  AppState.extractionWarnings = [];
  AppState._extractionResult = null;
  AppState.polygon = [];
  AppState.rooms = [];
  AppState.wallSegments = [];
  AppState.doorways = [];
  AppState.polygonClosed = false;
  AppState.isClosed = false;
  AppState.mode = 'draw';
  InteractionState.reviewDraggingVertexIndex = null;
  InteractionState.reviewPointerDownOnVertex = false;
  render(AppState, {});
}

export function isInReviewMode() {
  return AppState.isReviewingExtraction === true;
}

export function beginReviewVertexDrag(point) {
  if (!isInReviewMode()) return false;
  const vertexIndex = findNearestVertexIndex(point);
  if (vertexIndex === -1) return false;
  InteractionState.reviewDraggingVertexIndex = vertexIndex;
  InteractionState.reviewPointerDownOnVertex = true;
  return true;
}

export function updateReviewVertexDrag(point) {
  if (!isInReviewMode()) return false;
  const vertexIndex = InteractionState.reviewDraggingVertexIndex;
  if (vertexIndex === null || vertexIndex === undefined) return false;
  AppState.polygon[vertexIndex] = { x: point.x, y: point.y };
  render(AppState, {});
  return true;
}

export function endReviewVertexDrag() {
  if (InteractionState.reviewDraggingVertexIndex === null || InteractionState.reviewDraggingVertexIndex === undefined) return false;
  pushState();
  InteractionState.reviewDraggingVertexIndex = null;
  render(AppState, {});
  return true;
}

export function insertReviewVertexAtPoint(point) {
  if (!isInReviewMode() || AppState.polygon.length < 2) return false;
  const edgeIndex = findNearestEdgeIndex(point);
  if (edgeIndex === -1) return false;
  pushState();
  AppState.polygon.splice(edgeIndex + 1, 0, { x: point.x, y: point.y });
  render(AppState, {});
  return true;
}

export function deleteReviewVertexAtPoint(point) {
  if (!isInReviewMode() || AppState.polygon.length <= 3) return false;
  const vertexIndex = findNearestVertexIndex(point);
  if (vertexIndex === -1) return false;
  pushState();
  AppState.polygon.splice(vertexIndex, 1);
  clampPolygonMinimumVertices();
  render(AppState, {});
  return true;
}
