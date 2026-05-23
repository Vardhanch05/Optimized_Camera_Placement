import { distance } from './geometry.js';
import { GRID_SPACING } from './config.js';

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const CLOSE_DISTANCE = 15;

// -------- Main Render Function --------

export function render(state, interaction) {
  // Ensure the canvas drawing buffer matches the displayed size so
  // mouse coordinates and rendering align. This avoids issues where CSS
  // scales the element but the canvas bitmap remains at a different size.
  const cw = Math.max(1, Math.floor(canvas.clientWidth));
  const ch = Math.max(1, Math.floor(canvas.clientHeight));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // If there's an extracted image, draw it as a background layer scaled to canvas
  if (state.extractedImage) {
    try {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(state.extractedImage, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } catch (e) {
      // ignore image draw errors
    }
  }

  drawGrid();

  if (state.priorityZones && state.priorityZones.length > 0) {
    drawPriorityZones(state.priorityZones);
  }
  
  // Draw polygon
  if (state.polygon.length > 0) {
    // If we're reviewing an extracted polygon, draw it distinctly
    if (state.isReviewingExtraction && state._extractionResult && Array.isArray(state._extractionResult.outer_polygon)) {
      const ext = state._extractionResult.outer_polygon.map(p => ({ x: p[0], y: p[1] }));
      drawExtractedPolygon(ext);
    }
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

function drawExtractedPolygon(points) {
  if (!points || points.length === 0) return;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(96,165,250,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawGrid() {
  const spacing = GRID_SPACING || 25;
  ctx.save();
  // Slightly stronger grid alpha so it's visible on most backgrounds.
  ctx.strokeStyle = 'rgba(148,163,184,0.14)';
  ctx.lineWidth = 1;

  // Vertical lines
  for (let x = 0; x <= canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }

  ctx.restore();
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

function drawPriorityZones(priorityZones) {
  priorityZones.forEach((zone, index) => {
    const weight = Number(zone.weight ?? 1);
    const intensity = Math.min(0.08 + Math.max(weight - 1, 0) * 0.08, 0.34);
    const borderAlpha = Math.min(0.35 + Math.max(weight - 1, 0) * 0.12, 0.85);
    const x = Math.min(zone.x, zone.x + zone.width);
    const y = Math.min(zone.y, zone.y + zone.height);
    const width = Math.abs(zone.width);
    const height = Math.abs(zone.height);

    ctx.save();
    ctx.fillStyle = `rgba(245, 158, 11, ${intensity})`;
    ctx.strokeStyle = `rgba(245, 158, 11, ${borderAlpha})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    ctx.font = '12px sans-serif';
    const label = zone.label || `Priority ${index + 1}`;
    const text = `${label} x${weight.toFixed(1)}`;
    const paddingX = 8;
    const paddingY = 6;
    const textWidth = ctx.measureText(text).width;
    const labelX = x + 8;
    const labelY = y + 8;
    ctx.fillRect(labelX - paddingX, labelY - 12, textWidth + paddingX * 2, 22);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(text, labelX, labelY + 3);
    ctx.restore();
  });
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