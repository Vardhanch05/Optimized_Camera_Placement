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
const cameraBtn = document.getElementById("cameraBtn")

const CLOSE_DISTANCE = 10

function getMousePos(e) {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

render(AppState, InteractionState)

undoBtn.onclick = () => { undo(); render(AppState, InteractionState) }
redoBtn.onclick = () => { redo(); render(AppState, InteractionState) }

cameraBtn.onclick = () => {
  AppState.mode = "camera"
}

// MOUSEDOWN
canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e)

  // CAMERA MODE
  if (AppState.mode === "camera" && AppState.isClosed) {
    pushState()
    AppState.cameras.push({
      id: crypto.randomUUID(),
      x: pos.x,
      y: pos.y,
      range: 80
    })
    render(AppState, InteractionState)
    return
  }

  // DRAW MODE
  if (AppState.isClosed) return

  if (AppState.polygon.length >= 3) {
    const first = AppState.polygon[0]
    if (distance(pos, first) < CLOSE_DISTANCE) {
      pushState()
      AppState.isClosed = true
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

// MOUSEMOVE
canvas.addEventListener("mousemove", (e) => {
  if (!InteractionState.isDrawing || AppState.isClosed) return
  InteractionState.previewPoint = getMousePos(e)
  render(AppState, InteractionState)
})

// MOUSEUP
canvas.addEventListener("mouseup", () => {
  InteractionState.isDrawing = false
  InteractionState.previewPoint = null
  render(AppState, InteractionState)
})
