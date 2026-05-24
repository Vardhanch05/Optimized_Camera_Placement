import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from shapely.geometry import Polygon
from shapely.ops import unary_union
import logging


logger = logging.getLogger(__name__)


def validate_image(image: np.ndarray) -> np.ndarray:
    if image is None:
        raise ValueError("Image could not be decoded")
    if image.size == 0:
        raise ValueError("Empty image")
    if len(image.shape) < 2:
        raise ValueError("Unsupported image shape")

    height, width = image.shape[:2]
    if height < 100 or width < 100:
        raise ValueError("Image too small to process — minimum size is 100x100")

    if height > 4000 or width > 4000:
        scale = 4000.0 / max(height, width)
        new_width = max(1, int(round(width * scale)))
        new_height = max(1, int(round(height * scale)))
        image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)

    return image


def preprocess(image: np.ndarray, warnings: Optional[List[str]] = None) -> np.ndarray:
    """Convert image to a cleaned binary image with denoising, contrast handling.

    Adds warnings to the provided list when applicable.
    """
    if warnings is None:
        warnings = []

    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Measure contrast
    std = float(np.std(gray))
    low_contrast = std < 30.0
    if low_contrast:
        warnings.append("Low contrast image detected — results may be inaccurate")

    # Measure high-frequency noise via Laplacian
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    mean_abs_lap = float(np.mean(np.abs(lap)))

    # Choose denoising strength
    h = 20 if mean_abs_lap > 100.0 else 10

    # Apply fast denoising (grayscale)
    denoised = cv2.fastNlMeansDenoising(gray, None, h, 7, 21)

    # Small gaussian blur to stabilize thresholding
    blurred = cv2.GaussianBlur(denoised, (5, 5), 0)

    # Threshold
    if low_contrast:
        binarized = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
    else:
        _, otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        binarized = otsu

    # Morphological closing to bridge gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(binarized, cv2.MORPH_CLOSE, kernel)

    return closed


def _deskew_image(original: np.ndarray, warnings: Optional[List[str]] = None) -> Tuple[np.ndarray, float]:
    """Estimate skew using dark pixels and deskew if angle is reasonable.

    Returns the possibly-rotated image and the applied angle. Adds warning
    if rotation is too large or skipped.
    """
    if warnings is None:
        warnings = []

    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    image_area = h * w

    # Threshold for dark pixels (invert so dark regions are white)
    _, dark = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)
    dark_count = int(cv2.countNonZero(dark))

    # If very few dark pixels, skip deskew (likely blank or minimal content)
    if dark_count < max(10, 0.002 * image_area):
        return original, 0.0

    # Collect points where dark mask is set
    pts = np.column_stack(np.where(dark > 0)).astype(np.float32)
    if pts.shape[0] < 3:
        return original, 0.0

    try:
        rect = cv2.minAreaRect(pts)
        angle = rect[-1]
        # Normalize angle to [-90,90]
        if angle < -45:
            angle = angle + 90

        if abs(angle) <= 45:
            # Apply rotation correction
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(original, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            return rotated, float(angle)
        else:
            warnings.append("Image appears heavily rotated — consider reorienting before uploading")
            return original, float(angle)
    except Exception as e:
        logger.exception("Deskew estimation failed")
        warnings.append("Could not estimate image rotation; proceeding without deskew")
        return original, 0.0


def detect_contours(binary: np.ndarray, warnings: Optional[List[str]] = None) -> List[np.ndarray]:
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = binary.shape[:2]
    image_area = h * w

    filtered = []
    for c in contours:
        try:
            area = cv2.contourArea(c)
            # Discard tiny contours (less than 0.1% of image area)
            if area < max(100, 0.001 * image_area):
                continue

            x, y, cw, ch = cv2.boundingRect(c)
            aspect = cw / max(1, ch)
            inv_aspect = ch / max(1, cw)
            max_aspect = max(aspect, inv_aspect)
            # Discard extreme aspect ratio contours
            if max_aspect > 20.0:
                continue

            # Circularity check
            peri = cv2.arcLength(c, True)
            if peri > 0:
                circularity = (4.0 * np.pi * area) / (peri * peri)
                if circularity > 0.85:
                    continue

            filtered.append(c)
        except Exception:
            # Skip problematic contour
            continue

    # Sort by area descending
    filtered.sort(key=lambda c: cv2.contourArea(c), reverse=True)
    return filtered


def extract_polygons(contours: List[np.ndarray], image_shape: Tuple[int, int], warnings: Optional[List[str]] = None) -> Dict[str, List[List[Tuple[float, float]]]]:
    """
    Convert contours to shapely Polygons, merge and return outer + inner polygons.
    This function expects Shapely to be available (imported at module top).
    """
    if warnings is None:
        warnings = []

    polygons = []
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.01 * peri, True)
        pts = [(int(p[0][0]), int(p[0][1])) for p in approx]
        # Discard if too few vertices after simplification
        if len(pts) < 4:
            continue
        try:
            poly = Polygon(pts)
            if not poly.is_valid:
                try:
                    poly = poly.buffer(0)
                except Exception:
                    warnings.append("A contour failed to repair and was skipped")
                    continue
            if poly.is_empty or poly.area < 1:
                continue
            polygons.append(poly)
        except Exception:
            # If Shapely fails, skip this contour but continue
            warnings.append("A contour could not be converted to polygon and was skipped")
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

    # Shapely extraction path used

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
        warnings.append("No room boundary detected — please draw the polygon manually")
    if image is None or image.size == 0:
        warnings.append("Input image appears empty or unreadable.")
    return warnings


