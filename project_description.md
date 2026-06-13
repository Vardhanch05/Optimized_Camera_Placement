# Project Description

## Overview

This repository is an interactive camera placement optimizer for floor plans and custom indoor layouts. The app supports two main workflows:

1. **Single-Area Mode**: The user manually draws a polygon that represents the room, building, or other protected area, optionally adds weighted priority zones, and runs the optimizer.
2. **Blueprint Mode**: The user uploads a floor-plan image. The system automatically extracts structural walls, identifies individual rooms as enclosed regions, and places cameras room-by-room while respecting all walls.

The project has two main halves:

- A browser-based frontend built with HTML, CSS, and vanilla JavaScript.
- An optional FastAPI backend written in Python that performs optimization, coverage calculations, and blueprint extraction.

The frontend can run by itself for manual editing and visualization, but the backend is required for the automatic optimizer and blueprint extraction.

## What the App Does

### Single-Area Workflow

The traditional workflow is:

1. The user draws a polygon that represents the room, building, or other protected area.
2. The user can optionally add weighted priority zones, which are rectangular regions that should receive stronger camera attention.
3. The app calculates and visualizes camera coverage on a canvas.
4. The optimizer generates candidate camera mounting positions along the boundary of the polygon.
5. Sample points are generated inside the polygon, and the optimizer selects the best camera positions using a greedy weighted set-cover strategy.
6. The selected camera placements are returned to the frontend and rendered on the canvas.

### Blueprint Workflow (New)

The blueprint mode offers a faster automated workflow for real floor plans:

1. The user uploads a floor-plan image (PNG, JPEG, or WEBP).
2. The backend processes the image to detect structural walls by targeting dark pixels and using morphological operations.
3. The system extracts individual wall segments using the Hough line transform and clusters them.
4. Doorways are detected as gaps in wall lines or confirmed by nearby arc contours (door swing arcs).
5. Enclosed regions are identified using flood-fill, and each region is labeled as a separate room.
6. The user reviews the extracted blueprint on the canvas and can manually edit wall segments, add doorways, or merge segments.
7. The user sets the desired number of cameras per room.
8. The optimizer places cameras room-by-room, respecting all walls as obstacles. Visibility checks block line-of-sight across any wall segment.
9. Coverage wedges are clipped to room boundaries, so they never visually extend through walls.

The app is designed for indoor security planning and works well with both manual polygon drawing and automatic blueprint extraction from floor-plan images.

## High-Level Architecture

The repository is organized as follows:

- `backend/` contains the FastAPI application, request models, optimization logic, and blueprint extraction pipeline.
- `frontend/` contains the user interface, geometry helpers, rendering code, and state management.
- Root-level helper files provide launch instructions, server startup support, and repository configuration.

The backend and frontend are intentionally lightweight. The frontend uses ES modules and canvas drawing. The backend uses Shapely, NumPy, and scikit-image for spatial relationships, geometry, and image processing.

## Folder and File Guide

### Root Files

[... existing content unchanged ...]

### `backend/`

The backend directory contains the Python API, optimization engine, and blueprint extraction pipeline.

#### `backend/main.py`

FastAPI application entry point.

Responsibilities:

- defines the API app,
- enables CORS for local frontend access,
- mounts the frontend static files under `/static`,
- serves `index.html` at the root path,
- exposes legacy `/health`, `/optimize`, `/coverage`, `/extract`, and `/extract-rooms` endpoints,
- exposes new blueprint endpoints `/extract-blueprint` and `/optimize-blueprint`,
- validates request inputs with Pydantic models,
- forwards optimization requests to the optimizer module,
- forwards blueprint extraction requests to the blueprint extractor,
- and returns results plus computed coverage.

It supports being run both directly and through the helper script.

#### `backend/optimizer.py`

Core optimization and coverage logic.

This file implements:

- polygon normalization and repair through Shapely,
- sample point generation inside the polygon,
- boundary camera candidate generation,
- visibility checks using field of view and line-of-sight rules,
- weighted sample-point support for priority zones,
- coverage percentage calculation,
- the greedy optimization loop that selects the best cameras,
- **NEW:** `optimize_blueprint_room` function for room-by-room optimization that respects wall segments as obstacles,
- **EXTENDED:** `is_visible` function now accepts an optional `wall_segments` parameter for wall-aware visibility.

Important behavior:

- The polygon is sampled on a grid so the problem can be treated as set cover.
- Candidate cameras are generated along the boundary and pointed inward.
- Each candidate camera is evaluated against all sample points.
- The optimizer chooses the camera that covers the most uncovered weighted samples at each step.
- Priority zones increase the weight of points inside those areas.
- In blueprint mode, wall segments block line-of-sight. A point is only visible if the line from the camera to the point does not cross any wall.

