import numpy as np
from shapely.geometry import Polygon
from shapely.prepared import prep
from typing import List, Tuple, Dict
import math

# Sampling / candidate constants (standardize across codebase)
SAMPLE_STEP = 10.0            # default fine sampling step (pixels)
COVERAGE_SAMPLE_STEP = 15.0   # sampling step used for coverage checks during optimization
CANDIDATE_STEP = 30.0         # candidate grid step for camera positions

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

def calculate_coverage(
    polygon: List[Tuple[float, float]],
    cameras: List[Dict],
    sample_step: float = SAMPLE_STEP
) -> int:
    """Calculate number of covered sample points."""
    sample_points = generate_sample_points(polygon, sample_step)

    covered = 0
    for point in sample_points:
        for camera in cameras:
            if is_point_in_camera_view(point, camera):
                covered += 1
                break

    return covered

def calculate_coverage_percentage(
    polygon: List[Tuple[float, float]],
    cameras: List[Dict],
    sample_step: float = SAMPLE_STEP
) -> float:
    """Calculate coverage as a percentage."""
    sample_points = generate_sample_points(polygon, sample_step)
    if not sample_points:
        return 0.0

    covered = 0
    for point in sample_points:
        for camera in cameras:
            if is_point_in_camera_view(point, camera):
                covered += 1
                break

    return round(covered / len(sample_points) * 100, 1)

def optimize_camera_placement(
    polygon: List[Tuple[float, float]],
    max_cameras: int = 10,
    camera_range: float = 150.0,
    camera_fov: float = 90.0,
    candidate_step: float = CANDIDATE_STEP
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
    # Generate candidate positions
    candidates = generate_sample_points(polygon, candidate_step)
    
    if not candidates:
        return []
    
    cameras = []
    angles_to_test = [0, 45, 90, 135, 180, 225, 270, 315]
    
    # Greedy algorithm: place cameras that maximize coverage
    for iteration in range(max_cameras):
        best_camera = None
        best_coverage = 0
        
        # Try each candidate position with different angles
        for pos in candidates:
            for angle in angles_to_test:
                test_camera = {
                    'x': pos[0],
                    'y': pos[1],
                    'angle': angle,
                    'range': camera_range,
                    'fov': camera_fov
                }
                
                # Calculate coverage with this camera added
                test_cameras = cameras + [test_camera]
                coverage = calculate_coverage(polygon, test_cameras, sample_step=COVERAGE_SAMPLE_STEP)
                
                if coverage > best_coverage:
                    best_coverage = coverage
                    best_camera = test_camera
        
        # Check if we found an improvement
        current_coverage = calculate_coverage(polygon, cameras, sample_step=COVERAGE_SAMPLE_STEP)
        
        if best_camera and best_coverage > current_coverage:
            # Add unique ID
            best_camera['id'] = len(cameras) + 1
            cameras.append(best_camera)
        else:
            # No improvement found, stop
            break
    
    return cameras

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