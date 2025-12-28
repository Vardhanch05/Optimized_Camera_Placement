const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

export function render(state, interaction) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  drawPolygon(state.polygon, state.isClosed)
  drawCameras(state.cameras)

  if (state.coverageVisible) {
    drawCoverage(state.coveragePoints)
  }
}

function drawPolygon(points, closed) {
  if (!points.length) return

  ctx.strokeStyle = "black"
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))

  if (closed) {
    ctx.closePath()
    ctx.fillStyle = "rgba(200,200,200,0.4)"
    ctx.fill()
  }

  ctx.stroke()
}

function drawCameras(cameras) {
  cameras.forEach(c => {
    ctx.strokeStyle = "red"
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = "red"
    ctx.beginPath()
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawCoverage(points) {
  points.forEach(p => {
    ctx.fillStyle = p.covered
      ? "rgba(0,200,0,0.25)"
      : "rgba(200,0,0,0.15)"
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4)
  })
}