The optimizer is sample-based rather than continuous, which makes it practical and fast for interactive use.

#### `backend/blueprint_extractor.py` (New)

Wall and room extraction pipeline from floor-plan images.

Stages in order:

1. **extract_dark_mask(image)**: Isolates dark structural pixels. Uses grayscale threshold at brightness 80 and morphological closing to seal small gaps. Returns binary mask where walls are white.

2. **thin_to_skeleton(wall_mask)**: Reduces thick exterior walls to single centerlines using `skimage.morphology.skeletonize`. Returns single pixel-wide skeleton.

3. **detect_wall_segments(skeleton, wall_mask)**: Runs Hough line detection on skeleton. Filters noise (short segments under 15 pixels), dimension lines (aspect ratio over 20:1), and duplicates. Returns list of wall segments as coordinate pairs.

4. **detect_doorways(wall_segments, wall_mask)**: Finds gaps in wall lines. Confirms gaps using nearby arc contours where present. Returns list of doorway dicts with gap coordinates and the two wall segment IDs on either side.

5. **segment_rooms(wall_mask, skeleton, doorways)**: Flood-fills free space to find enclosed regions. Filters out tiny regions (less than 1% of image area) and regions touching image border (exterior space). Returns list of room dicts with id, polygon, area, and centroid.

6. **extract_blueprint(image)**: Calls all stages in order. Returns a dict matching BlueprintResponse. Never raises unhandled exceptions. On any failure returns empty lists with descriptive warnings.

Each function is independently testable with small helper outputs or direct function calls.

#### `backend/blueprint_models.py` (New)

Pydantic models for the blueprint extraction and optimization path.

Models:

- **WallSegment**: id, start (list of two floats), end (list of two floats)
- **Doorway**: id, from_wall_id, to_wall_id, midpoint (list of two floats), gap_start, gap_end
- **Room**: id, polygon, area_px, centroid, camera_count (default 1), is_priority (default False)
- **BlueprintResponse**: wall_segments, doorways, rooms, canvas_width, canvas_height, warnings (all default to empty lists)
- **BlueprintOptimizeRequest**: rooms, wall_segments, doorways, camera_settings
- **BlueprintOptimizeResponse**: cameras (list of dicts with x, y, angle, fov, range, room_id), coverage_by_room (dict), total_coverage (float)

All list fields default to empty lists, never null.

#### `backend/extract_models.py`

Pydantic models for the legacy extraction and optimization paths. Unchanged except for the addition of the blueprint models in the same file or alongside.

#### `backend/requirements.txt`

Lists the Python dependencies:

- `fastapi`
- `uvicorn[standard]`
- `pydantic`
- `numpy`
- `shapely`
- `opencv-python-headless` (for image processing)
- `scikit-image` (for skeletonization)
- `Pillow` (for image handling)

#### `backend/__init__.py`

Marks `backend` as a Python package.

### `frontend/`

The frontend directory contains the interactive browser application with both single-area and blueprint modes.

#### `frontend/index.html`

Main HTML document for the UI.

Additions for blueprint mode:

- Mode toggle between "Single area mode" and "Blueprint mode"
- Blueprint review panel with detected room count, wall count, doorway count, warnings, and per-room camera count inputs
- Edit mode toolbar for wall segment manipulation (add, delete, split, merge)

#### `frontend/main.js`

Main browser controller.

Additions for blueprint mode:

- File upload routing to either single-area or blueprint flow based on mode toggle
- Blueprint review UI updates
- Per-room camera count handling
- Edit-mode toggle and wall editing event handlers
- Separate event flow for blueprint mode that does not interfere with polygon drawing

#### `frontend/render.js`

Canvas rendering module.

Additions for blueprint mode:

- Blueprint rendering layer that activates when `blueprintMode` is true
- Wall segment drawing (dark grey lines, 2px width)
- Doorway marker drawing (cyan dashed lines)
- Room region fills (distinct low-opacity colors from an 8-color palette)
- Room labels at centroids
- Camera coverage wedge clipping to room polygons so wedges never visually extend through walls
- Highlight nearest wall segment to cursor in edit mode

#### `frontend/extractor_ui.js`

Extraction UI module.

Additions for blueprint mode:

- `uploadAndExtractBlueprint()`: POSTs image to `/extract-blueprint`, stores results in AppState, sets blueprint review mode
- `confirmBlueprint()`: Commits blueprint data to AppState, clears review mode
- `rejectBlueprint()`: Discards blueprint data and returns to upload state
- Wall segment editing tools:
  - `addWallSegment()`: User clicks two points, new segment is added
  - `deleteWallSegment()`: User right-clicks near segment, nearest segment within 10px is removed
  - `splitWallSegment()`: User clicks near segment midpoint, segment is split and gap is recorded as doorway
  - `mergeWallSegments()`: User selects two collinear segments, they are joined into one

