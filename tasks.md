# Feature Implementation Tasks

This file lists the implementation tasks for the "Floor Plan Image Extraction" feature and related follow-ups. Tasks are grouped by phase and include brief acceptance criteria and target files.

## Phase 1 — Backend image processing pipeline

- [ ] Implement `backend/extractor.py` — image processing pipeline (validation, preprocessing, contour detection, polygon extraction, scaling, priority zone suggestion, warnings).
  - Acceptance: functions for each stage, returns JSON-ready structure.
  - Targets: `backend/extractor.py` (new), `backend/optimizer.py` (reuse), tests.

- [ ] Add Pydantic models `backend/extract_models.py` — request/response schemas for `/extract`.
  - Acceptance: typed models used by `/extract` endpoint.

- [ ] Add `/extract` POST endpoint in `backend/main.py` that accepts multipart image and returns extraction result.
  - Acceptance: returns `outer_polygon`, `inner_polygons`, `suggested_priority_zones`, `canvas_width`, `canvas_height`, `warnings`.

- [ ] Update `backend/requirements.txt` to include `opencv-python-headless`, `scikit-image`, `Pillow`.

## Phase 2 — Frontend integration

- [ ] Create `frontend/extractor_ui.js` for upload flow, review panel, and correction tools.
- [ ] Update `frontend/index.html` to add upload button and review panel.
- [ ] Wire extraction handling in `frontend/main.js` to call `/extract`, load polygons into `AppState`, and manage review flow.
- [ ] Render extracted polygon overlay and image background in `frontend/render.js`.
- [ ] Add extraction fields to `frontend/state.js`: `extractedImage`, `extractionPending`, `extractionWarnings`, `isReviewingExtraction`.
- [ ] Style upload/review UI in `frontend/style.css`.

## Phase 3 — Robustness and edge cases

- [ ] Implement image quality handling (low contrast, rotation, noise) in `backend/extractor.py` and emit warnings.
- [ ] Add file type and size validation in `/extract` endpoint.
- [ ] Gracefully handle failure modes and return structured warnings instead of crashing.

## Phase 4 — Tests

- [ ] Unit tests for each pipeline stage (create `tests/backend/test_extractor_*.py`).
- [ ] Integration tests for `/extract` endpoint (multipart upload, error cases).
- [ ] Prepare manual test image suite (store in `tests/data/`).

## Phase 5 — Future improvements (post-v1)

- [ ] PDF support (pdf2image or pymupdf).
- [ ] Deep learning model for wall/door detection.
- [ ] Automatic room labeling and scale bar detection.

---

## How to use this file

Mark tasks as complete by checking them here and in the repository TODO manager. For multi-file changes, create a feature branch (suggested name `feat/extractor-image`) and open a PR targeting `main`.

Suggested branch commands:

```bash 
git checkout -b feat/extractor-image
git add <files>
git commit -m "feat: add floor-plan image extractor (phase 1)"
git push -u origin feat/extractor-image
```

If you want, I can start implementing Phase 1 now on a new branch.
