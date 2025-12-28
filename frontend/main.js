import {
  AppState,
  InteractionState,
  pushState,
  undo,
  redo
} from "./state.js"

import { render } from "./render.js"
import { computeCoverage } from "./coverage.js"

const canvas = document.getElementById("canvas")
const undoBtn = document.getElementById("undoBtn")
const redoBtn = document.getElementById("redoBtn")

function getMousePos(e) {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// Initial render
render(AppState, InteractionState)

// Undo / Redo
undoBtn.onclick = () => { undo(); render(AppState, InteractionState) }
redoBtn.onclick = () => { redo(); render(AppState, InteractionState) }

// Shift + Click → add camera
canvas.addEventListener("mousedown", (e) => {
  if (!AppState.isClosed) return

  if (e.shiftKey) {
    pushState()
    const pos = getMousePos(e)
    AppState.cameras.push({ ...pos, radius: 80 })

    AppState.coveragePoints = computeCoverage(
      AppState.polygon,
      AppState.cameras
    )

    render(AppState, InteractionState)
  }
})
