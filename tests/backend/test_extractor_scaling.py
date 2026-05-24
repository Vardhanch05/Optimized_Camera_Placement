from backend.extractor import scale_to_canvas


def test_scale_to_canvas_returns_points_within_bounds():
    polygons = {
        "outer_polygon": [[40.0, 40.0], [40.0, 360.0], [360.0, 360.0], [360.0, 40.0], [40.0, 40.0]],
        "inner_polygons": [],
    }

    scaled = scale_to_canvas(polygons, (400, 400), canvas_width=800, canvas_height=600, padding=40)

    assert scaled["outer_polygon"]
    for x, y in scaled["outer_polygon"]:
        assert 0 <= x <= 800
        assert 0 <= y <= 600


def test_scale_to_canvas_respects_padding():
    polygons = {
        "outer_polygon": [[40.0, 40.0], [40.0, 360.0], [360.0, 360.0], [360.0, 40.0], [40.0, 40.0]],
        "inner_polygons": [],
    }

    padding = 40
    scaled = scale_to_canvas(polygons, (400, 400), canvas_width=800, canvas_height=600, padding=padding)

    for x, y in scaled["outer_polygon"]:
        assert x >= padding
        assert y >= padding
        assert x <= 800 - padding
        assert y <= 600 - padding


def test_scale_to_canvas_does_not_raise_on_empty_polygon():
    scaled = scale_to_canvas({"outer_polygon": [], "inner_polygons": []}, (400, 400))

    assert scaled == {"outer_polygon": [], "inner_polygons": []}
