from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    file_path: str
    time_col: str = "ds"
    target_col: str = "y"
    item_col: str | None = None
    freq: str = "D"
    columns_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)


class ForecastRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="dataset.id", index=True)

    status: str = Field(default="pending", index=True)
    metric: str = "smape"

    config_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    summary_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    champion_model: str | None = None
    error_message: str | None = None

    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ModelResult(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="forecastrun.id", index=True)

    model_name: str = Field(index=True)
    family: str
    status: str = Field(default="success", index=True)

    params_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    metrics_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    predictions_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    diagnostics_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    training_seconds: float = 0.0
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
