# Project Description

## Overview

This repository is an interactive camera placement optimizer for floor plans and custom indoor layouts. The app lets a user define an area, place security cameras, visualize each camera's field of view, and run an automatic optimizer that tries to maximize coverage. The current version supports both manual polygon drawing and weighted priority zones, so areas like doors, hallways, and other sensitive spaces can be given higher importance during optimization.

The project has two main halves:

- A browser-based frontend built with HTML, CSS, and vanilla JavaScript.
- An optional FastAPI backend written in Python that performs the optimization and coverage calculations.

The frontend can run by itself for manual editing and visualization, but the backend is the source of truth for the automatic optimizer. The backend serves the frontend under the same origin when started from the repository root, which avoids cross-origin issues.

## What the App Does

The workflow is:

1. The user draws a polygon that represents the room, building, or other protected area.
2. The user can optionally add weighted priority zones, which are rectangular regions that should receive stronger camera attention.
3. The app calculates and visualizes camera coverage on a canvas.
4. The optimizer generates candidate camera mounting positions along the boundary of the polygon.
5. Sample points are generated inside the polygon, and the optimizer selects the best camera positions using a greedy weighted set-cover strategy.
6. The selected camera placements are returned to the frontend and rendered on the canvas.

The app is designed for indoor security planning and is especially useful for camera coverage planning in layouts such as homes, offices, hallways, and rooms.

## High-Level Architecture

The repository is organized as follows:

- `backend/` contains the FastAPI application, request models, and optimization logic.
- `frontend/` contains the user interface, geometry helpers, rendering code, and state management.
- Root-level helper files provide launch instructions, server startup support, and repository configuration.

The backend and frontend are intentionally lightweight and do not rely on a large framework stack. The frontend uses ES modules and canvas drawing, while the backend uses Shapely and NumPy to compute spatial relationships and optimize coverage.

## Folder and File Guide

### Root Files

#### `.gitignore`

Excludes generated and editor-specific files from version control. It ignores Python bytecode caches, `.DS_Store`, and `.vscode/`.

#### `README.md`

Short project introduction with a summary of features, the frontend/backend split, and basic run instructions. It gives a quick overview but not the detailed operational notes found in `run_instructions.txt`.

#### `run_instructions.txt`

Detailed usage and development instructions. It explains:

- how to install backend dependencies,
- how to start the backend with `run_server.py` or directly with `backend/main.py`,
- how to serve the frontend,
- how to test the `/optimize` endpoint,
- and how to troubleshoot common startup or connection problems.

This file is the most practical setup guide in the repository.

#### `run_server.py`

Helper script that starts the backend reliably. It:

- checks whether port `8000` is already in use,
- safely stops an existing Python process on that port if it appears to belong to this project,
- imports `backend.main.app`,
- and runs the FastAPI app with Uvicorn.

This file is meant to make local development smoother by preventing the common "address already in use" issue.

#### `project_description.md`

This document. It records what the repository does and what each file is for.

### `backend/`

The backend directory contains the Python API and optimization engine.

#### `backend/main.py`

FastAPI application entry point.

Responsibilities:

- defines the API app,
- enables CORS for local frontend access,
- mounts the frontend static files under `/static`,
- serves `index.html` at the root path,
- exposes `/health`, `/optimize`, and `/coverage` endpoints,
- validates request inputs with Pydantic models,
- forwards optimization requests to the optimizer module,
- and returns the optimized camera set plus computed coverage.

It also supports being run both directly and through the helper script, which is why the import fallback exists.

#### `backend/optimizer.py`

Core optimization and coverage logic.

This is the most important backend file. It implements:

- polygon normalization and repair through Shapely,
- sample point generation inside the polygon,
- boundary camera candidate generation,
- visibility checks using field of view and line-of-sight rules,
- weighted sample-point support for priority zones,
- coverage percentage calculation,
- and the greedy optimization loop that selects the best cameras.

Important behavior:

- The polygon is sampled on a grid so the problem can be treated as set cover.
- Candidate cameras are generated along the boundary and pointed inward.
- Each candidate camera is evaluated against all sample points.
- The optimizer chooses the camera that covers the most uncovered weighted samples at each step.
- Priority zones increase the weight of points inside those areas, so the optimizer prefers protecting those locations first.

