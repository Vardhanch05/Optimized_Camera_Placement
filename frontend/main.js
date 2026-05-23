import {
  AppState,
  InteractionState,
  pushState,
  undo,
  redo,
  canUndo,
  canRedo,
  addCamera,
  deleteCamera,
  getSelectedCamera,
  updateCamera
} from "./state.js";

import { render } from "./render.js";
import { distance, isPointInPolygon } from "./geometry.js";
import { calculateCoverage } from "./coverage.js";
import { uploadAndExtract, confirmExtraction, rejectExtraction, isInReviewMode } from './extractor_ui.js';

// -------- DOM Elements --------

const canvas = document.getElementById("canvas");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const optimizeBtn = document.getElementById("optimizeBtn");
const deleteCameraBtn = document.getElementById("deleteCameraBtn");
const clearBtn = document.getElementById("clearBtn");
const toggleCoverageBtn = document.getElementById("toggleCoverageBtn");
const angleSlider = document.getElementById("angleSlider");
const fovSlider = document.getElementById("fovSlider");
const rangeSlider = document.getElementById("rangeSlider");
const globalRangeSlider = document.getElementById("globalRangeSlider");
const globalFovSlider = document.getElementById("globalFovSlider");
const maxCamerasSlider = document.getElementById("maxCamerasSlider");
const priorityZonesInput = document.getElementById("priorityZonesInput");
const extractUpload = document.getElementById('extractUpload');
const extractionPanel = document.getElementById('extractionPanel');
const extractionWarnings = document.getElementById('extractionWarnings');
const confirmExtractionBtn = document.getElementById('confirmExtractionBtn');
const rejectExtractionBtn = document.getElementById('rejectExtractionBtn');

// -------- Constants --------

const CLOSE_DISTANCE = 15;

function parsePriorityZonesInput() {
  const raw = priorityZonesInput.value.trim();

  if (!raw) {
    priorityZonesInput.classList.remove("input-error");
    AppState.priorityZones = [];
    return true;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("Priority zones must be a JSON array");
    }

    const zones = parsed.map((zone, index) => {
      const parsedX = Number(zone.x);
      const parsedY = Number(zone.y);
      const parsedWidth = Number(zone.width);
      const parsedHeight = Number(zone.height);
      const parsedWeight = Number(zone.weight ?? 1);

      if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY) || !Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) {
        throw new Error(`Zone ${index + 1} must include numeric x, y, width, and height`);
      }

      return {
        x: parsedX,
        y: parsedY,
        width: parsedWidth,
        height: parsedHeight,
        weight: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1,
        label: typeof zone.label === "string" && zone.label.trim() ? zone.label.trim() : `Zone ${index + 1}`
      };
    });

    AppState.priorityZones = zones;
    priorityZonesInput.classList.remove("input-error");
    return true;
  } catch (error) {
    priorityZonesInput.classList.add("input-error");
    return false;
  }
}

// -------- Helper Functions --------

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function updateUI() {
  // Update buttons
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  optimizeBtn.disabled = !AppState.isClosed;
  deleteCameraBtn.disabled = AppState.selectedCameraId === null;
  
  // Update mode text
  document.getElementById("modeText").textContent = 
    AppState.mode === "draw" ? "Drawing Polygon" : "Placing Cameras";
  
  // Update camera count
  if (AppState.isClosed) {
    document.getElementById("cameraCount").style.display = "block";
    document.getElementById("cameraCountText").textContent = AppState.cameras.length;
  } else {
    document.getElementById("cameraCount").style.display = "none";
  }
  
  // Update coverage
  if (AppState.isClosed) {
    const coverage = calculateCoverage(AppState.polygon, AppState.cameras, undefined, AppState.priorityZones);
    document.getElementById("coverageDisplay").style.display = "block";
    document.getElementById("coverageText").textContent = coverage + "%";
  } else {
    document.getElementById("coverageDisplay").style.display = "none";
  }
  
  // Update instructions
  const instructions = document.getElementById("instructions");
  if (!AppState.isClosed) {
    instructions.innerHTML = `
      <p>• Click to add points to your polygon</p>
      <p>• Click near the first point to close the shape</p>
    `;
  } else {
    instructions.innerHTML = `
      <p>• Click inside the polygon to place cameras</p>
      <p>• Drag cameras to move them</p>
      <p>• Use arrow keys to rotate selected camera</p>
      <p>• Press Delete to remove selected camera</p>
      <p>• Click "Auto Optimize" for smart placement</p>
    `;
  }
  
  // Update camera settings panel
  const cameraSettings = document.getElementById("cameraSettings");
  const selectedCamera = getSelectedCamera();
  
  if (selectedCamera) {
    cameraSettings.style.display = "block";
    angleSlider.value = selectedCamera.angle;
    fovSlider.value = selectedCamera.fov;
    rangeSlider.value = selectedCamera.range;
    document.getElementById("angleValue").textContent = Math.round(selectedCamera.angle);
    document.getElementById("fovValue").textContent = selectedCamera.fov;
    document.getElementById("rangeValue").textContent = selectedCamera.range;
  } else {
    cameraSettings.style.display = "none";
  }
  
  // Update coverage toggle button
  document.getElementById("toggleCoverageText").textContent = 
    AppState.coverageVisible ? "Hide Coverage" : "Show Coverage";
  
  // Render canvas
  render(AppState, InteractionState);
}

