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
import {
  uploadAndExtract,
  uploadAndExtractRooms,
  confirmExtraction,
  rejectExtraction,
  isInReviewMode,
  beginReviewVertexDrag,
  updateReviewVertexDrag,
  endReviewVertexDrag,
  insertReviewVertexAtPoint,
  deleteReviewVertexAtPoint
} from "./extractor_ui.js";

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
const extractionModeInputs = document.querySelectorAll('input[name="extractionMode"]');
const extractBtn = document.getElementById("extractBtn");
const extractUpload = document.getElementById("extractUpload");
const extractionPanel = document.getElementById("extractionPanel");
const extractionStats = document.getElementById("extractionStats");
const extractionLoading = document.getElementById("extractionLoading");
const extractionWarnings = document.getElementById("extractionWarnings");
const confirmExtractionBtn = document.getElementById("confirmExtractionBtn");
const rejectExtractionBtn = document.getElementById("rejectExtractionBtn");

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
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  optimizeBtn.disabled = AppState.isReviewingExtraction || (AppState.isRoomExtractionMode ? AppState.rooms.length === 0 : !AppState.isClosed);
  deleteCameraBtn.disabled = AppState.selectedCameraId === null;

  const modeText = document.getElementById("modeText");
  if (AppState.isReviewingExtraction) {
    modeText.textContent = "Reviewing Extraction";
  } else if (AppState.isRoomExtractionMode) {
    modeText.textContent = "Room-by-room mode";
  } else {
    modeText.textContent = AppState.mode === "draw" ? "Drawing Polygon" : "Placing Cameras";
  }

  if (AppState.isRoomExtractionMode) {
    document.getElementById("cameraCount").style.display = AppState.rooms.length > 0 ? "block" : "none";
    document.getElementById("cameraCountText").textContent = AppState.cameras.length;
  } else if (AppState.isClosed) {
    document.getElementById("cameraCount").style.display = "block";
    document.getElementById("cameraCountText").textContent = AppState.cameras.length;
  } else {
    document.getElementById("cameraCount").style.display = "none";
  }

  if (AppState.isRoomExtractionMode) {
    const coverageValue = Number.isFinite(AppState.totalRoomCoverage) ? AppState.totalRoomCoverage : 0;
    document.getElementById("coverageDisplay").style.display = AppState.rooms.length > 0 ? "block" : "none";
    document.getElementById("coverageText").textContent = `${Math.round(coverageValue * 100)}%`;
  } else if (AppState.isClosed) {
    const coverage = calculateCoverage(AppState.polygon, AppState.cameras, undefined, AppState.priorityZones);
    document.getElementById("coverageDisplay").style.display = "block";
    document.getElementById("coverageText").textContent = coverage + "%";
  } else {
    document.getElementById("coverageDisplay").style.display = "none";
  }

  const instructions = document.getElementById("instructions");
  if (AppState.isReviewingExtraction) {
    instructions.innerHTML = `
      <p>• Drag a vertex to adjust the extracted outline</p>
      <p>• Click an edge to insert a new vertex</p>
      <p>• Right-click a vertex to delete it</p>
      <p>• Confirm when the outline looks correct</p>
    `;
  } else if (!AppState.isClosed) {
    instructions.innerHTML = `
      <p>• Click to add points to your polygon</p>
      <p>• Click near the first point to close the shape</p>
      <p>• Define weighted rectangles to prioritize doors or corridors</p>
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

  const cameraSettings = document.getElementById("cameraSettings");
  const selectedCamera = getSelectedCamera();

  if (selectedCamera && !AppState.isReviewingExtraction) {
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

  document.getElementById("toggleCoverageText").textContent =
    AppState.coverageVisible ? "Hide Coverage" : "Show Coverage";

  if (extractionPanel) {
    extractionPanel.style.display = AppState.isReviewingExtraction || AppState.extractionPending ? "block" : "none";
  }

  if (extractionStats) {
    if (AppState.isRoomExtractionMode && (AppState.isReviewingExtraction || AppState.rooms.length > 0)) {
      extractionStats.style.display = "block";
      extractionStats.textContent = `Rooms: ${AppState.rooms.length} · Doorways: ${AppState.doorways.length}`;
    } else {
      extractionStats.style.display = "none";
      extractionStats.textContent = "";
    }
  }

  if (extractionLoading) {
    extractionLoading.style.display = AppState.extractionPending ? "flex" : "none";
  }

  if (extractionWarnings) {
    const warnings = Array.isArray(AppState.extractionWarnings) ? AppState.extractionWarnings : [];
    if (warnings.length > 0) {
      extractionWarnings.style.display = "block";
      extractionWarnings.innerHTML = warnings.map(message => `<div>• ${message}</div>`).join("");
    } else {
      extractionWarnings.style.display = "none";
      extractionWarnings.innerHTML = "";
    }
  }

  render(AppState, InteractionState);
}

// -------- Event Handlers --------

canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);

  if (isInReviewMode()) {
    if (e.button === 0) {
      beginReviewVertexDrag(pos);
    }
    return;
  }

  for (const camera of AppState.cameras) {
    if (distance(pos, camera) < 15) {
      InteractionState.draggingCamera = camera.id;
      AppState.selectedCameraId = camera.id;
      updateUI();
      return;
    }
  }

  if (AppState.selectedCameraId !== null) {
    AppState.selectedCameraId = null;
    updateUI();
  }
});

canvas.addEventListener("mousemove", (e) => {
  const pos = getMousePos(e);

  if (isInReviewMode()) {
    updateReviewVertexDrag(pos);
    return;
  }

  if (InteractionState.draggingCamera !== null) {
    const camera = AppState.cameras.find(c => c.id === InteractionState.draggingCamera);
    if (camera) {
      camera.x = pos.x;
      camera.y = pos.y;
      updateUI();
    }
    return;
  }

  if (AppState.isRoomExtractionMode) {
    return;
  }

  if (AppState.mode === "draw" && !AppState.isClosed && AppState.polygon.length > 0) {
    InteractionState.previewPoint = pos;
    render(AppState, InteractionState);
  }
});

canvas.addEventListener("mouseup", () => {
  if (isInReviewMode()) {
    if (endReviewVertexDrag()) {
      updateUI();
    }
    return;
  }

  if (InteractionState.draggingCamera !== null) {
    pushState();
    InteractionState.draggingCamera = null;
  }
});

canvas.addEventListener("click", (e) => {
  const pos = getMousePos(e);

  if (InteractionState.draggingCamera !== null) {
    return;
  }

  if (isInReviewMode()) {
    if (InteractionState.reviewPointerDownOnVertex) {
      InteractionState.reviewPointerDownOnVertex = false;
      return;
    }

    if (insertReviewVertexAtPoint(pos)) {
      updateUI();
    }
    return;
  }

  if (AppState.isRoomExtractionMode) {
    return;
  }

  if (AppState.mode === "place" && AppState.isClosed) {
    if (isPointInPolygon(pos, AppState.polygon)) {
      pushState();
      const camera = addCamera(pos.x, pos.y);
      AppState.selectedCameraId = camera.id;
      updateUI();
    }
    return;
  }

  if (AppState.mode === "draw" && !AppState.isClosed) {
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

    pushState();
    AppState.polygon.push(pos);
    updateUI();
  }
});

canvas.addEventListener("contextmenu", (e) => {
  if (!isInReviewMode()) return;
  e.preventDefault();
  const pos = getMousePos(e);
  if (deleteReviewVertexAtPoint(pos)) {
    updateUI();
  }
});

undoBtn.addEventListener("click", () => {
  if (undo()) {
    updateUI();
  }
});

redoBtn.addEventListener("click", () => {
  if (redo()) {
    updateUI();
  }
});

optimizeBtn.addEventListener("click", async () => {
  if (AppState.isReviewingExtraction) return;
  if (!AppState.isRoomExtractionMode && !AppState.isClosed) return;
  if (AppState.isRoomExtractionMode && AppState.rooms.length === 0) return;

  if (!parsePriorityZonesInput()) {
    alert("Priority zones must be valid JSON before optimizing.");
    return;
  }

  optimizeBtn.disabled = true;
  optimizeBtn.textContent = "Optimizing...";

  try {
    pushState();

    const backendUrl = AppState.isRoomExtractionMode ? `${location.origin}/optimize-rooms` : `${location.origin}/optimize`;
    const payload = AppState.isRoomExtractionMode
      ? {
          rooms: AppState.rooms,
          wall_segments: AppState.wallSegments,
          doorways: AppState.doorways,
          camera_settings: {
            max_cameras: AppState.maxCameras || 10,
            camera_range: AppState.globalRange || 150,
            camera_fov: AppState.globalFov || 90
          }
        }
      : {
          polygon: AppState.polygon.map(p => ({ x: p.x, y: p.y })),
          max_cameras: AppState.maxCameras || 10,
          camera_range: AppState.globalRange || 150,
          camera_fov: AppState.globalFov || 90,
          priority_zones: AppState.priorityZones
        };

    const resp = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert('Optimization failed: ' + (err.detail || resp.statusText || resp.status));
      return;
    }

    const data = await resp.json();
    if (AppState.isRoomExtractionMode && data && Array.isArray(data.cameras)) {
      AppState.cameras = data.cameras.map(c => ({
        id: c.id ?? (Date.now() + Math.random()),
        x: c.x,
        y: c.y,
        angle: c.angle ?? 0,
        range: c.range ?? AppState.globalRange,
        fov: c.fov ?? AppState.globalFov,
        room_id: c.room_id || null
      }));
      AppState.roomCoverageByRoom = data.coverage_by_room || {};
      AppState.totalRoomCoverage = Number.isFinite(data.total_coverage) ? data.total_coverage : 0;
      AppState.selectedCameraId = null;
      updateUI();
    } else if (data && data.success && Array.isArray(data.cameras)) {
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
      alert('Optimization returned unexpected response');
    }
  } catch (fetchErr) {
    alert('Network error: could not reach optimizer. Is the backend running?');
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

deleteCameraBtn.addEventListener("click", () => {
  if (AppState.selectedCameraId !== null) {
    pushState();
    deleteCamera(AppState.selectedCameraId);
    updateUI();
  }
});

clearBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear everything?")) {
    pushState();
    AppState.polygon = [];
    AppState.cameras = [];
    AppState.priorityZones = [];
    AppState.rooms = [];
    AppState.wallSegments = [];
    AppState.doorways = [];
    AppState.isClosed = false;
    AppState.mode = "draw";
    AppState.selectedCameraId = null;
    AppState.extractedImage = null;
    AppState.extractionWarnings = [];
    AppState.isReviewingExtraction = false;
    AppState._extractionResult = null;
    AppState.roomCoverageByRoom = {};
    AppState.totalRoomCoverage = 0;
    InteractionState.previewPoint = null;
    InteractionState.reviewDraggingVertexIndex = null;
    InteractionState.reviewPointerDownOnVertex = false;
    priorityZonesInput.value = "";
    priorityZonesInput.classList.remove("input-error");
    updateUI();
  }
});

toggleCoverageBtn.addEventListener("click", () => {
  AppState.coverageVisible = !AppState.coverageVisible;
  updateUI();
});

angleSlider.addEventListener("input", (e) => {
  const selectedCamera = getSelectedCamera();
  if (selectedCamera) {
    updateCamera(selectedCamera.id, { angle: parseInt(e.target.value) });
    updateUI();
  }
});

fovSlider.addEventListener("input", (e) => {
  const selectedCamera = getSelectedCamera();
  if (selectedCamera) {
    updateCamera(selectedCamera.id, { fov: parseInt(e.target.value) });
    updateUI();
  }
});

rangeSlider.addEventListener("input", (e) => {
  const selectedCamera = getSelectedCamera();
  if (selectedCamera) {
    updateCamera(selectedCamera.id, { range: parseInt(e.target.value, 10) });
    updateUI();
  }
});

globalRangeSlider.addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("globalRangeValue").textContent = val;
  AppState.globalRange = val;
  updateUI();
});

globalFovSlider.addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("globalFovValue").textContent = val;
  AppState.globalFov = val;
  updateUI();
});

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

if (extractBtn && extractUpload) {
  extractBtn.addEventListener("click", () => extractUpload.click());
}

if (extractUpload) {
  extractUpload.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const extractor = AppState.isRoomExtractionMode ? uploadAndExtractRooms : uploadAndExtract;
      extractor(file)
        .then(() => updateUI())
        .catch(() => updateUI());
    }
  });
}

if (extractionModeInputs) {
  extractionModeInputs.forEach(input => {
    input.addEventListener("change", () => {
      AppState.isRoomExtractionMode = input.value === "rooms" && input.checked;
      if (!AppState.isRoomExtractionMode) {
        AppState.rooms = [];
        AppState.wallSegments = [];
        AppState.doorways = [];
        AppState.roomCoverageByRoom = {};
        AppState.totalRoomCoverage = 0;
      }
      updateUI();
    });
  });
}

if (confirmExtractionBtn) {
  confirmExtractionBtn.addEventListener("click", () => {
    confirmExtraction();
    updateUI();
  });
}

if (rejectExtractionBtn) {
  rejectExtractionBtn.addEventListener("click", () => {
    rejectExtraction();
    updateUI();
  });
}

window.addEventListener("keydown", (e) => {
  if (isInReviewMode()) return;

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

  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (undo()) updateUI();
    } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
      e.preventDefault();
      if (redo()) updateUI();
    }
  }
});

// -------- Initialize --------

updateUI();
