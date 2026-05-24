from backend.extractor import extract_layout, generate_warnings, preprocess
from tests.conftest import decode_png


def test_generate_warnings_always_returns_list(blank_white_image):
    image = decode_png(blank_white_image)
    warnings = generate_warnings(image, {"outer_polygon": []})

    assert isinstance(warnings, list)


def test_warnings_list_contains_no_duplicate_strings(low_contrast_image):
    image = decode_png(low_contrast_image)
    result = extract_layout(image)

    warnings = result["warnings"]
    assert warnings == list(dict.fromkeys(warnings))


def test_low_contrast_image_produces_low_contrast_warning(low_contrast_image):
    image = decode_png(low_contrast_image)
    warnings = []
    preprocess(image, warnings)

    assert any("Low contrast image detected" in warning for warning in warnings)


def test_empty_outer_polygon_produces_no_boundary_warning(blank_white_image):
    image = decode_png(blank_white_image)
    warnings = generate_warnings(image, {"outer_polygon": []})

    assert any("No room boundary detected" in warning for warning in warnings)