// -------- Event Handlers --------

// Mouse down
canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);
  
  // If reviewing extraction, only allow vertex dragging (handled elsewhere)
  if (AppState.isReviewingExtraction) return;

  // Check if clicking on a camera
  for (const camera of AppState.cameras) {
    if (distance(pos, camera) < 15) {
      InteractionState.draggingCamera = camera.id;
      AppState.selectedCameraId = camera.id;
      updateUI();
      return;
    }
  }
  
  // Deselect camera if clicking elsewhere
  if (AppState.selectedCameraId !== null) {
    AppState.selectedCameraId = null;
    updateUI();
  }
});

// Mouse move
canvas.addEventListener("mousemove", (e) => {
  const pos = getMousePos(e);
  
  // Drag camera
  if (InteractionState.draggingCamera !== null) {
    const camera = AppState.cameras.find(c => c.id === InteractionState.draggingCamera);
    if (camera) {
      camera.x = pos.x;
      camera.y = pos.y;
      updateUI();
    }
    return;
  }
  
  // Preview line for polygon drawing
  if (AppState.mode === "draw" && !AppState.isClosed && AppState.polygon.length > 0) {
    InteractionState.previewPoint = pos;
    render(AppState, InteractionState);
  }
});

// Mouse up
canvas.addEventListener("mouseup", () => {
  if (InteractionState.draggingCamera !== null) {
    pushState();
    InteractionState.draggingCamera = null;
  }
});

// Click
canvas.addEventListener("click", (e) => {
  const pos = getMousePos(e);
  
  // Don't add point/camera if we were dragging
  if (InteractionState.draggingCamera !== null) {
    return;
  }
  
  // If reviewing extraction, restrict clicks to vertex correction handlers
  if (AppState.isReviewingExtraction) {
    // Vertex correction logic should be invoked here by existing handlers in main.js
    // For brevity we skip implementing per-vertex handlers and defer to existing functions.
    return;
  }

  // Place camera mode
  if (AppState.mode === "place" && AppState.isClosed) {
    if (isPointInPolygon(pos, AppState.polygon)) {
      pushState();
      const camera = addCamera(pos.x, pos.y);
      AppState.selectedCameraId = camera.id;
      updateUI();
    }

    // Upload handler
    if (extractUpload) {
      extractUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) uploadAndExtract(file);
      });
    }

    // Extraction panel buttons
    if (confirmExtractionBtn) confirmExtractionBtn.addEventListener('click', () => { confirmExtraction(); updateUI(); });
    if (rejectExtractionBtn) rejectExtractionBtn.addEventListener('click', () => { rejectExtraction(); updateUI(); });
    return;
  }
  
  // Draw polygon mode
  if (AppState.mode === "draw" && !AppState.isClosed) {
    // Check if closing polygon
    if (AppState.polygon.length >= 3) {
      const first = AppState.polygon[0];
      if (distance(pos, first) < CLOSE_DISTANCE) {
        pushState();
        AppState.isClosed = true;
        AppState.mode = "place";
        InteractionState.previewPoint = null;
        updateUI();
        return;
      }
    }
    
    // Add point to polygon
    pushState();
    AppState.polygon.push(pos);
    updateUI();
  }
});

// Undo button
undoBtn.addEventListener("click", () => {
  if (undo()) {
    updateUI();
  }
});

// Redo button
redoBtn.addEventListener("click", () => {
  if (redo()) {
    updateUI();
  }
});

