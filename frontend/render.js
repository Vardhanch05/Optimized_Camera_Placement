const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

export function render(state, interaction) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  drawPolygon(state.polygon, state.isClosed)
  drawCameras(state.cameras)

  if (!state.isClosed && interaction.isDrawing && interaction.previewPoint) {
    drawPreview(state.polygon, interaction.previewPoint)
  }
}

function drawPolygon(points, isClosed) {
  if (points.length === 0) return

  ctx.strokeStyle = "black"
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))

  if (isClosed) {
    ctx.closePath()
    ctx.fillStyle = "rgba(200,200,200,0.4)"
    ctx.fill()
  }

  ctx.stroke()

  points.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? "green" : "blue"
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawPreview(points, preview) {
  if (points.length === 0) return
  const last = points[points.length - 1]

  ctx.setLineDash([6, 6])
  ctx.strokeStyle = "#888"
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(preview.x, preview.y)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawCameras(cameras) {
  cameras.forEach(cam => {
    ctx.fillStyle = "red"
    ctx.beginPath()
    ctx.arc(cam.x, cam.y, 6, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = "rgba(255,0,0,0.3)"
    ctx.beginPath()
    ctx.arc(cam.x, cam.y, cam.range, 0, Math.PI * 2)
    ctx.stroke()
  })
}
