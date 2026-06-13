import logging
import math
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from shapely.geometry import Polygon
from skimage.morphology import skeletonize

try:
    from .extractor import validate_image
except ImportError:
    from extractor import validate_image


logger = logging.getLogger(__name__)


def extract_wall_mask(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

    if float(np.std(gray)) < 30.0:
        wall_mask = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            5,
        )
    else:
        _, wall_mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel)
    return wall_mask.astype(np.uint8)


def thin_walls(wall_mask: np.ndarray) -> np.ndarray:
    skeleton = skeletonize(wall_mask > 0)
    return (skeleton.astype(np.uint8)) * 255


def detect_wall_segments(skeleton: np.ndarray) -> List[List[List[float]]]:
    HOUGH_RHO = 1
    HOUGH_THETA = np.pi / 180
    HOUGH_THRESHOLD = 30
    HOUGH_MIN_LINE_LENGTH = 20
    HOUGH_MAX_LINE_GAP = 8
    MIN_SEGMENT_LENGTH = 15.0

    lines = cv2.HoughLinesP(
        skeleton,
        rho=HOUGH_RHO,
        theta=HOUGH_THETA,
        threshold=HOUGH_THRESHOLD,
        minLineLength=HOUGH_MIN_LINE_LENGTH,
        maxLineGap=HOUGH_MAX_LINE_GAP,
    )
    if lines is None:
        return []

    segments: List[List[List[float]]] = []

    def length(segment: List[List[float]]) -> float:
        (x1, y1), (x2, y2) = segment
        return float(math.hypot(x2 - x1, y2 - y1))

    for entry in lines.reshape(-1, 4):
        x1, y1, x2, y2 = [float(value) for value in entry]
        segment = [[x1, y1], [x2, y2]]
        if length(segment) < MIN_SEGMENT_LENGTH:
            continue
        duplicate = False
        for existing in segments:
            if (
                np.hypot(existing[0][0] - segment[0][0], existing[0][1] - segment[0][1]) <= 5
                and np.hypot(existing[1][0] - segment[1][0], existing[1][1] - segment[1][1]) <= 5
            ) or (
                np.hypot(existing[0][0] - segment[1][0], existing[0][1] - segment[1][1]) <= 5
                and np.hypot(existing[1][0] - segment[0][0], existing[1][1] - segment[0][1]) <= 5
            ):
                duplicate = True
                break
        if not duplicate:
            segments.append(segment)

    return segments


def _room_flood_mask(skeleton: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    thick_walls = cv2.dilate(skeleton, kernel, iterations=1)
    return cv2.bitwise_not(thick_walls)


def _close_wall_gaps_from_segments(skeleton: np.ndarray, segments: List[List[List[float]]]) -> np.ndarray:
    closed = np.zeros_like(skeleton, dtype=np.uint8)
    for segment in segments:
        if len(segment) < 2:
            continue
        pt1 = tuple(int(round(value)) for value in segment[0])
        pt2 = tuple(int(round(value)) for value in segment[1])
        cv2.line(closed, pt1, pt2, 255, 3)
    if np.count_nonzero(closed) == 0:
        return skeleton
    return cv2.bitwise_or(skeleton, closed)


def segment_rooms(skeleton: np.ndarray, wall_mask: np.ndarray) -> List[Dict]:
    free_space = cv2.bitwise_not(wall_mask)
    dist = cv2.distanceTransform(free_space, cv2.DIST_L2, 5)
    if float(dist.max()) <= 0:
        return []

    sure_foreground = np.uint8(dist > max(2.0, 0.35 * float(dist.max()))) * 255
    num_markers, markers = cv2.connectedComponents(sure_foreground)
    markers = markers + 1
    markers[wall_mask > 0] = 0

    color = cv2.cvtColor(free_space, cv2.COLOR_GRAY2BGR)
    watershed_markers = cv2.watershed(color, markers.astype(np.int32))

    num_labels = int(watershed_markers.max())
    labels = watershed_markers
    height, width = free_space.shape[:2]
    image_area = float(height * width)

    rooms: List[Dict] = []
    for label in range(2, num_labels + 1):
        region = labels == label
        area_px = int(np.count_nonzero(region))
        if area_px < max(50, int(0.01 * image_area)):
            continue

        ys, xs = np.where(region)
        if len(xs) == 0 or len(ys) == 0:
            continue
        x = int(xs.min())
        y = int(ys.min())
        w = int(xs.max() - xs.min() + 1)
        h = int(ys.max() - ys.min() + 1)
        if x <= 0 or y <= 0 or x + w >= width - 1 or y + h >= height - 1:
            continue

        rooms.append(
            {
                "id": f"room_{len(rooms) + 1}",
                "pixel_region": region,
                "area_px": area_px,
                "centroid": [float(xs.mean()), float(ys.mean())],
                "bounding_box": [x, y, w, h],
            }
        )

    rooms.sort(key=lambda room: room["area_px"], reverse=True)
    for index, room in enumerate(rooms, start=1):
        room["id"] = f"room_{index}"
    return rooms


def extract_room_polygons(rooms: List[Dict], image_shape: Tuple[int, int]) -> List[Dict]:
    updated_rooms: List[Dict] = []
    for room in rooms:
        mask = room.get("pixel_region")
        if mask is None:
            continue

        region = (mask.astype(np.uint8)) * 255
        contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        contour = max(contours, key=cv2.contourArea)
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.01 * perimeter, True) if perimeter > 0 else contour
        points = [[float(point[0][0]), float(point[0][1])] for point in approx]
        if len(points) < 3:
            continue

        try:
            polygon = Polygon(points)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            if polygon.is_empty:
                continue
            if isinstance(polygon, Polygon):
                polygon_points = [[float(x), float(y)] for x, y in polygon.exterior.coords[:-1]]
            else:
                polygon = max(list(polygon.geoms), key=lambda geom: geom.area)
                polygon_points = [[float(x), float(y)] for x, y in polygon.exterior.coords[:-1]]
        except Exception:
            continue

        if len(polygon_points) < 3:
            continue

        updated = dict(room)
        updated["polygon"] = polygon_points
        updated_rooms.append(updated)

    return updated_rooms


