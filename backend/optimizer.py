import numpy as np
from shapely.geometry import LineString, Point as ShapelyPoint, Polygon
from shapely.prepared import prep
from typing import List, Tuple, Dict, Optional
import math
import concurrent.futures
import os

# Sampling / candidate constants (standardize across codebase)
SAMPLE_STEP = 10.0            # default fine sampling step (pixels)
COVERAGE_SAMPLE_STEP = 15.0   # sampling step used for coverage checks during optimization
CANDIDATE_STEP = 30.0         # candidate grid step for camera positions
CAMERA_OFFSET = 2.0           # tiny offset to keep mounted cameras just inside the boundary


def _build_polygon(polygon: List[Tuple[float, float]]) -> Polygon:
    poly = Polygon(polygon)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly


def _compute_candidate_coverage_worker(args):
    """Worker to compute covered sample indices for a candidate. Pickle-friendly.

    Args is a tuple: (pos, sample_points, camera_range, camera_fov, polygon_coords)
    Returns list of covered indices.
    """
    pos, sample_points, camera_range, camera_fov, polygon_coords = args
    poly = Polygon(polygon_coords)
    cam = {
        'x': pos['x'],
        'y': pos['y'],
        'angle': pos['angle'],
        'range': camera_range,
        'fov': camera_fov
    }

    covered = []
    for i, pt in enumerate(sample_points):
        if is_point_visible_from_camera(pt, cam, poly):
            covered.append(i)
    return covered


def _point_in_priority_zone(point: Tuple[float, float], zone: Dict) -> bool:
    x, y = point
    left = float(zone.get('x', 0.0))
    top = float(zone.get('y', 0.0))
    width = float(zone.get('width', 0.0))
    height = float(zone.get('height', 0.0))

    right = left + width
    bottom = top + height

    min_x = min(left, right)
    max_x = max(left, right)
    min_y = min(top, bottom)
    max_y = max(top, bottom)

    return min_x <= x <= max_x and min_y <= y <= max_y


def build_weighted_sample_points(
    polygon: List[Tuple[float, float]],
    sample_step: float = COVERAGE_SAMPLE_STEP,
    priority_zones: Optional[List[Dict]] = None,
) -> Tuple[List[Tuple[float, float]], List[float]]:
    """Generate sample points and per-point weights for weighted coverage."""
    sample_points = generate_sample_points(polygon, sample_step)
    if not sample_points:
        return [], []

    zones = priority_zones or []
    sample_weights: List[float] = []

    for point in sample_points:
        weight = 1.0
        for zone in zones:
            if _point_in_priority_zone(point, zone):
                zone_weight = float(zone.get('weight', 1.0))
                if zone_weight > weight:
                    weight = zone_weight

        sample_weights.append(max(weight, 0.1))

    return sample_points, sample_weights

