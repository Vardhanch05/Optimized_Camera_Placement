// -------- App State --------

export const AppState = {
  polygon: [],            // [{x, y}]
  isClosed: false,
  cameras: [],            // [{id, x, y, angle, range, fov}]
  priorityZones: [],      // [{x, y, width, height, weight, label}]
  selectedCameraId: null,
  mode: "draw",           // "draw" or "place"
  coverageVisible: true,
  // Global camera defaults
  globalRange: 150,
  globalFov: 90,
  maxCameras: 10
};

// -------- Interaction State (not undoable) --------

export const InteractionState = {
  isDrawing: false,
  previewPoint: null,
  draggingCamera: null
};

// -------- History --------

export const undoStack = [];
export const redoStack = [];

export function pushState() {
  undoStack.push(structuredClone(AppState));
  redoStack.length = 0;
}

export function undo() {
  if (undoStack.length === 0) return false;
  redoStack.push(structuredClone(AppState));
  Object.assign(AppState, undoStack.pop());
  return true;
}

export function redo() {
  if (redoStack.length === 0) return false;
  undoStack.push(structuredClone(AppState));
  Object.assign(AppState, redoStack.pop());
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

// -------- Camera Management --------

export function addCamera(x, y) {
  const camera = {
    id: Date.now() + Math.random(),
    x,
    y,
    angle: 0,
    range: AppState.globalRange,
    fov: AppState.globalFov
  };
  AppState.cameras.push(camera);
  return camera;
}

export function deleteCamera(id) {
  const index = AppState.cameras.findIndex(cam => cam.id === id);
  if (index !== -1) {
    AppState.cameras.splice(index, 1);
    if (AppState.selectedCameraId === id) {
      AppState.selectedCameraId = null;
    }
  }
}

export function getSelectedCamera() {
  if (AppState.selectedCameraId === null) return null;
  return AppState.cameras.find(cam => cam.id === AppState.selectedCameraId);
}

export function updateCamera(id, updates) {
  const camera = AppState.cameras.find(cam => cam.id === id);
  if (camera) {
    Object.assign(camera, updates);
  }
}

export function updateAllCamerasDefaults(range, fov) {
  // Update global defaults
  if (range !== undefined) AppState.globalRange = range;
  if (fov !== undefined) AppState.globalFov = fov;
}