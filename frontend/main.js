import {
  AppState,
  InteractionState,
  pushState,
  undo,
  redo
} from "./state.js"

import { render } from "./render.js"

const canvas = document.getElementById("canvas")
const undoBtn = document.getElementById("undoBtn")
const redoBtn = document.getElementById("redoBtn")

const CLOSE_DISTANCE = 10

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// ---------------- Initial Render ----------------
render(AppState, InteractionState)

// ---------------- Undo / Redo ----------------
undoBtn.onclick = () => {
  undo()
  render(AppState, InteractionState)
}

redoBtn.onclick = () => {
  redo()
  render(AppState, InteractionState)
}

// ---------------- Mouse Down ----------------
canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e)

  // CAMERA MODE
  if (AppState.mode === "camera") {
    pushState()
    AppState.cameras.push({
      id: crypto.randomUUID(),
      x: pos.x,
      y: pos.y
    })
    render(AppState, InteractionState)
    return
  }

  // DRAW MODE
  if (AppState.isClosed) return

  // Close polygon
  if (AppState.polygon.length >= 3) {
    const first = AppState.polygon[0]
    if (distance(pos, first) < CLOSE_DISTANCE) {
      pushState()
      AppState.isClosed = true
      AppState.mode = "camera"
      InteractionState.isDrawing = false
      InteractionState.previewPoint = null
      render(AppState, InteractionState)
      return
    }
  }

  pushState()
  AppState.polygon.push(pos)

  InteractionState.isDrawing = true
  InteractionState.previewPoint = pos
  render(AppState, InteractionState)
})

// ---------------- Mouse Move ----------------
canvas.addEventListener("mousemove", (e) => {
  if (!InteractionState.isDrawing || AppState.isClosed) return
  InteractionState.previewPoint = getMousePos(e)
  render(AppState, InteractionState)
})

// ---------------- Mouse Up ----------------
canvas.addEventListener("mouseup", () => {
  InteractionState.isDrawing = false
  InteractionState.previewPoint = null
  render(AppState, InteractionState)
})