def extract_layout(image: np.ndarray, canvas_width: int = 800, canvas_height: int = 600) -> Dict:
    warnings: List[str] = []
    try:
        image = validate_image(image)
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
        # Preprocess with warnings capture
        pre = preprocess(image, warnings)

        # Deskew using original image and capture any deskew warnings
        deskewed, angle = _deskew_image(image, warnings)
        if abs(angle) > 1.0:
            warnings.append(f"Image deskewed by {angle:.1f} degrees")

        # Re-run preprocessing on deskewed image
        bin_pre = preprocess(deskewed, warnings)

        # Blank / near-blank detection: count dark pixels (0 values)
        try:
            h2, w2 = bin_pre.shape[:2]
            total_px = float(h2 * w2)
            nonzero = int(cv2.countNonZero(bin_pre))
            # Determine minority pixel count (object pixels) regardless of polarity
            dark_count = min(nonzero, int(total_px) - nonzero)
        except Exception:
            dark_count = 0
            total_px = 1.0

        # Measure high-frequency content to avoid flagging images with edges
        try:
            gray_deskew = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
            gray_std_deskew = float(np.std(gray_deskew))
            mean_abs_lap_deskew = float(np.mean(np.abs(cv2.Laplacian(gray_deskew, cv2.CV_64F))))
        except Exception:
            gray_std_deskew = 0.0
            mean_abs_lap_deskew = 0.0

        # Only treat as blank if minority pixel count is very small and the image is nearly uniform.
        if dark_count < 0.005 * total_px and gray_std_deskew < 2.0 and mean_abs_lap_deskew < 5.0:
            # Treat as blank/near-blank: return empty polygons and warning
            warnings.append("No room boundary detected — please draw the polygon manually")
            warnings = list(dict.fromkeys(warnings))
            return {
                "outer_polygon": [],
                "inner_polygons": [],
                "suggested_priority_zones": [],
                "canvas_width": canvas_width,
                "canvas_height": canvas_height,
                "warnings": warnings
            }

        contours = detect_contours(bin_pre, warnings)
        polygons = extract_polygons(contours, deskewed.shape[:2], warnings)
        scaled = scale_to_canvas(polygons, deskewed.shape[:2], canvas_width=canvas_width, canvas_height=canvas_height)
        zones = suggest_priority_zones(bin_pre, scaled.get("outer_polygon", []))
        warnings.extend(generate_warnings(deskewed, scaled))

        # If no outer polygon found, return empty and a user-facing warning
        if not scaled.get("outer_polygon"):
            warnings = list(dict.fromkeys(warnings))
            return {
                "outer_polygon": [],
                "inner_polygons": [],
                "suggested_priority_zones": zones,
                "canvas_width": canvas_width,
                "canvas_height": canvas_height,
                "warnings": warnings
            }

        # Deduplicate warnings while preserving order
        warnings = list(dict.fromkeys(warnings))

        return {
            "outer_polygon": scaled.get("outer_polygon", []),
            "inner_polygons": scaled.get("inner_polygons", []),
            "suggested_priority_zones": zones,
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": warnings
        }
    except Exception as e:
        # Log unexpected exception but do not expose internals to caller
        logger.exception("Unexpected error during extraction")
        return {
            "outer_polygon": [],
            "inner_polygons": [],
            "suggested_priority_zones": [],
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "warnings": ["Extraction failed unexpectedly — please draw the polygon manually"]
        }
