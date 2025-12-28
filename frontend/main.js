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

// Initial render
render(AppState, InteractionState)

// Undo / Redo
undoBtn.onclick = () => {
  undo()
  render(AppState, InteractionState)
}

redoBtn.onclick = () => {
  redo()
  render(AppState, InteractionState)
}

// Toggle mode with keyboard
window.addEventListener("keydown", (e) => {
  if (e.key === "c") AppState.mode = "camera"
  if (e.key === "d") AppState.mode = "draw"
})

// Mouse down
canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e)

  // CAMERA MODE
  if (AppState.mode === "camera" && AppState.isClosed) {
    pushState()
    AppState.cameras.push({
      id: crypto.randomUUID(),
      x: pos.x,
      y: pos.y,
      angle: 0,
      fov: 90,
      range: 120
    })
    render(AppState, InteractionState)
    return
  }

  // DRAW MODE
  if (AppState.mode !== "draw" || AppState.isClosed) return

  if (AppState.polygon.length >= 3) {
    const first = AppState.polygon[0]
    if (distance(pos, first) < CLOSE_DISTANCE) {
      pushState()
      AppState.isClosed = true
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

// Mouse move
canvas.addEventListener("mousemove", (e) => {
  if (!InteractionState.isDrawing || AppState.isClosed) return
  InteractionState.previewPoint = getMousePos(e)
  render(AppState, InteractionState)
})

// Mouse up
canvas.addEventListener("mouseup", () => {
  InteractionState.isDrawing = false
  InteractionState.previewPoint = null
  render(AppState, InteractionState)
})
