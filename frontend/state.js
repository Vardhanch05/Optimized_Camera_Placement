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

// Mouse down
canvas.addEventListener("mousedown", (e) => {
  if (AppState.isClosed) return

  const pos = getMousePos(e)

  // Close polygon if near first point
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
