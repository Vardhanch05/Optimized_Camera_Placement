import cv2
import numpy as np

from backend.extractor import extract_polygons


def test_extract_polygons_on_rectangle_contour_returns_outer_polygon():
    binary = np.zeros((400, 400), dtype=np.uint8)
    cv2.rectangle(binary, (40, 40), (360, 360), 255, -1)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    polygons = extract_polygons(contours, binary.shape[:2], [])

    assert "outer_polygon" in polygons
    assert len(polygons["outer_polygon"]) >= 3


def test_extract_polygons_returns_outer_polygon_key_for_empty_contours():
    polygons = extract_polygons([], (400, 400), [])

    assert "outer_polygon" in polygons
    assert polygons["outer_polygon"] == []


def test_extract_polygons_does_not_raise_on_self_intersecting_contour():
    contour = np.array(
        [[[50, 50]], [[350, 350]], [[50, 350]], [[350, 50]]],
        dtype=np.int32,
    )

    polygons = extract_polygons([contour], (400, 400), [])

    assert "outer_polygon" in polygons