#### `frontend/state.js`

Global application state.

Additions for blueprint mode:

- `blueprintMode`: Boolean, toggles blueprint vs. single-area mode
- `isReviewingBlueprint`: Boolean, gates blueprint review UI and interactions
- `wallSegments`: Array of wall segment objects with id, start, end
- `doorways`: Array of doorway objects
- `rooms`: Array of room objects with id, polygon, area_px, centroid, camera_count

Existing fields remain unchanged.

#### `frontend/style.css`

Stylesheet for the entire browser UI.

Additions for blueprint mode:

- Styling for mode toggle radio buttons
- Blueprint review panel styling (sidebar section)
- Room list with camera count inputs
- Edit mode toolbar styling
- All new UI matches the existing dark theme

[... rest of existing content unchanged ...]

## Data Flow Through the App

### Single-Area Manual Drawing Flow

1. The user clicks points on the canvas.
2. The frontend stores them in `AppState.polygon`.
3. Once the polygon is closed, the user can place cameras manually or run optimization.
4. Rendering updates the polygon, cameras, and coverage overlay.

### Single-Area Optimization Flow

1. The frontend gathers polygon points, global camera settings, and priority zones.
2. It posts that data to `/optimize`.
3. `backend/main.py` validates the request.
4. `backend/optimizer.py` generates weighted sample points and boundary candidates.
5. The greedy optimizer selects the best cameras.
6. The backend returns the camera list and overall coverage.
7. The frontend replaces the current camera set and redraws the canvas.

### Blueprint Extraction Flow (New)

1. The user selects "Blueprint mode" and uploads a floor-plan image.
2. The frontend POSTs the image to `/extract-blueprint`.
3. `backend/blueprint_extractor.py` processes the image through the wall/room extraction pipeline.
4. The backend returns wall segments, doorways, rooms, and any warnings.
5. The frontend stores these in `AppState`, renders them on the canvas, and shows a review panel.
6. The user can edit wall segments, adjust room camera counts, and confirm or reject the blueprint.
7. Once confirmed, the blueprint data is locked in and ready for optimization.

### Blueprint Room Optimization Flow (New)

1. The user confirms a blueprint and clicks "Auto Optimize" with camera counts set per room.
2. The frontend POSTs the rooms, wall segments, doorways, and camera settings to `/optimize-blueprint`.
3. `backend/optimizer.py` runs `optimize_blueprint_room` for each room.
4. For each room:
   - Sample points are generated inside the room polygon only.
   - Candidate cameras are generated along the room boundary.
   - The greedy optimizer runs up to the room's `camera_count` limit.
   - Visibility checks block on all wall segments, not just the room boundary.
5. The backend returns one camera per room (or more if the room is large) plus coverage stats.
6. The frontend renders cameras inside their respective rooms with coverage wedges clipped to room boundaries.

### Coverage Flow

Coverage is computed by sampling the polygon or room interior and checking whether each sample point is visible from at least one camera. For blueprint mode, visibility is blocked by wall segments, so points behind walls are never counted as covered.

## Design Notes

- The project intentionally uses vanilla JavaScript rather than a frontend framework.
- The backend is optional for manual single-area use, but required for optimization and blueprint extraction.
- Shapely is used for robust polygon handling and line-of-sight checks.
- scikit-image and OpenCV are used for floor-plan image processing.
- The optimization strategy is greedy and sample-based, which gives a practical balance between speed and quality.
- Blueprint mode treats walls as hard obstacles that block both line-of-sight and visual coverage rendering.
- The system supports manual blueprint editing after extraction, so users can correct the automated detection before optimization.

## Current Status of the Codebase

The repository now contains:

**Legacy Features (Phases 1-4, Merged)**:
- Polygon drawing and manual camera placement
- Camera dragging, rotation, and editing
- Weighted priority rectangles
- Backend optimization via greedy set cover
- Canvas visualization of coverage wedges

**New Features (Phase 5, In Progress)**:
- Automatic wall blueprint extraction from floor-plan images
- Room detection and doorway identification
- Room-by-room camera placement with wall-aware visibility
- Blueprint review and manual editing UI
- Per-room camera count control
- Wall-clipped coverage wedges

The codebase is designed so that both paths (single-area and blueprint) coexist without collision. All existing endpoints and tests remain unchanged. The new blueprint feature runs as a complete parallel implementation.