// Optimize button
optimizeBtn.addEventListener("click", async () => {
  if (!AppState.isClosed) return;

  if (!parsePriorityZonesInput()) {
    alert("Priority zones must be valid JSON before optimizing.");
    return;
  }
  
  optimizeBtn.disabled = true;
  optimizeBtn.textContent = "Optimizing...";
  
  try {
    pushState();
    console.log('Starting optimization, polygon points:', AppState.polygon.length);

    // Call backend optimize API
    const payload = {
      polygon: AppState.polygon.map(p => ({ x: p.x, y: p.y })),
      max_cameras: AppState.maxCameras || 10,
      camera_range: AppState.globalRange || 150,
      camera_fov: AppState.globalFov || 90,
      priority_zones: AppState.priorityZones
    };

    try {
      // Use origin-relative URL so the request goes to the same origin
      // that served the page. This avoids connection issues when the
      // frontend is accessed via a forwarded/dev host.
      const backendUrl = `${location.origin}/optimize`;
      console.log('Sending optimize request to', backendUrl, payload);

      const resp = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error('Optimize API error', resp.status, err);
        alert('Optimization failed: ' + (err.detail || resp.statusText || resp.status));
        return;
      }

      const data = await resp.json();
      console.log('Optimize API response', data);

      if (data && data.success && Array.isArray(data.cameras)) {
        if (data.settings) {
          if (Number.isFinite(data.settings.max_cameras)) {
            AppState.maxCameras = data.settings.max_cameras;
            maxCamerasSlider.value = String(data.settings.max_cameras);
            document.getElementById("maxCamerasValue").textContent = data.settings.max_cameras;
          }

          if (Number.isFinite(data.settings.camera_range)) {
            AppState.globalRange = data.settings.camera_range;
            globalRangeSlider.value = String(data.settings.camera_range);
            document.getElementById("globalRangeValue").textContent = data.settings.camera_range;
          }

          if (Number.isFinite(data.settings.camera_fov)) {
            AppState.globalFov = data.settings.camera_fov;
            globalFovSlider.value = String(data.settings.camera_fov);
            document.getElementById("globalFovValue").textContent = data.settings.camera_fov;
          }
        }

        AppState.cameras = data.cameras.map(c => ({
          id: c.id ?? (Date.now() + Math.random()),
          x: c.x,
          y: c.y,
          angle: c.angle ?? 0,
          range: c.range ?? AppState.globalRange,
          fov: c.fov ?? AppState.globalFov
        }));
        AppState.selectedCameraId = null;
        updateUI();
      } else {
        console.error('Unexpected optimize response', data);
        alert('Optimization returned unexpected response');
      }
    } catch (fetchErr) {
      console.error('Network or fetch error during optimization', fetchErr);
      alert('Network error: could not reach optimizer. Is the backend running?');
    }
  } finally {
    optimizeBtn.disabled = false;
    optimizeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Auto Optimize
    `;
  }
});

// Delete camera button
deleteCameraBtn.addEventListener("click", () => {
  if (AppState.selectedCameraId !== null) {
    pushState();
    deleteCamera(AppState.selectedCameraId);
    updateUI();
  }
});

// Clear all button
clearBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear everything?")) {
    pushState();
    AppState.polygon = [];
    AppState.cameras = [];
    AppState.priorityZones = [];
    AppState.isClosed = false;
    AppState.mode = "draw";
    AppState.selectedCameraId = null;
    InteractionState.previewPoint = null;
    priorityZonesInput.value = "";
    priorityZonesInput.classList.remove("input-error");
    updateUI();
  }
});

// Toggle coverage button
toggleCoverageBtn.addEventListener("click", () => {
  AppState.coverageVisible = !AppState.coverageVisible;
  updateUI();
});

// Camera angle slider
angleSlider.addEventListener("input", (e) => {
  const selectedCamera = getSelectedCamera();
  if (selectedCamera) {
    updateCamera(selectedCamera.id, { angle: parseInt(e.target.value) });
    updateUI();
  }
});

// Camera FOV slider
fovSlider.addEventListener("input", (e) => {
  const selectedCamera = getSelectedCamera();
  if (selectedCamera) {
    updateCamera(selectedCamera.id, { fov: parseInt(e.target.value) });
    updateUI();
  }
});

// Camera range slider
rangeSlider.addEventListener("input", (e) => {
  const selectedCamera = getSelectedCamera();
  if (selectedCamera) {
    updateCamera(selectedCamera.id, { range: parseInt(e.target.value, 10) });
    updateUI();
  }
});

// Global range slider
globalRangeSlider.addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("globalRangeValue").textContent = val;
  AppState.globalRange = val;
  updateUI();
});

// Global FOV slider
globalFovSlider.addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("globalFovValue").textContent = val;
  AppState.globalFov = val;
  updateUI();
});

// Max cameras slider
maxCamerasSlider.addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("maxCamerasValue").textContent = val;
  AppState.maxCameras = val;
  updateUI();
});

priorityZonesInput.addEventListener("input", () => {
  parsePriorityZonesInput();
  updateUI();
});

// Keyboard controls
window.addEventListener("keydown", (e) => {
  const selectedCamera = getSelectedCamera();
  
  if (selectedCamera) {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      pushState();
      deleteCamera(selectedCamera.id);
      updateUI();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      updateCamera(selectedCamera.id, { 
        angle: (selectedCamera.angle - 15 + 360) % 360 
      });
      updateUI();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      updateCamera(selectedCamera.id, { 
        angle: (selectedCamera.angle + 15) % 360 
      });
      updateUI();
    }
  }
  
  // Global shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (undo()) updateUI();
    } else if (e.key === "z" && e.shiftKey || e.key === "y") {
      e.preventDefault();
      if (redo()) updateUI();
    }
  }
});

// -------- Initialize --------

updateUI();