The optimizer is sample-based rather than continuous, which makes it practical and fast enough for interactive use.

#### `backend/requirements.txt`

Lists the Python dependencies needed for the backend:

- `fastapi`
- `uvicorn[standard]`
- `pydantic`
- `numpy`
- `shapely`

These packages provide the web server, data validation, numeric routines, and geometric computation.

#### `backend/__init__.py`

Marks `backend` as a Python package. It makes imports explicit and allows the application to be imported cleanly from the repository root.

#### `backend/__pycache__/`

Generated Python bytecode cache directory. It is not source code and is ignored by `.gitignore`.

### `frontend/`

The frontend directory contains the interactive browser application.

#### `frontend/index.html`

Main HTML document for the UI.

It defines:

- the page title and layout,
- the canvas used for drawing the polygon and cameras,
- the sidebar panels for settings, tools, actions, instructions, and selected camera controls,
- the priority zone JSON input area,
- and the script entry point for the ES module frontend.

The page includes a `<base href="/static/">` tag so assets load correctly when the backend serves the frontend.

#### `frontend/main.js`

Main browser controller.

Responsibilities:

- handles mouse input on the canvas,
- manages polygon drawing and closing,
- handles camera placement, dragging, deletion, and selection,
- updates the global and selected-camera sliders,
- parses the priority zone JSON input,
- sends optimization requests to the backend,
- receives optimized camera results,
- and refreshes the UI after every change.

It is the glue between the state store, the rendering layer, and the backend API.

#### `frontend/render.js`

Canvas rendering module.

It draws:

- the background grid,
- the polygon boundary and fill,
- preview lines while the polygon is being drawn,
- priority zone rectangles,
- camera coverage wedges,
- and the camera markers themselves.

This file is responsible only for drawing. It does not manage user input or application state.

#### `frontend/coverage.js`

Client-side coverage helpers and fallback optimizer logic.

Responsibilities:

- calculates weighted coverage in the browser,
- checks whether a point is visible from a camera,
- and contains a client-side camera placement routine.

The backend is the main optimization path, but this file remains useful for local coverage display and as a fallback/reference implementation.

#### `frontend/geometry.js`

Geometry helper library for the frontend.

It provides:

- point distance calculations,
- polygon point-inclusion checks,
- polygon bounds and centroid helpers,
- line-segment and visibility checks,
- boundary camera candidate generation,
- and grid point generation inside the polygon.

This module is used by the frontend rendering and optimization helpers to keep geometry calculations consistent.

#### `frontend/state.js`

Global application state and undo/redo history.

It stores:

- the drawn polygon,
- whether the polygon is closed,
- the list of cameras,
- the selected camera,
- the current mode (`draw` or `place`),
- visibility settings,
- global camera defaults,
- and the priority zone list.

It also provides helper functions for:

- undo and redo,
- pushing history snapshots,
- adding and deleting cameras,
- selecting the active camera,
- and updating camera properties.

#### `frontend/config.js`

Shared frontend constants.

It exports the sample spacing and grid spacing values used across the frontend modules. These constants keep the rendering and coverage logic aligned.

#### `frontend/style.css`

Stylesheet for the entire browser UI.

It defines:

- the dark themed layout,
- the responsive two-column structure,
- canvas styling,
- sidebar panels,
- buttons and sliders,
- the priority zone textarea styling,
- and the visual polish for labels, spacing, and hover states.

#### `frontend/__pycache__/` and other generated frontend artifacts

The frontend directory is mostly plain source files. It should not normally contain generated build output in this repository because the app is served directly as static files.

## Data Flow Through the App

### Manual drawing flow

1. The user clicks points on the canvas.
2. The frontend stores them in `AppState.polygon`.
3. Once the polygon is closed, the user can place cameras manually or run optimization.
4. Rendering updates the polygon, cameras, and coverage overlay.

### Optimization flow

