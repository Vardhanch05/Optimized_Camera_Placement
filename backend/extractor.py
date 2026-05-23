import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union
from typing import List, Dict, Tuple


def validate_image(image: np.ndarray) -> None:
    if image is None:
        raise ValueError("Image could not be decoded")
    if image.size == 0:
        raise ValueError("Empty image")
    if len(image.shape) < 2:
        raise ValueError("Unsupported image shape")


def preprocess(image: np.ndarray) -> np.ndarray:
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Denoise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Attempt Otsu thresholding
    _, otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # If low contrast (small std dev), use adaptive threshold
    if np.std(blurred) < 10:
        binarized = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
    else:
        binarized = otsu

    # Morphological closing to bridge gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(binarized, cv2.MORPH_CLOSE, kernel)

    return closed


def _deskew_image(binary: np.ndarray, original: np.ndarray) -> Tuple[np.ndarray, float]:
    # Find largest contour and deskew based on its minAreaRect
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return original, 0.0

    largest = max(contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(largest)
    angle = rect[-1]
    if angle < -45:
        angle = angle + 90

    (h, w) = original.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(original, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return rotated, angle


def detect_contours(binary: np.ndarray) -> List[np.ndarray]:
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = binary.shape[:2]
    image_area = h * w

    filtered = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < max(100, 0.0005 * image_area):
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        aspect = max(cw / max(1, ch), ch / max(1, cw))
        # Filter very thin lines unless they're large
        if aspect > 15 and area < 0.01 * image_area:
            continue
        filtered.append(c)

    # Sort by area descending
    filtered.sort(key=lambda c: cv2.contourArea(c), reverse=True)
    return filtered


def extract_polygons(contours: List[np.ndarray], image_shape: Tuple[int, int]) -> Dict[str, List[List[Tuple[float, float]]]]:
    polygons = []
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.01 * peri, True)
        pts = [(int(p[0][0]), int(p[0][1])) for p in approx]
        if len(pts) < 3:
            continue
        try:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty or poly.area < 1:
                continue
            polygons.append(poly)
        except Exception:
            continue

    if not polygons:
        return {"outer_polygon": [], "inner_polygons": []}

    # Merge overlapping small polygons
    merged = unary_union(polygons)
    # Ensure we have a list of polygons
    polys = []
    if isinstance(merged, Polygon):
        polys = [merged]
    else:
        try:
            polys = list(merged)
        except Exception:
            polys = []

    # Sort by area descending
    polys.sort(key=lambda p: p.area, reverse=True)

    outer = polys[0]
    inners = []
    for p in polys[1:]:
        # Keep as inner if inside outer
        if outer.contains(p) or outer.intersects(p):
            inners.append(p)

    def coords_from_poly(p: Polygon):
        return [[float(x), float(y)] for x, y in list(p.exterior.coords)]

    return {
        "outer_polygon": coords_from_poly(outer),
        "inner_polygons": [coords_from_poly(ip) for ip in inners]
    }


def scale_to_canvas(polygons: Dict[str, List[List[Tuple[float, float]]]], image_size: Tuple[int, int], canvas_width: int = 800, canvas_height: int = 600, padding: int = 40) -> Dict[str, List[List[float]]]:
    iw, ih = image_size[1], image_size[0]
    outer = polygons.get("outer_polygon", [])
    if not outer:
        return {"outer_polygon": [], "inner_polygons": []}

    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    width = maxx - minx
    height = maxy - miny

    scale_x = (canvas_width - 2 * padding) / max(width, 1)
    scale_y = (canvas_height - 2 * padding) / max(height, 1)
    scale = min(scale_x, scale_y)

    def transform_point(pt):
        x = (pt[0] - minx) * scale + padding
        y = (pt[1] - miny) * scale + padding
        return [float(x), float(y)]

    outer_scaled = [transform_point(p) for p in outer]
    inner_scaled = []
    for ip in polygons.get("inner_polygons", []):
        inner_scaled.append([transform_point(p) for p in ip])

    return {"outer_polygon": outer_scaled, "inner_polygons": inner_scaled}


def suggest_priority_zones(binary: np.ndarray, outer_polygon: List[List[float]]) -> List[dict]:
    zones = []
    # Heuristic: find elongated components likely to be doors/corridors
    contours = detect_contours(binary)
    h, w = binary.shape[:2]
    for c in contours[:20]:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        if cw == 0 or ch == 0:
            continue
        aspect = max(cw / ch, ch / cw)
        if area < 50:
            continue
        if 3.0 <= aspect <= 30.0:
            # create a suggested zone centered on bounding box
            zx = float(x + cw / 2)
            zy = float(y + ch / 2)
            zw = float(cw)
            zh = float(ch)
            zones.append({"x": zx, "y": zy, "width": zw, "height": zh, "weight": 2.0, "label": "suggested"})

    return zones


def generate_warnings(image: np.ndarray, polygons: Dict[str, List]) -> List[str]:
    warnings = []
    if not polygons.get("outer_polygon"):
        warnings.append("No outer polygon detected; extraction failed or image is empty.")
    if image is None or image.size == 0:
        warnings.append("Input image appears empty or unreadable.")
    return warnings


def extract_layout(image: np.ndarray, canvas_width: int = 800, canvas_height: int = 600) -> Dict:
    warnings = []
    try:
        validate_image(image)
    except ValueError as e:
        return {
            "outer_polygon": [],
            "inner_polygons": [],
            "suggested_priority_zones": [],
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": [str(e)]
        }

    try:
        pre = preprocess(image)
        deskewed, angle = _deskew_image(pre, image)
        if abs(angle) > 1.0:
            warnings.append(f"Image deskewed by {angle:.1f} degrees")

        bin_pre = preprocess(deskewed)
        contours = detect_contours(bin_pre)
        polygons = extract_polygons(contours, deskewed.shape[:2])
        scaled = scale_to_canvas(polygons, deskewed.shape[:2], canvas_width=canvas_width, canvas_height=canvas_height)
        zones = suggest_priority_zones(bin_pre, scaled.get("outer_polygon", []))
        warnings.extend(generate_warnings(deskewed, scaled))

        return {
            "outer_polygon": scaled.get("outer_polygon", []),
            "inner_polygons": scaled.get("inner_polygons", []),
            "suggested_priority_zones": zones,
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": warnings
        }
    except Exception as e:
        return {
            "outer_polygon": [],
            "inner_polygons": [],
            "suggested_priority_zones": [],
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": [f"Extraction error: {str(e)}"]
        }
