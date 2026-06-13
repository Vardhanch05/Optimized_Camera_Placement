import cv2
import numpy as np


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


def test_extract_rooms_endpoint_returns_room_payload(client):
    response = client.post(
        '/extract-rooms',
        files={'file': ('single.png', _encode(_single_room_image()), 'image/png')},
    )

    assert response.status_code == 200
    data = response.json()
    assert 'rooms' in data
    assert 'wall_segments' in data
    assert 'doorways' in data


def test_extract_rooms_endpoint_two_room_fixture(client):
    response = client.post(
        '/extract-rooms',
        files={'file': ('two_room.png', _encode(_two_room_image()), 'image/png')},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data['rooms']) == 2
    assert len(data['doorways']) == 1