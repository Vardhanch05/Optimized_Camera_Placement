from backend.optimizer import optimize_rooms


def test_optimize_rooms_returns_room_tagged_cameras():
    rooms = [
        {
            'id': 'room_1',
            'polygon': [[50, 50], [180, 50], [180, 180], [50, 180]],
            'area_px': 1000,
            'centroid': [115, 115],
            'is_priority': False,
        },
        {
            'id': 'room_2',
            'polygon': [[200, 50], [330, 50], [330, 180], [200, 180]],
            'area_px': 1000,
            'centroid': [265, 115],
            'is_priority': True,
        },
    ]
    cameras = optimize_rooms(
        rooms,
        wall_segments=[],
        doorways=[],
        camera_settings={'max_cameras': 4, 'camera_range': 150, 'camera_fov': 90},
    )

    assert cameras
    assert all('room_id' in camera for camera in cameras)