def _room_id_for_point(point: Tuple[float, float], rooms: List[Dict]) -> Optional[str]:
    px, py = int(round(point[0])), int(round(point[1]))
    for room in rooms:
        mask = room.get("pixel_region")
        if mask is None:
            continue
        if 0 <= py < mask.shape[0] and 0 <= px < mask.shape[1] and bool(mask[py, px]):
            return room["id"]
    return None


def detect_doorways(skeleton: np.ndarray, rooms: List[Dict]) -> List[Dict]:
    segments = detect_wall_segments(skeleton)
    if len(segments) < 2:
        return []

    doorways: List[Dict] = []
    seen = set()

    def orientation(segment: List[List[float]]) -> float:
        (x1, y1), (x2, y2) = segment
        return math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180

    for left_index in range(len(segments)):
        left = segments[left_index]
        left_orientation = orientation(left)
        for right_index in range(left_index + 1, len(segments)):
            right = segments[right_index]
            right_orientation = orientation(right)

            if abs(left_orientation - right_orientation) > 12 and abs(abs(left_orientation - right_orientation) - 180) > 12:
                continue

            candidate_pairs = [
                (tuple(left[0]), tuple(right[0])),
                (tuple(left[0]), tuple(right[1])),
                (tuple(left[1]), tuple(right[0])),
                (tuple(left[1]), tuple(right[1])),
            ]
            endpoint_a, endpoint_b = min(
                candidate_pairs,
                key=lambda pair: np.hypot(pair[0][0] - pair[1][0], pair[0][1] - pair[1][1]),
            )
            gap_length = float(np.hypot(endpoint_a[0] - endpoint_b[0], endpoint_a[1] - endpoint_b[1]))
            if gap_length < 4.0 or gap_length > 90.0:
                continue

            midpoint = ((endpoint_a[0] + endpoint_b[0]) / 2.0, (endpoint_a[1] + endpoint_b[1]) / 2.0)
            dx = endpoint_b[0] - endpoint_a[0]
            dy = endpoint_b[1] - endpoint_a[1]
            normal_length = math.hypot(dx, dy) or 1.0
            normal = (-dy / normal_length, dx / normal_length)
            first_room = _room_id_for_point((midpoint[0] + normal[0] * 6, midpoint[1] + normal[1] * 6), rooms)
            second_room = _room_id_for_point((midpoint[0] - normal[0] * 6, midpoint[1] - normal[1] * 6), rooms)

            distinct_rooms = [room_id for room_id in (first_room, second_room) if room_id]
            if len(set(distinct_rooms)) != 2:
                continue

            ordered = tuple(sorted((distinct_rooms[0], distinct_rooms[1])))
            key = (ordered[0], ordered[1], round(midpoint[0], 1), round(midpoint[1], 1))
            if key in seen:
                continue
            seen.add(key)

            doorways.append(
                {
                    "from_room": ordered[0],
                    "to_room": ordered[1],
                    "midpoint": [float(midpoint[0]), float(midpoint[1])],
                    "gap_segment": [[float(endpoint_a[0]), float(endpoint_a[1])], [float(endpoint_b[0]), float(endpoint_b[1])]],
                }
            )

    return doorways


