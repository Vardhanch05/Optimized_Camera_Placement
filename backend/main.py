from fastapi import FastAPI

app = FastAPI(title="Camera Placement Optimizer API")

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/optimize")
def optimize(payload: dict):
    return {
        "message": "Optimization not implemented yet",
        "received_keys": list(payload.keys())
    }