1. The frontend gathers polygon points, global camera settings, and priority zones.
2. It posts that data to `/optimize`.
3. `backend/main.py` validates the request.
4. `backend/optimizer.py` generates weighted sample points and boundary candidates.
5. The greedy optimizer selects the best cameras.
6. The backend returns the camera list and overall coverage.
7. The frontend replaces the current camera set and redraws the canvas.

### Coverage flow

Coverage is computed by sampling the polygon interior and checking whether each sample point is visible from at least one camera. Priority zones can increase the weight of specific samples, which changes the coverage score and the optimizer's selection behavior.

## Design Notes

- The project intentionally uses vanilla JavaScript rather than a frontend framework.
- The backend is optional for manual use, but required for the automatic optimizer.
- Shapely is used for robust polygon handling and line-of-sight checks.
- The optimization strategy is greedy and sample-based, which gives a practical balance between speed and quality.
- Priority zones are implemented as rectangles in the current version. This keeps the input simple while still allowing important areas to be emphasized.

## Planned Feature: Automatic Floor-Plan Image Extraction

One major feature the project is well suited to implement is automatic floor-plan analysis from an uploaded image. Instead of requiring the user to manually draw the polygon of the room or building, the app could accept a floor-plan image and extract the walkable or protected layout automatically.

### Feature Goal

The goal of this feature is to reduce manual setup time. A user would upload an image of a house plan, office plan, or construction drawing, and the system would detect the structure of the plan, convert it into a usable geometric layout, and then run the camera optimizer on that extracted layout.

### Intended Workflow

1. The user uploads an image of a floor plan.
2. The frontend sends the image to the backend or a dedicated vision pipeline.
3. The system processes the image to detect walls, rooms, openings, and boundaries.
4. The detected structure is converted into a polygon, room graph, or skeleton representation.
5. The user reviews and corrects the extracted shape if needed.
6. The optimizer runs on the confirmed layout and returns the best camera placements.

### What "Skeleton Extraction" Means Here

In this project, skeleton extraction would mean turning the visible floor-plan structure into a simplified geometric model that preserves the important navigable or visible areas. The skeleton may include:

- outer boundaries of the floor plan,
- interior room divisions,
- hallway paths,
- door openings,
- and priority areas such as entrances or choke points.

This skeleton can then be translated into polygons or weighted zones that the optimizer understands.

### Why This Feature Is Valuable

This feature would make the application much more practical for real-world planning because:

- users would not need to trace every wall manually,
- the setup would be faster for large plans,
- the system could highlight critical areas automatically,
- and the optimizer could be driven by real floor-plan data instead of hand-drawn shapes.

### Important Challenges

Automatic extraction is a strong idea, but it is also one of the hardest parts of the project. Floor-plan images vary a lot, and the system will need to handle:

- scanned images with noise or blur,
- rotated or skewed drawings,
- different line thicknesses,
- text labels inside rooms,
- furniture symbols that should not be treated as walls,
- and partially visible or low-resolution plans.

Because of this, the feature should still allow manual correction after extraction.

### Recommended Implementation Strategy

The best way to add this feature is in stages:

1. Start with simple black-and-white floor plans.
2. Detect walls and outer boundaries using image preprocessing.
3. Convert the result into a polygon or room outline.
4. Add a preview/edit step so the user can fix mistakes.
5. Feed the corrected shape into the existing optimizer.
6. Later, extend the pipeline to support room skeletons and weighted regions.

### How It Fits the Existing Codebase

This feature fits naturally into the current architecture:

- the frontend would gain an image upload and review mode,
- the backend would gain a floor-plan parsing pipeline,
- the optimizer would keep using the same camera-placement logic,
- and the weighted priority zones could be used to emphasize entrances, corridors, and other important regions extracted from the plan.

In short, the feature would change how the area is created, but it would not require replacing the optimizer itself.

## Current Status of the Codebase

At the time of writing, the repository contains a merged weighted-priority-zone feature. The app supports:

- polygon drawing,
- manual camera placement,
- camera dragging and editing,
- weighted priority rectangles,
- backend optimization,
- and canvas visualization of the result.

The codebase is in a runnable state and the backend is wired to serve the frontend from the same origin.