def scale_all_to_canvas(
    rooms: List[Dict],
    wall_segments: List[List[List[float]]],
    doorways: List[Dict],
    image_size: Tuple[int, int],
    canvas_width: int = 800,
    canvas_height: int = 600,
    padding: int = 40,
):
    points: List[Tuple[float, float]] = []
    for room in rooms:
        points.extend((float(x), float(y)) for x, y in room.get("polygon", []))
        centroid = room.get("centroid") or []
        if len(centroid) == 2:
            points.append((float(centroid[0]), float(centroid[1])))
    for segment in wall_segments:
        points.extend((float(x), float(y)) for x, y in segment)
    for doorway in doorways:
        midpoint = doorway.get("midpoint") or []
        if len(midpoint) == 2:
            points.append((float(midpoint[0]), float(midpoint[1])))
        points.extend((float(x), float(y)) for x, y in doorway.get("gap_segment", []))

    if points:
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
    else:
        min_x = min_y = 0.0
        max_x, max_y = float(image_size[1]), float(image_size[0])

    width = max(max_x - min_x, 1.0)
    height = max(max_y - min_y, 1.0)
    scale = min((canvas_width - 2 * padding) / width, (canvas_height - 2 * padding) / height)
    offset_x = (canvas_width - width * scale) / 2.0 - min_x * scale
    offset_y = (canvas_height - height * scale) / 2.0 - min_y * scale

    def transform(point: Tuple[float, float]) -> List[float]:
        return [float(point[0] * scale + offset_x), float(point[1] * scale + offset_y)]

    scaled_rooms = []
    for room in rooms:
        updated = dict(room)
        updated["polygon"] = [transform((float(x), float(y))) for x, y in room.get("polygon", [])]
        centroid = room.get("centroid") or [0.0, 0.0]
        if len(centroid) == 2:
            updated["centroid"] = transform((float(centroid[0]), float(centroid[1])))
        scaled_rooms.append(updated)

    scaled_segments = [[transform((float(x1), float(y1))), transform((float(x2), float(y2)))] for (x1, y1), (x2, y2) in wall_segments]

    scaled_doorways = []
    for doorway in doorways:
        updated = dict(doorway)
        midpoint = doorway.get("midpoint") or [0.0, 0.0]
        if len(midpoint) == 2:
            updated["midpoint"] = transform((float(midpoint[0]), float(midpoint[1])))
        updated["gap_segment"] = [transform((float(x), float(y))) for x, y in doorway.get("gap_segment", [])]
        scaled_doorways.append(updated)

    return scaled_rooms, scaled_segments, scaled_doorways


def suggest_priority_rooms(rooms: List[Dict], doorways: List[Dict]) -> List[Dict]:
    adjacency: Dict[str, set] = {room["id"]: set() for room in rooms}
    doorway_counts: Dict[str, int] = {room["id"]: 0 for room in rooms}

    for doorway in doorways:
        from_room = doorway.get("from_room")
        to_room = doorway.get("to_room")
        if from_room in adjacency and to_room in adjacency and from_room != to_room:
            adjacency[from_room].add(to_room)
            adjacency[to_room].add(from_room)
            doorway_counts[from_room] += 1
            doorway_counts[to_room] += 1

    priority_ids = set()
    for room in rooms:
        if len(adjacency.get(room["id"], set())) >= 3:
            priority_ids.add(room["id"])

    if rooms:
        entrance_room = max(rooms, key=lambda room: (doorway_counts.get(room["id"], 0), room.get("area_px", 0)))
        priority_ids.add(entrance_room["id"])

    updated_rooms = []
    for room in rooms:
        updated = dict(room)
        updated["is_priority"] = room["id"] in priority_ids
        updated_rooms.append(updated)
    return updated_rooms


def extract_rooms(image: np.ndarray, canvas_width: int = 800, canvas_height: int = 600) -> Dict:
    warnings: List[str] = []
    try:
        image = validate_image(image)
        wall_mask = extract_wall_mask(image)
        skeleton = thin_walls(wall_mask)
        wall_segments = detect_wall_segments(skeleton)
        rooms = segment_rooms(skeleton, wall_mask)
        rooms = extract_room_polygons(rooms, image.shape[:2])
        doorways = detect_doorways(skeleton, rooms)
        scaled_rooms, scaled_segments, scaled_doorways = scale_all_to_canvas(
            rooms,
            wall_segments,
            doorways,
            image.shape[:2],
            canvas_width=canvas_width,
            canvas_height=canvas_height,
        )
        scaled_rooms = suggest_priority_rooms(scaled_rooms, scaled_doorways)

        return {
            "rooms": [
                {
                    "id": room["id"],
                    "polygon": room.get("polygon", []),
                    "area_px": float(room.get("area_px", 0)),
                    "centroid": room.get("centroid", [0.0, 0.0]),
                    "is_priority": bool(room.get("is_priority", False)),
                }
                for room in scaled_rooms
            ],
            "wall_segments": scaled_segments,
            "doorways": [
                {
                    "from_room": doorway.get("from_room", ""),
                    "to_room": doorway.get("to_room", ""),
                    "midpoint": doorway.get("midpoint", [0.0, 0.0]),
                    "gap_segment": doorway.get("gap_segment", []),
                }
                for doorway in scaled_doorways
            ],
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": warnings,
        }
    except Exception:
        logger.exception("Unexpected error during room extraction")
        return {
            "rooms": [],
            "wall_segments": [],
            "doorways": [],
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": ["Room extraction failed unexpectedly — please draw the layout manually"],
        }