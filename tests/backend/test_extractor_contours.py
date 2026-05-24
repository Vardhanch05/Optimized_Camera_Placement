import cv2
import numpy as np

from backend.extractor import detect_contours, preprocess
from tests.conftest import decode_png


def test_detect_contours_on_clean_rectangle_image_returns_contour(clean_rectangle_image):
    image = decode_png(clean_rectangle_image)
    binary = preprocess(image, [])
    contours = detect_contours(binary, [])
    assert len(contours) >= 1


def test_detect_contours_filters_small_contours_by_area():
    binary = np.zeros((400, 400), dtype=np.uint8)
    cv2.rectangle(binary, (40, 40), (240, 240), 255, -1)
    cv2.rectangle(binary, (10, 10), (12, 12), 255, -1)

    contours = detect_contours(binary, [])
    assert len(contours) == 1


def test_detect_contours_filters_extreme_aspect_ratio_contours():
    binary = np.zeros((400, 400), dtype=np.uint8)
    cv2.rectangle(binary, (10, 190), (390, 200), 255, -1)

    contours = detect_contours(binary, [])
    assert contours == []
