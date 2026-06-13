# Handoff Document: Blueprint Wall Extraction Feature

## Implementation Status

**Branch**: `feat/extractor-image`
**Current Phase**: Step 1-2 of 10 (Planning and Model Creation)
**Target Completion**: All 10 steps with full verification

## What Has Been Done

### Phase 1-4 (Completed, Merged)
- Single-area polygon mode with manual and optimized camera placement
- Priority zones with weighted coverage
- Full backend optimization pipeline
- Frontend UI with undo/redo support
- Existing tests passing (33 tests)

### Phase 5 (Currently In Progress)
The blueprint feature is being implemented as a **complete parallel path** to avoid any collision with existing code:

#### New Backend Files (To Be Created)
- `backend/blueprint_models.py` — Pydantic models for WallSegment, Doorway, Room, BlueprintResponse, BlueprintOptimizeRequest, BlueprintOptimizeResponse
- `backend/blueprint_extractor.py` — Wall and room extraction pipeline with stages: extract_dark_mask, thin_to_skeleton, detect_wall_segments, detect_doorways, segment_rooms, scale_to_canvas, extract_blueprint

#### Backend Files (To Be Extended)
- `backend/main.py` — Add POST /extract-blueprint and POST /optimize-blueprint endpoints
- `backend/optimizer.py` — Add optimize_blueprint_room function and extend is_visible to accept optional wall_segments parameter

#### New Frontend Files/Functions
- `frontend/state.js` — Add blueprintMode, isReviewingBlueprint, wallSegments, doorways, rooms
- `frontend/extractor_ui.js` — Add uploadAndExtractBlueprint, confirmBlueprint, rejectBlueprint, plus wall editing tools
- `frontend/render.js` — Add blueprint rendering layer for walls, doorways, rooms, and clipped wedges
- `frontend/index.html` — Add mode toggle and blueprint review panel
- `frontend/style.css` — Add styling for new UI elements

#### Tests (New Test Files)
- `tests/backend/test_blueprint_extractor.py` — Test each extraction stage and full pipeline
- `tests/backend/test_blueprint_models.py` — Test model defaults and validation
- `tests/backend/test_blueprint_endpoints.py` — Test /extract-blueprint and /optimize-blueprint endpoints

## Next Steps (Remaining)

### Step 1: Create backend/blueprint_models.py
Create Pydantic models for the blueprint path. All list fields must default to empty lists.
- WallSegment(id, start, end)
- Doorway(id, from_wall_id, to_wall_id, midpoint, gap_start, gap_end)
- Room(id, polygon, area_px, centroid, camera_count=1, is_priority=False)
- BlueprintResponse(wall_segments, doorways, rooms, canvas_width, canvas_height, warnings)
- BlueprintOptimizeRequest(rooms, wall_segments, doorways, camera_settings)
- BlueprintOptimizeResponse(cameras, coverage_by_room, total_coverage)

**Status**: Ready to implement. File should be created at `/workspaces/Optimized_Camera_Placement/backend/blueprint_models.py`

### Step 2: Create backend/blueprint_extractor.py
Implement the complete wall extraction pipeline:
1. extract_dark_mask — Target brightness < 80, use morphological closing
2. thin_to_skeleton — Use skimage.morphology.skeletonize
3. detect_wall_segments — Hough line detection, filter noise and duplicates
4. detect_doorways — Find gaps and confirm with arc detection
5. segment_rooms — Flood-fill to find enclosed regions, filter tiny rooms
6. scale_to_canvas — Scale results to canvas dimensions
7. extract_blueprint — Orchestrate all stages, return BlueprintResponse

**Status**: Design complete. Implementation sequence defined. No dependencies on Step 1 beyond models.

### Step 3: Extend backend/optimizer.py
Add room-level optimization without changing existing functions:
- Add `optimize_blueprint_room(room_polygon, wall_segments, camera_count, camera_settings)` function
- Extend `is_visible` to accept optional `wall_segments` parameter (default None for backward compatibility)
- When wall_segments are provided, check that line-of-sight does not cross any wall

**Status**: Design complete. Existing tests must continue passing.

