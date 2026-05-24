from pydantic import BaseModel, Field
from typing import List, Optional


class Point(BaseModel):
    x: float
    y: float


class PriorityZone(BaseModel):
    x: float
    y: float
    width: float
    height: float
    weight: float = 1.0
    label: Optional[str] = None


class ExtractionResponse(BaseModel):
    outer_polygon: List[List[float]] = Field(default_factory=list)
    inner_polygons: List[List[List[float]]] = Field(default_factory=list)
    suggested_priority_zones: List[PriorityZone] = Field(default_factory=list)
    canvas_width: int = 800
    canvas_height: int = 600
    warnings: List[str] = Field(default_factory=list)
