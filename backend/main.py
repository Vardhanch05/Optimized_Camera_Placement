from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List
import uvicorn

try:
    from .optimizer import optimize_camera_placement, calculate_coverage_percentage
except ImportError:
    from optimizer import optimize_camera_placement, calculate_coverage_percentage

try:
    from .extract_models import ExtractionResponse, PriorityZone as ExtractPriorityZone
    from .extractor import extract_layout
except ImportError:
    from extract_models import ExtractionResponse, PriorityZone as ExtractPriorityZone
    from extractor import extract_layout

app = FastAPI(title="Camera Placement Optimizer API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Request Models --------

class Point(BaseModel):
    x: float
    y: float

class Camera(BaseModel):
    id: float
    x: float
    y: float
    angle: float
    range: float
    fov: float

class PriorityZone(BaseModel):
    x: float
    y: float
    width: float
    height: float
    weight: float = 1.0
    label: str | None = None

class OptimizeRequest(BaseModel):
    polygon: List[Point]
    max_cameras: int = 10
    camera_range: float = 150.0
    camera_fov: float = 90.0
    priority_zones: List[PriorityZone] = Field(default_factory=list)

class CoverageRequest(BaseModel):
    polygon: List[Point]
    cameras: List[Camera]
    priority_zones: List[PriorityZone] = Field(default_factory=list)

# -------- Endpoints --------

# Serve frontend static files so the app can be opened from the same origin.
# This avoids cross-origin connection issues when the frontend fetches the API.
import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
INDEX_FILE = FRONTEND_DIR / "index.html"
if FRONTEND_DIR.exists():
    # Mount static assets under /static to avoid capturing API routes.
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    # Serve index.html at root so the UI is available at '/'. Use FileResponse
    # to ensure POST routes (like /optimize) are still handled by FastAPI.
    @app.get("/")
    def root_index():
        return FileResponse(INDEX_FILE)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "message": "Camera Placement Optimizer API is running",
        "version": "1.0.0"
    }

@app.post("/optimize")
def optimize(request: OptimizeRequest):
    """
    Optimize camera placement for a given polygon.
    
    Args:
        polygon: List of points defining the area boundary
        max_cameras: Maximum number of cameras to place (1-20)
        camera_range: Detection range of each camera in pixels (50-300)
        camera_fov: Field of view in degrees (30-180)
    
    Returns:
        List of optimally placed cameras with their configurations
    """
    try:
        if len(request.polygon) < 3:
            raise HTTPException(
                status_code=400, 
                detail="Polygon must have at least 3 points"
            )
        
        if not (1 <= request.max_cameras <= 20):
            raise HTTPException(
                status_code=400,
                detail="max_cameras must be between 1 and 20"
            )
        
        if not (50 <= request.camera_range <= 300):
            raise HTTPException(
                status_code=400,
                detail="camera_range must be between 50 and 300"
            )
        
        if not (30 <= request.camera_fov <= 180):
            raise HTTPException(
                status_code=400,
                detail="camera_fov must be between 30 and 180"
            )
        
        polygon_coords = [(p.x, p.y) for p in request.polygon]
        
        cameras = optimize_camera_placement(
            polygon=polygon_coords,
            max_cameras=request.max_cameras,
            camera_range=request.camera_range,
            camera_fov=request.camera_fov,
            priority_zones=[zone.model_dump() for zone in request.priority_zones],
        )
        
        # Calculate coverage for the optimized placement
        coverage = calculate_coverage_percentage(
            polygon_coords,
            cameras,
            priority_zones=[zone.model_dump() for zone in request.priority_zones],
        )
        
        return {
            "success": True,
            "cameras": cameras,
            "num_cameras": len(cameras),
            "coverage": coverage,
            "settings": {
                "max_cameras": request.max_cameras,
                "camera_range": request.camera_range,
                "camera_fov": request.camera_fov
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization error: {str(e)}")

@app.post("/coverage")
def calculate_coverage(request: CoverageRequest):
    """
    Calculate coverage percentage for given cameras and polygon.
    
    Args:
        polygon: List of points defining the area boundary
        cameras: List of camera positions and orientations
    
    Returns:
        Coverage percentage and detailed statistics
    """
    try:
        if len(request.polygon) < 3:
            raise HTTPException(
                status_code=400,
                detail="Polygon must have at least 3 points"
            )
        
        polygon_coords = [(p.x, p.y) for p in request.polygon]
        cameras_data = [
            {
                'x': c.x,
                'y': c.y,
                'angle': c.angle,
                'range': c.range,
                'fov': c.fov
            }
            for c in request.cameras
        ]
        
        coverage = calculate_coverage_percentage(
            polygon_coords,
            cameras_data,
            priority_zones=[zone.model_dump() for zone in request.priority_zones],
        )
        
        return {
            "success": True,
            "coverage": coverage,
            "num_cameras": len(cameras_data),
            "polygon_points": len(polygon_coords)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coverage calculation error: {str(e)}")


@app.post("/extract", response_model=ExtractionResponse)
def extract(file: UploadFile = File(...)):
    """
    Extract floor-plan layout from uploaded image.
    Accepts multipart file upload (PNG, JPEG, WEBP), max 10MB.
    """
    try:
        if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
            raise HTTPException(status_code=400, detail="Unsupported file type. Allowed: PNG, JPEG, WEBP")

        # Read contents and validate size
        contents = file.file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 10MB")

        try:
            import numpy as np
            import cv2
        except Exception:
            raise HTTPException(status_code=500, detail="Server missing image dependencies (cv2). Install required packages")

        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        result = extract_layout(img)

        # Map suggested priority zones to model type if needed
        zones = []
        for z in result.get("suggested_priority_zones", []):
            try:
                zp = ExtractPriorityZone(**z)
                zones.append(zp)
            except Exception:
                # keep as raw dict if conversion fails
                pass

        return {
            "outer_polygon": result.get("outer_polygon", []),
            "inner_polygons": result.get("inner_polygons", []),
            "suggested_priority_zones": result.get("suggested_priority_zones", []),
            "canvas_width": int(result.get("canvas_width", 800)),
            "canvas_height": int(result.get("canvas_height", 600)),
            "warnings": result.get("warnings", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction error: {str(e)}")

# -------- Run Server --------

if __name__ == "__main__":
    print("🚀 Starting Camera Placement Optimizer API...")
    print("📍 Server will be available at: http://localhost:8000")
    print("📚 API documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)