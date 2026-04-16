from __future__ import annotations

import traceback
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
from sqlmodel import Session, delete, select

from app.core.config import get_settings
from app.db.models import Dataset, ForecastRun, ModelResult, utcnow
from app.db.session import engine
from app.schemas import RunRequest
from app.services.forecasting import ForecastingEngine
from app.services.visualization import build_run_visualizations


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()

    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]

    if isinstance(value, np.generic):
        return value.item()

    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]

    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass

    return str(value)


def execute_run(run_id: int) -> None:
    settings = get_settings()

    with Session(engine) as session:
        run = session.get(ForecastRun, run_id)
        if run is None:
            return

        run.status = "running"
        run.started_at = utcnow()
        run.error_message = None
        session.add(run)
        session.commit()

    try:
        with Session(engine) as session:
            run = session.get(ForecastRun, run_id)
            if run is None:
                return

            dataset = session.get(Dataset, run.dataset_id)
            if dataset is None:
                raise ValueError(f"Dataset {run.dataset_id} not found")

            req = RunRequest.model_validate(run.config_json)
            raw_df = pd.read_csv(dataset.file_path)

            forecasting_engine = ForecastingEngine(random_seed=settings.random_seed)
            output = forecasting_engine.run(raw_df=raw_df, dataset=dataset, request=req)

            session.exec(delete(ModelResult).where(ModelResult.run_id == run_id))

            result_rows: list[dict] = []
            for item in output.model_results:
                params = _json_safe(item.params)
                metrics = _json_safe(item.metrics)
                predictions = _json_safe(item.predictions)
                diagnostics = _json_safe(item.diagnostics)

                row = ModelResult(
                    run_id=run_id,
                    model_name=item.model_name,
                    family=item.family,
                    status=item.status,
                    params_json=params,
                    metrics_json=metrics,
                    predictions_json=predictions,
                    diagnostics_json=diagnostics,
                    training_seconds=item.training_seconds,
                    error_message=item.error_message,
                )
                session.add(row)
                result_rows.append(
                    {
                        "model_name": item.model_name,
                        "family": item.family,
                        "status": item.status,
                        "params": params,
                        "metrics": metrics,
                        "predictions": predictions,
                        "diagnostics": diagnostics,
                        "training_seconds": item.training_seconds,
                        "error_message": item.error_message,
                    }
                )

            leaderboard_fig, champion_fig = build_run_visualizations(
                model_results=result_rows,
                champion_model=output.champion_model,
                metric=output.metric,
            )

            champion_row = next(
                (
                    row
                    for row in result_rows
                    if row.get("model_name") == output.champion_model and row.get("status") == "success"
                ),
                None,
            )

            run.status = "completed"
            run.finished_at = utcnow()
            run.champion_model = output.champion_model
            run.metric = output.metric
            run.summary_json = _json_safe(
                {
                    "run_mode": output.run_mode,
                    "metric": output.metric,
                    "context": output.context,
                    "selection_run_id": req.selection_run_id,
                    "leaderboard": output.leaderboard,
                    "actuals": output.actuals,
                    "champion": {
                        "model_name": output.champion_model,
                        "params": champion_row.get("params", {}) if champion_row else {},
                        "param_trace": champion_row.get("diagnostics", {}).get("param_trace", []) if champion_row else [],
                        "implementation": champion_row.get("diagnostics", {}).get("implementation", {}) if champion_row else {},
                        "future_predictions": (
                            champion_row.get("predictions", []) if output.run_mode == "future_forecast" else []
                        ),
                    },
                    "figures": {
                        "leaderboard": leaderboard_fig,
                        "champion": champion_fig,
                    },
                }
            )

            session.add(run)
            session.commit()
    except Exception as exc:  # noqa: BLE001
        with Session(engine) as session:
            run = session.get(ForecastRun, run_id)
            if run is None:
                return
            run.status = "failed"
            run.finished_at = utcnow()
            run.error_message = f"{exc}\n{traceback.format_exc(limit=2)}"
            session.add(run)
            session.commit()
