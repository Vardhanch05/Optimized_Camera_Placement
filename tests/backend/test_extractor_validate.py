import pytest

from backend.extractor import validate_image
from tests.conftest import decode_png


def test_validate_image_accepts_clean_rectangle_image(clean_rectangle_image):
    image = decode_png(clean_rectangle_image)
    result = validate_image(image)
    assert result is not None


def test_validate_image_raises_on_tiny_image(tiny_image):
    image = decode_png(tiny_image)
    with pytest.raises(ValueError):
        validate_image(image)


def test_validate_image_resizes_oversized_image(oversized_image):
    image = decode_png(oversized_image)
    resized = validate_image(image)
    assert max(resized.shape[:2]) <= 4000