def point_in_polygon(point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
    """Check if a point is inside a polygon using ray casting algorithm."""
    x, y = point
    n = len(polygon)
    inside = False
    
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        
        j = i
    
    return inside

def is_point_in_camera_view(
    point: Tuple[float, float],
    camera: Dict,
) -> bool:
    """Check if a point is within a camera's field of view."""
    cx, cy = camera['x'], camera['y']
    px, py = point
    
    # Calculate distance
    distance = math.sqrt((px - cx)**2 + (py - cy)**2)
    if distance > camera['range']:
        return False
    
    # Calculate angle from camera to point
    angle_to_point = math.degrees(math.atan2(py - cy, px - cx))
    
    # Normalize angles to [0, 360)
    angle_to_point = angle_to_point % 360
    camera_angle = camera['angle'] % 360
    
    # Calculate angular difference
    diff = angle_to_point - camera_angle
    
    # Normalize to [-180, 180]
    if diff > 180:
        diff -= 360
    elif diff < -180:
        diff += 360
    
    # Check if within FOV
    return abs(diff) <= camera['fov'] / 2

def generate_sample_points(
    polygon: List[Tuple[float, float]],
    step: float = SAMPLE_STEP
) -> List[Tuple[float, float]]:
    """Generate grid of sample points inside polygon using Shapely for robustness.

    This is substantially faster and more reliable than a pure Python
    ray-casting implementation for larger polygons and edge cases.
    """
    poly = Polygon(polygon)
    if poly.is_empty:
        return []

    prepared = prep(poly)

    min_x, min_y, max_x, max_y = poly.bounds

    xs = np.arange(min_x, max_x + step, step)
    ys = np.arange(min_y, max_y + step, step)

    points = []
    # Use shapely Point for contains checks
    from shapely.geometry import Point as ShapelyPoint

    for x in xs:
        for y in ys:
            pt = ShapelyPoint(float(x), float(y))
            if prepared.contains(pt):
                points.append((float(x), float(y)))

    return points


def _get_inward_angle(poly: Polygon, x: float, y: float, fallback_point: Tuple[float, float]) -> float:
    interior_point = poly.representative_point()
    angle = math.degrees(math.atan2(interior_point.y - y, interior_point.x - x))

    # Keep the camera pointed roughly toward the interior. If the polygon is
    # unusual and the representative point is not helpful from this boundary
    # location, fall back to the point suggested by the caller.
    if math.isnan(angle):
        fx, fy = fallback_point
        angle = math.degrees(math.atan2(fy - y, fx - x))

    return angle


def generate_mounting_candidates(
    polygon: List[Tuple[float, float]],
    step: float = CANDIDATE_STEP,
) -> List[Dict]:
    """Generate realistic camera mounting points along the polygon boundary."""
    poly = _build_polygon(polygon)
    if poly.is_empty:
        return []

    coords = list(poly.exterior.coords)
    if len(coords) < 2:
        return []

    candidate_offsets = [-60, -30, 0, 30, 60]
    candidates: List[Dict] = []
    seen = set()

    def add_candidate(x: float, y: float, angle: float):
        # Offset candidate slightly toward the polygon interior to avoid
        # numerical edge cases where a camera lies exactly on the boundary.
        ix, iy = interior_point.x, interior_point.y
        dx = ix - x
        dy = iy - y
        norm = math.hypot(dx, dy)
        if norm > 1e-6:
            ux = dx / norm
            uy = dy / norm
            ox = x + ux * CAMERA_OFFSET
            oy = y + uy * CAMERA_OFFSET
        else:
            ox, oy = x, y

        key = (round(ox, 3), round(oy, 3), round(angle % 360, 1))
        if key in seen:
            return
        seen.add(key)
        candidates.append({
            'x': float(ox),
            'y': float(oy),
            'angle': float(angle % 360),
        })

    # Add corner candidates.
    interior_point = poly.representative_point()
    for x, y in coords[:-1]:
        angle = math.degrees(math.atan2(interior_point.y - y, interior_point.x - x))
        for offset in candidate_offsets:
            add_candidate(x, y, angle + offset)

    # Add evenly spaced edge candidates.
    for start, end in zip(coords[:-1], coords[1:]):
        sx, sy = start
        ex, ey = end
        length = math.hypot(ex - sx, ey - sy)
        if length == 0:
            continue

        sample_count = max(1, int(math.ceil(length / step)))
        for index in range(sample_count):
            t = (index + 0.5) / sample_count
            x = sx + (ex - sx) * t
            y = sy + (ey - sy) * t
            angle = _get_inward_angle(poly, x, y, interior_point.coords[0])
            for offset in candidate_offsets:
                add_candidate(x, y, angle + offset)

    return candidates


def is_point_visible_from_camera(
    point: Tuple[float, float],
    camera: Dict,
    polygon: Polygon | None = None,
) -> bool:
    """Check whether a point is both inside the camera cone and line of sight."""
    cx, cy = camera['x'], camera['y']
    px, py = point

    distance = math.sqrt((px - cx)**2 + (py - cy)**2)
    if distance > camera['range']:
        return False

    angle_to_point = math.degrees(math.atan2(py - cy, px - cx)) % 360
    camera_angle = camera['angle'] % 360

    diff = angle_to_point - camera_angle
    if diff > 180:
        diff -= 360
    elif diff < -180:
        diff += 360

    if abs(diff) > camera['fov'] / 2:
        return False

    if polygon is None or polygon.is_empty:
        return True

    line = LineString([(cx, cy), (px, py)])
    return polygon.covers(line)


def is_visible(
    camera_pos: Tuple[float, float],
    sample_point: Tuple[float, float],
    polygon: Polygon,
    wall_segments: Optional[List[List[List[float]]]] = None,
) -> bool:
    line = LineString([camera_pos, sample_point])

    if polygon is not None and not polygon.is_empty and not polygon.covers(line):
        return False

    if wall_segments:
        for wall in wall_segments:
            wall_line = LineString(wall)
            if line.crosses(wall_line):
                return False

    return True


def generate_boundary_candidates(
    polygon: List[Tuple[float, float]],
    step: float = CANDIDATE_STEP,
) -> List[Dict]:
    return generate_mounting_candidates(polygon, step)


def greedy_optimize(
    candidates: List[Dict],
    sample_points: List[Tuple[float, float]],
    room_polygon: Polygon,
    wall_segments: Optional[List[List[List[float]]]],
    sample_weights: List[float],
    max_cameras: int,
    camera_range: float,
    camera_fov: float,
) -> List[Dict]:
    candidate_coverages: List[Dict] = []

    for pos in candidates:
        camera = {
            'x': pos['x'],
            'y': pos['y'],
            'angle': pos['angle'],
            'range': camera_range,
            'fov': camera_fov,
        }
        covered: set[int] = set()
        for index, point in enumerate(sample_points):
            if is_point_visible_from_camera(point, camera, room_polygon) and is_visible(
                (camera['x'], camera['y']),
                point,
                room_polygon,
                wall_segments,
            ):
                covered.add(index)
        if covered:
            candidate_coverages.append({'camera': camera, 'covers': covered})

    uncovered = set(range(len(sample_points)))
    selected_cameras: List[Dict] = []

    for _ in range(max(1, max_cameras)):
        best = None
        best_new = set()
        best_new_weight = 0.0
        for entry in candidate_coverages:
            new_cover = entry['covers'] & uncovered
            new_weight = sum(sample_weights[idx] for idx in new_cover)
            if new_weight > best_new_weight:
                best = entry
                best_new = new_cover
                best_new_weight = new_weight

        if best is None or best_new_weight <= 0:
            break

        camera = best['camera'].copy()
        camera['id'] = len(selected_cameras) + 1
        selected_cameras.append(camera)
        uncovered -= best_new
        if not uncovered:
            break

    return selected_cameras

def calculate_coverage(
    polygon: List[Tuple[float, float]],
    cameras: List[Dict],
    sample_step: float = SAMPLE_STEP,
    priority_zones: Optional[List[Dict]] = None,
) -> int:
    """Calculate number of covered sample points."""
    sample_points, sample_weights = build_weighted_sample_points(
        polygon,
        sample_step=sample_step,
        priority_zones=priority_zones,
    )
    poly = _build_polygon(polygon)

    covered = 0.0
    for index, point in enumerate(sample_points):
        for camera in cameras:
            if is_point_visible_from_camera(point, camera, poly):
                covered += sample_weights[index] if sample_weights else 1.0
                break

    return covered

def calculate_coverage_percentage(
    polygon: List[Tuple[float, float]],
    cameras: List[Dict],
    sample_step: float = SAMPLE_STEP,
    priority_zones: Optional[List[Dict]] = None,
    wall_segments: Optional[List[List[List[float]]]] = None,
) -> float:
    """Calculate coverage as a percentage."""
    sample_points, sample_weights = build_weighted_sample_points(
        polygon,
        sample_step=sample_step,
        priority_zones=priority_zones,
    )
    if not sample_points:
        return 0.0

    poly = _build_polygon(polygon)

    total_weight = sum(sample_weights) if sample_weights else float(len(sample_points))
    if total_weight <= 0:
        return 0.0

    covered = 0.0
    for index, point in enumerate(sample_points):
        for camera in cameras:
            if is_point_visible_from_camera(point, camera, poly) and is_visible(
                (camera['x'], camera['y']),
                point,
                poly,
                wall_segments,
            ):
                covered += sample_weights[index] if sample_weights else 1.0
                break

    return round(covered / total_weight * 100, 1)

def optimize_camera_placement(
    polygon: List[Tuple[float, float]],
    max_cameras: int = 10,
    camera_range: float = 150.0,
    camera_fov: float = 90.0,
    candidate_step: float = CANDIDATE_STEP,
    priority_zones: Optional[List[Dict]] = None,
) -> List[Dict]:
    """
    Optimize camera placement using a greedy algorithm.
    
    Args:
        polygon: List of (x, y) tuples defining the area
        max_cameras: Maximum number of cameras to place
        camera_range: Detection range of each camera
        camera_fov: Field of view in degrees
        candidate_step: Grid step for candidate positions
    
    Returns:
        List of camera dictionaries with x, y, angle, range, fov
    """
    # Generate realistic wall/corner mounting positions around the boundary.
    candidates = generate_mounting_candidates(polygon, candidate_step)
    
    if not candidates:
        return []

    poly = _build_polygon(polygon)

    # Sample points used for coverage calculations (set cover universe)
    sample_points, sample_weights = build_weighted_sample_points(
        polygon,
        sample_step=COVERAGE_SAMPLE_STEP,
        priority_zones=priority_zones,
    )
    if not sample_points:
        return []

    # Precompute coverage sets for each candidate camera
    # Compute candidate cover sets in parallel to utilize multiple CPU cores.
    cpu_count = max(1, (os.cpu_count() or 1) - 1)
    entries = []
    args_iter = [
        (pos, sample_points, camera_range, camera_fov, list(poly.exterior.coords))
        for pos in candidates
    ]

    candidate_coverages: List[Dict] = []
    if args_iter:
        # Use a ProcessPoolExecutor to avoid GIL contention during shapely ops.
        max_workers = min(cpu_count, len(args_iter))
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as ex:
            for pos, covered_indices in zip(candidates, ex.map(_compute_candidate_coverage_worker, args_iter)):
                if covered_indices:
                    candidate_coverages.append({'camera': {
                        'x': pos['x'],
                        'y': pos['y'],
                        'angle': pos['angle'],
                        'range': camera_range,
                        'fov': camera_fov
                    }, 'covers': set(covered_indices)})

    # Greedy weighted set-cover: pick cameras that cover the most uncovered weight
    uncovered = set(range(len(sample_points)))
    selected_cameras: List[Dict] = []

    for _ in range(max_cameras):
        best = None
        best_new = set()
        best_new_weight = 0.0
        for entry in candidate_coverages:
            new_cover = entry['covers'] & uncovered
            new_weight = sum(sample_weights[idx] for idx in new_cover)
            if new_weight > best_new_weight:
                best = entry
                best_new = new_cover
                best_new_weight = new_weight

        if best is None or best_new_weight <= 0:
            break

        cam = best['camera'].copy()
        cam['id'] = len(selected_cameras) + 1
        selected_cameras.append(cam)

        # Remove covered points from uncovered set
        uncovered -= best_new

        # Stop early if we've covered everything
        if not uncovered:
            break

    return selected_cameras


def optimize_rooms(
    rooms: List[Dict],
    wall_segments: List[List[List[float]]],
    doorways: List[Dict],
    camera_settings: Dict,
) -> List[Dict]:
    all_cameras: List[Dict] = []
    max_cameras = int(camera_settings.get('max_cameras', max(1, len(rooms))))
    camera_range = float(camera_settings.get('camera_range', 150.0))
    camera_fov = float(camera_settings.get('camera_fov', 90.0))

    for room in rooms:
        polygon_points = room.get('polygon', [])
        if len(polygon_points) < 3:
            continue

        room_polygon = _build_polygon(polygon_points)
        if room_polygon.is_empty:
            continue

        room_points = generate_sample_points(polygon_points, COVERAGE_SAMPLE_STEP)
        if not room_points:
            representative = room_polygon.representative_point()
            room_points = [(float(representative.x), float(representative.y))]

        sample_weights = [2.0 if room.get('is_priority') else 1.0 for _ in room_points]
        candidates = generate_boundary_candidates(polygon_points, CANDIDATE_STEP)
        room_limit = 2 if room.get('is_priority') else 1
        room_limit = max(1, min(room_limit, max_cameras))

        cameras = greedy_optimize(
            candidates,
            room_points,
            room_polygon,
            wall_segments,
            sample_weights,
            room_limit,
            camera_range,
            camera_fov,
        )

        for camera in cameras:
            camera['room_id'] = room['id']
        all_cameras.extend(cameras)

    return all_cameras

def optimize_with_genetic_algorithm(
    polygon: List[Tuple[float, float]],
    num_cameras: int = 5,
    camera_range: float = 150.0,
    camera_fov: float = 90.0,
    population_size: int = 50,
    generations: int = 100
) -> List[Dict]:
    """
    Alternative optimization using genetic algorithm.
    More sophisticated but slower than greedy approach.
    """
    # This is a placeholder for a more advanced optimization
    # Can be implemented using libraries like DEAP or custom GA
    
    # For now, fall back to greedy algorithm
    return optimize_camera_placement(
        polygon,
        max_cameras=num_cameras,
        camera_range=camera_range,
        camera_fov=camera_fov
    )