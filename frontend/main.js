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
const globalRangeSlider = document.getElementById("globalRangeSlider");
const globalFovSlider = document.getElementById("globalFovSlider");
const maxCamerasSlider = document.getElementById("maxCamerasSlider");

// -------- Constants --------

const CLOSE_DISTANCE = 15;

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
    const coverage = calculateCoverage(AppState.polygon, AppState.cameras);
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
    document.getElementById("angleValue").textContent = Math.round(selectedCamera.angle);
    document.getElementById("fovValue").textContent = selectedCamera.fov;
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
  
  // Place camera mode
  if (AppState.mode === "place" && AppState.isClosed) {
    if (isPointInPolygon(pos, AppState.polygon)) {
      pushState();
      const camera = addCamera(pos.x, pos.y);
      AppState.selectedCameraId = camera.id;
      updateUI();
    }
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
  
  optimizeBtn.disabled = true;
  optimizeBtn.textContent = "Optimizing...";
  
  try {
    pushState();
    // Call backend optimize API
    const payload = {
      polygon: AppState.polygon.map(p => ({ x: p.x, y: p.y })),
      max_cameras: AppState.maxCameras || 10,
      camera_range: AppState.globalRange || 150,
      camera_fov: AppState.globalFov || 90
    };

    const resp = await fetch("http://localhost:8000/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert("Optimization failed: " + (err.detail || resp.statusText));
      return;
    }

    const data = await resp.json();
    if (data && data.success && Array.isArray(data.cameras)) {
      // backend returns cameras as list of {x,y,angle,range,fov,id}
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
      alert('Optimization returned unexpected response');
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
    AppState.isClosed = false;
    AppState.mode = "draw";
    AppState.selectedCameraId = null;
    InteractionState.previewPoint = null;
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