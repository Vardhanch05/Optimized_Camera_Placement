#!/usr/bin/env python3
"""Helper to run the backend reliably.

Checks whether port 8000 is in use and attempts to stop an existing Python
process that is listening there (to avoid "address already in use" errors),
then starts the FastAPI app via Uvicorn programmatically.

Usage: python run_server.py
"""
import os
import re
import signal
import subprocess
import time
from pathlib import Path

PORT = 8000


def find_pid_on_port(port: int):
    try:
        out = subprocess.check_output(["ss", "-ltnp"], stderr=subprocess.DEVNULL).decode()
    except Exception:
        return None

    # Look for lines containing :PORT
    for line in out.splitlines():
        if f":{port} " in line or f":{port}\n" in line:
            # Extract pid=NUMBER from users:(("...",pid=1234,fd=...))
            m = re.search(r"pid=(\d+)", line)
            if m:
                return int(m.group(1))
    return None


def safe_kill(pid: int):
    try:
        # Check the cmdline to ensure it's a Python process in this repo
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            cmd = f.read().decode().replace('\x00', ' ')
    except Exception:
        cmd = ''

    # Only kill if it looks like a Python process or backend/main
    if 'python' in cmd or 'backend/main.py' in cmd:
        print(f"Stopping existing process {pid}: {cmd}")
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
        # wait for it to exit
        for _ in range(10):
            if not Path(f"/proc/{pid}").exists():
                break
            time.sleep(0.2)
        else:
            print(f"Warning: process {pid} did not exit cleanly")
    else:
        print(f"Not killing process {pid} (cmdline looks safe): {cmd}")


def main():
    pid = find_pid_on_port(PORT)
    if pid:
        print(f"Port {PORT} appears in use by PID {pid}")
        safe_kill(pid)

    # Start the app using uvicorn programmatically
    try:
        from backend.main import app
        import uvicorn

        print(f"Starting server on 0.0.0.0:{PORT} ...")
        uvicorn.run(app, host='0.0.0.0', port=PORT)
    except Exception as e:
        print('Failed to start server:', e)


if __name__ == '__main__':
    main()
