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

render(AppState, InteractionState)

undoBtn.onclick = () => {
  undo()
  render(AppState, InteractionState)
}

redoBtn.onclick = () => {
  redo()
  render(AppState, InteractionState)
}

/* CLICK = ADD VERTEX */
canvas.addEventListener("click", (e) => {
  if (AppState.isClosed) return

  const pos = getMousePos(e)

  if (AppState.polygon.length >= 3) {
    const first = AppState.polygon[0]
    if (distance(pos, first) < CLOSE_DISTANCE) {
      pushState()
      AppState.isClosed = true
      InteractionState.previewPoint = null
      render(AppState, InteractionState)
      return
    }
  }

  pushState()
  AppState.polygon.push(pos)
  render(AppState, InteractionState)
})

/* MOVE = PREVIEW */
canvas.addEventListener("mousemove", (e) => {
  if (AppState.isClosed) return
  InteractionState.previewPoint = getMousePos(e)
  render(AppState, InteractionState)
})
