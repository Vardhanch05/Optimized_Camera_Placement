// -------- App State --------

export const AppState = {
  polygon: [],            // [{x, y}]
  isClosed: false,        // 👈 NEW
  cameras: [],
  selectedCameraId: null,
  mode: "draw",
  coverageVisible: true
}

// -------- Interaction (not undoable) --------

export const InteractionState = {
  isDrawing: false,
  previewPoint: null
}

// -------- History --------

export const undoStack = []
export const redoStack = []

export function pushState() {
  undoStack.push(structuredClone(AppState))
  redoStack.length = 0
}

export function undo() {
  if (undoStack.length === 0) return
  redoStack.push(structuredClone(AppState))
  Object.assign(AppState, undoStack.pop())
}

export function redo() {
  if (redoStack.length === 0) return
  undoStack.push(structuredClone(AppState))
  Object.assign(AppState, redoStack.pop())
}
