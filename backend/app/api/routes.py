from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.models import Dataset, ForecastRun, ModelResult
from app.db.session import get_session
from app.schemas import (
    DatasetPreviewResponse,
    DatasetResponse,
    ModelCatalogItem,
    ModelResultResponse,
    RunCreatedResponse,
    RunDetailResponse,
    RunRequest,
    VisualizationResponse,
)
from app.services.model_registry import get_model_specs
from app.workers.job_runner import execute_run

router = APIRouter()

DEMO_FILE_NAME = "demand_demo_cn.csv"
DEMO_DATASET_NAME = "中文演示数据集（门店SKU日需求）"


def _get_demo_csv_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "demo" / DEMO_FILE_NAME


def _normalize_preview_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (str, int, float, bool)):
        return value
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except ValueError:
            return str(value)
    return str(value)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/models", response_model=list[ModelCatalogItem])
def list_models() -> list[ModelCatalogItem]:
    specs = get_model_specs()
    return [
        ModelCatalogItem(
            model_name=item.model_name,
            family=item.family,
            backend=item.backend,
            description=item.description,
            default_params=item.default_params,
            tunable_params=item.tunable_params,
            requires=item.requires,
        )
        for item in specs.values()
    ]


@router.post("/datasets/upload", response_model=DatasetResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    time_col: str = Form(default="ds"),
    target_col: str = Form(default="y"),
    item_col: str | None = Form(default=None),
    freq: str = Form(default="D"),
    session: Session = Depends(get_session),
) -> DatasetResponse:
    settings = get_settings()

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    dataset_id = uuid4().hex
    dst_file = Path(settings.upload_dir) / f"{dataset_id}_{file.filename}"

    content = await file.read()
    dst_file.write_bytes(content)

    preview = pd.read_csv(dst_file, nrows=10)
    if time_col not in preview.columns:
        raise HTTPException(status_code=400, detail=f"time_col '{time_col}' not found in CSV")
    if target_col not in preview.columns:
        raise HTTPException(status_code=400, detail=f"target_col '{target_col}' not found in CSV")
    if item_col and item_col not in preview.columns:
        raise HTTPException(status_code=400, detail=f"item_col '{item_col}' not found in CSV")

    dataset = Dataset(
        name=name or file.filename,
        file_path=str(dst_file),
        time_col=time_col,
        target_col=target_col,
        item_col=item_col,
        freq=freq,
        columns_json={col: str(dtype) for col, dtype in preview.dtypes.items()},
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    return DatasetResponse.model_validate(dataset)


@router.get("/datasets", response_model=list[DatasetResponse])
def list_datasets(session: Session = Depends(get_session)) -> list[DatasetResponse]:
    rows = session.exec(select(Dataset).order_by(Dataset.created_at.desc())).all()
    return [DatasetResponse.model_validate(row) for row in rows]


@router.post("/datasets/demo", response_model=DatasetResponse)
def create_demo_dataset(session: Session = Depends(get_session)) -> DatasetResponse:
    demo_path = _get_demo_csv_path()
    if not demo_path.exists():
        raise HTTPException(status_code=500, detail=f"Demo CSV file is missing: {demo_path}")

    existing = session.exec(
        select(Dataset).where(Dataset.file_path == str(demo_path)).order_by(Dataset.created_at.desc())
    ).first()
    if existing is not None:
        return DatasetResponse.model_validate(existing)

    preview = pd.read_csv(demo_path, nrows=20)
    required_cols = {"日期", "销量", "商品编码"}
    missing_cols = [col for col in required_cols if col not in preview.columns]
    if missing_cols:
        raise HTTPException(
            status_code=500,
            detail=f"Demo CSV is invalid. Missing required columns: {','.join(missing_cols)}",
        )

    dataset = Dataset(
        name=DEMO_DATASET_NAME,
        file_path=str(demo_path),
        time_col="日期",
        target_col="销量",
        item_col="商品编码",
        freq="D",
        columns_json={col: str(dtype) for col, dtype in preview.dtypes.items()},
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    return DatasetResponse.model_validate(dataset)


@router.get("/datasets/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def preview_dataset(
    dataset_id: int,
    limit: int = Query(default=20, ge=1, le=200),
    session: Session = Depends(get_session),
) -> DatasetPreviewResponse:
    dataset = session.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} does not exist")

    path = Path(dataset.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset file does not exist: {path}")

    frame = pd.read_csv(path)
    preview_frame = frame.head(limit)

    rows: list[dict[str, Any]] = []
    for _, row in preview_frame.iterrows():
        row_dict: dict[str, Any] = {}
        for col, val in row.items():
            row_dict[str(col)] = _normalize_preview_value(val)
        rows.append(row_dict)

    return DatasetPreviewResponse(
        dataset_id=dataset.id,
        columns=[str(col) for col in frame.columns.tolist()],
        rows=rows,
        total_rows=int(len(frame)),
        shown_rows=len(rows),
    )


@router.post("/runs", response_model=RunCreatedResponse)
def create_run(
    payload: RunRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RunCreatedResponse:
    dataset = session.get(Dataset, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail=f"Dataset {payload.dataset_id} does not exist")

    if payload.run_mode == "future_forecast":
        if payload.use_all_models:
            raise HTTPException(
                status_code=400,
                detail="future_forecast mode requires use_all_models=false and an explicit champion candidate.",
            )
        if not payload.candidate_models:
            raise HTTPException(
                status_code=400,
                detail="future_forecast mode requires candidate_models with at least one model.",
            )

    run = ForecastRun(
        dataset_id=payload.dataset_id,
        status="pending",
        metric=payload.metric,
        config_json=payload.model_dump(),
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    background_tasks.add_task(execute_run, run.id)
    return RunCreatedResponse(run_id=run.id, status=run.status)


@router.get("/runs", response_model=list[RunDetailResponse])
def list_runs(session: Session = Depends(get_session)) -> list[RunDetailResponse]:
    rows = session.exec(select(ForecastRun).order_by(ForecastRun.created_at.desc())).all()
    return [
        RunDetailResponse(
            id=row.id,
            dataset_id=row.dataset_id,
            status=row.status,
            metric=row.metric,
            champion_model=row.champion_model,
            error_message=row.error_message,
            config=row.config_json,
            summary=row.summary_json,
            created_at=row.created_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
        )
        for row in rows
    ]


@router.get("/runs/{run_id}", response_model=RunDetailResponse)
def get_run(run_id: int, session: Session = Depends(get_session)) -> RunDetailResponse:
    row = session.get(ForecastRun, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} does not exist")

    return RunDetailResponse(
        id=row.id,
        dataset_id=row.dataset_id,
        status=row.status,
        metric=row.metric,
        champion_model=row.champion_model,
        error_message=row.error_message,
        config=row.config_json,
        summary=row.summary_json,
        created_at=row.created_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )


@router.get("/runs/{run_id}/results", response_model=list[ModelResultResponse])
def get_run_results(run_id: int, session: Session = Depends(get_session)) -> list[ModelResultResponse]:
    run = session.get(ForecastRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} does not exist")

    rows = session.exec(select(ModelResult).where(ModelResult.run_id == run_id)).all()
    return [
        ModelResultResponse(
            model_name=row.model_name,
            family=row.family,
            status=row.status,
            params=row.params_json,
            metrics=row.metrics_json,
            predictions=row.predictions_json,
            diagnostics=row.diagnostics_json,
            training_seconds=row.training_seconds,
            error_message=row.error_message,
        )
        for row in rows
    ]


@router.get("/runs/{run_id}/visualizations", response_model=VisualizationResponse)
def get_run_visualizations(run_id: int, session: Session = Depends(get_session)) -> VisualizationResponse:
    run = session.get(ForecastRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} does not exist")

    figures: dict[str, Any] = run.summary_json.get("figures", {}) if run.summary_json else {}
    return VisualizationResponse(
        leaderboard_figure=figures.get("leaderboard", {}),
        champion_figure=figures.get("champion", {}),
    )
