import numpy as np

from backend.extractor import preprocess
from tests.conftest import decode_png


def test_preprocess_returns_binary_values_only(clean_rectangle_image):
    image = decode_png(clean_rectangle_image)
    result = preprocess(image, [])
    unique_values = set(np.unique(result).tolist())
    assert unique_values.issubset({0, 255})


def test_preprocess_does_not_raise_on_low_contrast_image(low_contrast_image):
    image = decode_png(low_contrast_image)
    result = preprocess(image, [])
    assert result is not None


def test_preprocess_does_not_raise_on_noisy_image(noisy_image):
    image = decode_png(noisy_image)
    result = preprocess(image, [])
    assert result is not None


def test_preprocess_does_not_raise_on_rotated_rectangle_image(rotated_rectangle_image):
    image = decode_png(rotated_rectangle_image)
    result = preprocess(image, [])
    assert result is not None


def test_preprocess_does_not_raise_on_blank_white_image(blank_white_image):
    image = decode_png(blank_white_image)
    result = preprocess(image, [])
    assert result is not None
