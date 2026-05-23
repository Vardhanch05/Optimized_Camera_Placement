import { AppState, pushState } from './state.js';
import { render } from './render.js';

export async function uploadAndExtract(file) {
  if (!file) return;
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
    img.onload = () => {
      AppState.extractedImage = img;
      AppState.extractionWarnings = data.warnings || [];
      // Temporarily store extraction result on AppState for review
      AppState._extractionResult = data;
      AppState.isReviewingExtraction = true;
      render(AppState, {});
    };

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
  // Load outer polygon
  if (Array.isArray(data.outer_polygon) && data.outer_polygon.length > 0) {
    AppState.polygon = data.outer_polygon.map(p => ({ x: p[0], y: p[1] }));
    AppState.isClosed = true;
    AppState.mode = 'place';
  }

  // Load priority zones
  if (Array.isArray(data.suggested_priority_zones)) {
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
  render(AppState, {});
}

export function rejectExtraction() {
  AppState.isReviewingExtraction = false;
  AppState.extractedImage = null;
  AppState.extractionWarnings = [];
  AppState._extractionResult = null;
  render(AppState, {});
}

// Vertex correction hooks will call existing functions in main.js; we expose
// simple helpers to check review mode.
export function isInReviewMode() {
  return AppState.isReviewingExtraction === true;
}
