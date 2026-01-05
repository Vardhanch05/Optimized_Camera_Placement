import { distance } from './geometry.js';

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const CLOSE_DISTANCE = 15;

// -------- Main Render Function --------

export function render(state, interaction) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw polygon
  if (state.polygon.length > 0) {
    drawPolygon(state.polygon, state.isClosed);
  }
  
  // Draw preview line
  if (!state.isClosed && interaction.previewPoint && state.polygon.length > 0) {
    drawPreviewLine(state.polygon, interaction.previewPoint);
    
    // Draw closing indicator
    if (state.polygon.length >= 3) {
      const first = state.polygon[0];
      if (distance(interaction.previewPoint, first) < CLOSE_DISTANCE) {
        drawClosingIndicator(first);
      }
    }
  }
  
  // Draw camera coverage
  if (state.coverageVisible && state.cameras.length > 0) {
    drawCoverageAreas(state.cameras);
  }
  
  // Draw cameras
  if (state.cameras.length > 0) {
    drawCameras(state.cameras, state.selectedCameraId);
  }
}

// -------- Drawing Functions --------

function drawPolygon(points, isClosed) {
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 3;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  
  if (isClosed) {
    ctx.closePath();
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
    ctx.fill();
  }
  
  ctx.stroke();
  
  // Draw vertices
  points.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? "#10b981" : "#3b82f6";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // White border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawPreviewLine(points, preview) {
  const last = points[points.length - 1];
  
  ctx.setLineDash([8, 4]);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(preview.x, preview.y);
  ctx.stroke();
  
  ctx.setLineDash([]);
}

function drawClosingIndicator(point) {
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 3;
  
  ctx.beginPath();
  ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCoverageAreas(cameras) {
  cameras.forEach(camera => {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#ef4444";
    
    ctx.beginPath();
    ctx.moveTo(camera.x, camera.y);
    
    const startAngle = (camera.angle - camera.fov / 2) * Math.PI / 180;
    const endAngle = (camera.angle + camera.fov / 2) * Math.PI / 180;
    
    ctx.arc(camera.x, camera.y, camera.range, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  });
}

function drawCameras(cameras, selectedId) {
  cameras.forEach(camera => {
    const isSelected = camera.id === selectedId;
    
    // Camera body
    ctx.fillStyle = isSelected ? "#dc2626" : "#ef4444";
    ctx.beginPath();
    ctx.arc(camera.x, camera.y, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // White border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Direction indicator
    const dirX = camera.x + Math.cos(camera.angle * Math.PI / 180) * 20;
    const dirY = camera.y + Math.sin(camera.angle * Math.PI / 180) * 20;
    
    ctx.strokeStyle = isSelected ? "#dc2626" : "#ef4444";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    
    ctx.beginPath();
    ctx.moveTo(camera.x, camera.y);
    ctx.lineTo(dirX, dirY);
    ctx.stroke();
  });
}