### Step 4: Add endpoints to backend/main.py
- POST /extract-blueprint — Multipart file upload, same validation as /extract, calls extract_blueprint, returns BlueprintResponse
- POST /optimize-blueprint — Accepts BlueprintOptimizeRequest, calls optimize_blueprint_room for each room, returns BlueprintOptimizeResponse

**Status**: Design complete. Do not modify existing endpoints.

### Step 5: Extend frontend/state.js
Add new fields to AppState:
- blueprintMode (Boolean)
- isReviewingBlueprint (Boolean)
- wallSegments (Array)
- doorways (Array)
- rooms (Array)

Do not remove or modify existing fields.

**Status**: Simple field additions. No logic changes.

### Step 6: Extend frontend/extractor_ui.js
Add blueprint-specific functions:
- uploadAndExtractBlueprint(file)
- confirmBlueprint()
- rejectBlueprint()
- Wall editing tools: addSegment, deleteSegment, splitSegment, mergeSegments

**Status**: Design complete. Keep existing functions untouched.

### Step 7: Extend frontend/render.js
Add blueprint rendering layer:
- Draw wall segments (dark grey, 2px)
- Draw doorway markers (cyan dashed)
- Fill room regions with distinct colors
- Label rooms with IDs at centroids
- Clip camera wedges to room polygons

Only activates when blueprintMode is true.

**Status**: Design complete. Do not change existing rendering.

### Step 8: Update frontend/index.html and style.css
- Add mode toggle (single area vs. blueprint)
- Add blueprint review panel with room list and camera count inputs
- Add edit mode toolbar
- Match existing dark theme

**Status**: Design complete.

### Step 9: Create new test files
- test_blueprint_extractor.py — Test each stage and full pipeline
- test_blueprint_models.py — Test model defaults
- test_blueprint_endpoints.py — Test /extract-blueprint and /optimize-blueprint

Do not modify existing test files.

**Status**: Test structure designed. Existing 33 tests must still pass.

### Step 10: Verification
Run all 10 verification checks:
1. Import blueprint_extractor succeeds
2. Import blueprint_models succeeds
3. POST synthetic single-room image to /extract-blueprint
4. POST synthetic two-room image with doorway to /extract-blueprint
5. POST tests/data/floorplan.png to /extract-blueprint (report room count, wall count, doorway count, full JSON)
6. POST optimize-blueprint request (verify one camera per room)
7. pytest tests/ -v (all tests pass with zero failures)
8-10. Browser visual checks on real floor plan

**Status**: Ready after all 7 steps are complete.

## Key Constraints

- **No collisions**: Existing /extract, /optimize, /extract-rooms, /optimize-rooms endpoints must not change
- **Existing tests**: All 33 existing tests must pass with zero modifications to test files
- **No dependency changes**: Use only numpy, shapely, opencv-python-headless, scikit-image, Pillow, fastapi, uvicorn, pydantic (already in requirements.txt or standard)
- **Parallel path**: New blueprint feature must not interfere with single-area mode
- **Default empty lists**: All response list fields must default to [], never null

## Testing Strategy

### Unit Tests
- Test each blueprint_extractor stage independently
- Test model defaults and validation
- Test endpoint request/response shapes

### Integration Tests
- Test synthetic single-room and two-room images
- Test real floor plan from tests/data/floorplan.png
- Test end-to-end blueprint extraction → review → optimization

### Regression Tests
- Run full pytest suite to confirm all existing tests still pass
- Verify no changes to legacy endpoint behavior

## Documentation Updates

- **project_description.md**: Updated with blueprint feature description, new file guide, new data flows
- **handoff.md**: This document, describes status and next steps
- **README.md** (if needed): Brief note about blueprint mode availability

## How to Clone This Branch Locally

To clone the `feat/extractor-image` branch to your local machine, run:

```bash
# Clone the repository (if not already cloned)
git clone https://github.com/Vardhanch05/Optimized_Camera_Placement.git
cd Optimized_Camera_Placement

# Fetch the latest remote branches
git fetch origin

# Checkout the specific branch
git checkout feat/extractor-image

# Verify you're on the correct branch
git branch -v