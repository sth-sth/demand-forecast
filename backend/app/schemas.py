from datetime import datetime
from typing import Literal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    time_col: str
    target_col: str
    item_col: str | None
    freq: str
    columns_json: dict[str, Any]
    created_at: datetime


class DatasetPreviewResponse(BaseModel):
    dataset_id: int
    columns: list[str]
    rows: list[dict[str, Any]]
    total_rows: int
    shown_rows: int


class RunRequest(BaseModel):
    dataset_id: int
    horizon: int = Field(default=14, ge=1, le=180)
    freq: str | None = None
    metric: str = "smape"
    run_mode: Literal["selection", "future_forecast"] = "selection"
    selection_run_id: int | None = None

    use_all_models: bool = True
    candidate_models: list[str] | None = None
    tune_trials: int = Field(default=15, ge=0, le=50)

    model_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)
    global_params: dict[str, Any] = Field(default_factory=dict)


class RunCreatedResponse(BaseModel):
    run_id: int
    status: str


class ModelResultResponse(BaseModel):
    model_name: str
    family: str
    status: str
    params: dict[str, Any]
    metrics: dict[str, float]
    predictions: list[dict[str, Any]]
    diagnostics: dict[str, Any]
    training_seconds: float
    error_message: str | None


class RunDetailResponse(BaseModel):
    id: int
    dataset_id: int
    status: str
    metric: str
    champion_model: str | None
    error_message: str | None
    config: dict[str, Any]
    summary: dict[str, Any]
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ModelCatalogItem(BaseModel):
    model_name: str
    family: str
    backend: str
    description: str
    default_params: dict[str, Any]
    tunable_params: dict[str, Any]
    requires: list[str]


class VisualizationResponse(BaseModel):
    leaderboard_figure: dict[str, Any]
    champion_figure: dict[str, Any]
