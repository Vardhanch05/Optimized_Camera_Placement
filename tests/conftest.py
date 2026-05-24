import os
import sys
from pathlib import Path

import cv2
import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient


ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


_client_init = httpx.Client.__init__


def _compat_client_init(self, *args, app=None, **kwargs):
    return _client_init(self, *args, **kwargs)


if "app" not in _client_init.__code__.co_varnames:
    httpx.Client.__init__ = _compat_client_init

from backend.main import app


def encode_png(image: np.ndarray) -> bytes:
    success, buffer = cv2.imencode(".png", image)
    assert success, "Failed to encode PNG fixture"
    return buffer.tobytes()


def decode_png(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    assert image is not None, "Failed to decode PNG fixture"
    return image


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def clean_rectangle_image():
    image = np.full((400, 400, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (360, 360), (0, 0, 0), 3)
    return encode_png(image)


@pytest.fixture
def blank_white_image():
    image = np.full((400, 400, 3), 255, dtype=np.uint8)
    return encode_png(image)


@pytest.fixture
def low_contrast_image():
    image = np.full((400, 400, 3), 220, dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (360, 360), (180, 180, 180), -1)
    return encode_png(image)


@pytest.fixture
def noisy_image():
    image = np.full((400, 400, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (360, 360), (0, 0, 0), 3)
    rng = np.random.default_rng(12345)
    noise = rng.normal(0, 25, image.shape).astype(np.int16)
    noisy = np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return encode_png(noisy)


@pytest.fixture
def rotated_rectangle_image(clean_rectangle_image):
    image = decode_png(clean_rectangle_image)
    height, width = image.shape[:2]
    center = (width // 2, height // 2)
    matrix = cv2.getRotationMatrix2D(center, 15, 1.0)
    rotated = cv2.warpAffine(image, matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
    return encode_png(rotated)


@pytest.fixture
def tiny_image():
    image = np.full((50, 50, 3), 255, dtype=np.uint8)
    return encode_png(image)


@pytest.fixture
def oversized_image():
    image = np.full((4100, 4100, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (40, 40), (4060, 4060), (0, 0, 0), 3)
    return encode_png(image)


@pytest.fixture
def large_file_bytes():
    return b"x" * (11 * 1024 * 1024)


@pytest.fixture
def corrupt_image_bytes():
    return os.urandom(1024)
