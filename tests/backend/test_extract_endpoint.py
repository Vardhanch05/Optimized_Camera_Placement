from backend.main import app


def _post_extract(client, filename, content, content_type):
    return client.post(
        "/extract",
        files={"file": (filename, content, content_type)},
    )


def test_extract_endpoint_clean_image_returns_required_fields(client, clean_rectangle_image):
    response = _post_extract(client, "clean.png", clean_rectangle_image, "image/png")

    assert response.status_code == 200
    data = response.json()
    required_fields = {
        "outer_polygon",
        "inner_polygons",
        "suggested_priority_zones",
        "canvas_width",
        "canvas_height",
        "warnings",
    }
    assert required_fields.issubset(data.keys())
    assert isinstance(data["warnings"], list)
    assert data["outer_polygon"]


def test_extract_endpoint_blank_image_returns_empty_polygon(client, blank_white_image):
    response = _post_extract(client, "blank.png", blank_white_image, "image/png")

    assert response.status_code == 200
    data = response.json()
    assert data["outer_polygon"] == []
    assert isinstance(data["warnings"], list)
    assert data["warnings"]


def test_extract_endpoint_low_contrast_image_returns_polygon_and_warning(client, low_contrast_image):
    response = _post_extract(client, "low_contrast.png", low_contrast_image, "image/png")

    assert response.status_code == 200
    data = response.json()
    assert data["outer_polygon"]
    assert isinstance(data["warnings"], list)
    assert any("Low contrast image detected" in warning for warning in data["warnings"])


def test_extract_endpoint_large_file_returns_413(client, large_file_bytes):
    response = _post_extract(client, "large.png", large_file_bytes, "image/png")

    assert response.status_code == 413
    assert response.json()["detail"] == "File too large. Maximum allowed size is 10MB."


def test_extract_endpoint_txt_file_returns_415(client):
    response = _post_extract(client, "notes.txt", b"not an image", "text/plain")

    assert response.status_code == 415
    assert response.json()["detail"] == "Unsupported file type. Please upload a PNG, JPEG, or WEBP image."


def test_extract_endpoint_corrupt_png_returns_400(client, corrupt_image_bytes):
    response = _post_extract(client, "corrupt.png", corrupt_image_bytes, "image/png")

    assert response.status_code == 400
    assert response.json()["detail"] == "Could not read image file. The file may be corrupt or in an unsupported format."
