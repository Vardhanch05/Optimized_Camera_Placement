import cv2
import numpy as np

from backend.room_extractor import extract_rooms


def _encode(image):
    success, buffer = cv2.imencode('.png', image)
    assert success
    return buffer.tobytes()


def _single_room_image():
    image = np.full((400, 400, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (360, 360), (0, 0, 0), 4)
    return image


def _two_room_image():
    image = np.full((400, 400, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (360, 360), (0, 0, 0), 4)
    cv2.line(image, (200, 40), (200, 160), (0, 0, 0), 4)
    cv2.line(image, (200, 220), (200, 360), (0, 0, 0), 4)
    return image


def test_extract_rooms_single_room_smoke():
    result = extract_rooms(_single_room_image())

    assert isinstance(result["rooms"], list)
    assert len(result["rooms"]) == 1
    assert isinstance(result["wall_segments"], list)
    assert result["wall_segments"]
    assert isinstance(result["doorways"], list)
    assert result["doorways"] == []
    assert result["warnings"] == []


def test_extract_rooms_two_room_doorway_smoke():
    result = extract_rooms(_two_room_image())

    assert len(result["rooms"]) == 2
    assert len(result["doorways"]) == 1
    doorway = result["doorways"][0]
    assert doorway["from_room"] != doorway["to_room"]


def test_extract_rooms_returns_lists_on_failure():
    result = extract_rooms(np.zeros((20, 20, 3), dtype=np.uint8))

    assert result["rooms"] == []
    assert result["wall_segments"] == []
    assert result["doorways"] == []