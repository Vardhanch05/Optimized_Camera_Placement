export const AppState = {
  polygon: [],
  isClosed: false,

  cameras: [],            // {id, x, y, range}
  selectedCameraId: null,

  mode: "draw"            // draw | camera
}

export const InteractionState = {
  isDrawing: false,
  previewPoint: null
}

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
