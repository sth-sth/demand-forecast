from __future__ import annotations

import importlib
import time
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from app.db.models import Dataset
from app.schemas import RunRequest
from app.services.feature_engineering import build_lagged_frame, make_recursive_features
from app.services.metrics import evaluate_metrics
from app.services.model_registry import ModelSpec, get_default_model_list, get_model_specs
from app.services.tuning import build_ml_estimator, tune_ml_model


@dataclass
class ModelRunResult:
    model_name: str
    family: str
    status: str
    params: dict[str, Any]
    metrics: dict[str, float]
    predictions: list[dict[str, Any]]
    diagnostics: dict[str, Any]
    training_seconds: float
    error_message: str | None = None


@dataclass
class ForecastRunOutput:
    run_mode: str
    metric: str
    champion_model: str | None
    model_results: list[ModelRunResult]
    leaderboard: list[dict[str, Any]]
    actuals: list[dict[str, Any]]
    context: dict[str, Any]


def _import_optional(name: str):
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError:
        return None


def infer_season_length(freq: str) -> int:
    f = (freq or "D").upper()
    if f.startswith("H"):
        return 24
    if f.startswith("W"):
        return 52
    if f.startswith("M"):
        return 12
    if f.startswith("Q"):
        return 4
    return 7


class ForecastingEngine:
    def __init__(self, random_seed: int = 42):
        self.random_seed = random_seed
        self.specs = get_model_specs()

    def run(self, raw_df: pd.DataFrame, dataset: Dataset, request: RunRequest) -> ForecastRunOutput:
        if request.run_mode == "future_forecast":
            return self.run_future_forecast(raw_df=raw_df, dataset=dataset, request=request)
        return self.run_selection(raw_df=raw_df, dataset=dataset, request=request)

    def _resolve_model_candidates(self, request: RunRequest) -> list[str]:
        if request.use_all_models or not request.candidate_models:
            selected_models = get_default_model_list()
        else:
            selected_models = [name for name in request.candidate_models if name in self.specs]
        return list(dict.fromkeys(selected_models))

    @staticmethod
    def _format_ds(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, pd.Timestamp):
            return value.strftime("%Y-%m-%d")
        try:
            ts = pd.Timestamp(value)
            return ts.strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _build_param_trace(
        default_params: dict[str, Any],
        global_params: dict[str, Any],
        override_params: dict[str, Any],
        tuned_params: dict[str, Any],
        final_params: dict[str, Any],
    ) -> list[dict[str, Any]]:
        keys = sorted(
            {
                *default_params.keys(),
                *global_params.keys(),
                *override_params.keys(),
                *tuned_params.keys(),
                *final_params.keys(),
            }
        )

        trace: list[dict[str, Any]] = []
        for key in keys:
            if key in tuned_params:
                source = "tuned"
            elif key in override_params:
                source = "model_override"
            elif key in global_params:
                source = "global_param"
            elif key in default_params:
                source = "model_default"
            else:
                source = "runtime"

            trace.append(
                {
                    "param": key,
                    "source": source,
                    "default_value": default_params.get(key),
                    "global_value": global_params.get(key),
                    "override_value": override_params.get(key),
                    "tuned_value": tuned_params.get(key),
                    "final_value": final_params.get(key),
                }
            )

        return trace

    @staticmethod
    def _implementation_hint(model_name: str, backend: str) -> dict[str, str]:
        method_by_backend = {
            "baseline": "_forecast_baseline",
            "statsforecast": "_forecast_statsforecast",
            "statsmodels": "_forecast_statsmodels",
            "prophet": "_forecast_prophet",
            "sklearn": "_forecast_ml",
            "xgboost": "_forecast_ml",
            "lightgbm": "_forecast_ml",
            "catboost": "_forecast_ml",
            "neuralforecast": "_forecast_neuralforecast",
            "hierarchical": "_forecast_hierarchical",
            "postprocess": "_build_ensemble_*",
        }
        return {
            "model": model_name,
            "backend": backend,
            "module": "backend/app/services/forecasting.py",
            "method": method_by_backend.get(backend, "run"),
        }

    def run_selection(self, raw_df: pd.DataFrame, dataset: Dataset, request: RunRequest) -> ForecastRunOutput:
        frame = self._normalize_input(raw_df, dataset)
        horizon = int(request.horizon)
        freq = request.freq or dataset.freq

        train_df, test_df = self._train_test_split(frame, horizon)
        seasonality = infer_season_length(freq)

        selected_models = self._resolve_model_candidates(request)

        selected_models = list(dict.fromkeys(selected_models))
        ensemble_requested = [m for m in selected_models if m in {"EnsembleMean", "EnsembleWeighted"}]
        selected_models = [m for m in selected_models if m not in {"EnsembleMean", "EnsembleWeighted"}]

        results: list[ModelRunResult] = []
        successful_prediction_frames: dict[str, pd.DataFrame] = {}

        for model_name in selected_models:
            spec = self.specs.get(model_name)
            if spec is None:
                continue

            start = time.perf_counter()
            override_params = request.model_overrides.get(model_name, {})
            params = {
                **spec.default_params,
                **request.global_params,
                **override_params,
            }

            try:
                pred_df, final_params, diagnostics = self._forecast_by_backend(
                    model_name=model_name,
                    spec=spec,
                    train_df=train_df,
                    horizon=horizon,
                    freq=freq,
                    params=params,
                    tune_trials=request.tune_trials,
                )

                tuned_params = diagnostics.pop("tuned_params", {}) if isinstance(diagnostics, dict) else {}
                diagnostics["param_trace"] = self._build_param_trace(
                    default_params=spec.default_params,
                    global_params=request.global_params,
                    override_params=override_params,
                    tuned_params=tuned_params if isinstance(tuned_params, dict) else {},
                    final_params=final_params,
                )
                diagnostics["implementation"] = self._implementation_hint(model_name=model_name, backend=spec.backend)
                diagnostics["run_mode"] = "selection"

                eval_df = test_df[["unique_id", "ds", "y"]].merge(
                    pred_df[["unique_id", "ds", "y_pred"]],
                    on=["unique_id", "ds"],
                    how="left",
                )
                eval_df["y_pred"] = eval_df["y_pred"].fillna(method="ffill").fillna(0.0)

                metrics = evaluate_metrics(
                    y_true=eval_df["y"].to_numpy(dtype=float),
                    y_pred=eval_df["y_pred"].to_numpy(dtype=float),
                    y_train=train_df["y"].to_numpy(dtype=float),
                    seasonality=seasonality,
                )

                elapsed = time.perf_counter() - start
                predictions = eval_df[["unique_id", "ds", "y", "y_pred"]].copy()
                predictions["ds"] = predictions["ds"].dt.strftime("%Y-%m-%d")

                results.append(
                    ModelRunResult(
                        model_name=model_name,
                        family=spec.family,
                        status="success",
                        params=final_params,
                        metrics=metrics,
                        predictions=predictions.to_dict(orient="records"),
                        diagnostics=diagnostics,
                        training_seconds=elapsed,
                    )
                )
                successful_prediction_frames[model_name] = eval_df[["unique_id", "ds", "y", "y_pred"]].copy()
            except Exception as exc:  # noqa: BLE001
                elapsed = time.perf_counter() - start
                results.append(
                    ModelRunResult(
                        model_name=model_name,
                        family=spec.family,
                        status="failed",
                        params=params,
                        metrics={},
                        predictions=[],
                        diagnostics={},
                        training_seconds=elapsed,
                        error_message=str(exc),
                    )
                )

        if "EnsembleMean" in ensemble_requested and successful_prediction_frames:
            ensemble_result = self._build_ensemble_mean(successful_prediction_frames, seasonality)
            ensemble_result.diagnostics["run_mode"] = "selection"
            ensemble_result.diagnostics["implementation"] = self._implementation_hint(
                model_name="EnsembleMean",
                backend="postprocess",
            )
            results.append(ensemble_result)

        if "EnsembleWeighted" in ensemble_requested and successful_prediction_frames:
            ensemble_result = self._build_ensemble_weighted(successful_prediction_frames, results, seasonality)
            ensemble_result.diagnostics["run_mode"] = "selection"
            ensemble_result.diagnostics["implementation"] = self._implementation_hint(
                model_name="EnsembleWeighted",
                backend="postprocess",
            )
            results.append(ensemble_result)

        metric_name = request.metric.lower().strip()
        rankable = [r for r in results if r.status == "success" and metric_name in r.metrics]
        rankable.sort(key=lambda r: r.metrics[metric_name])

        champion_model = rankable[0].model_name if rankable else None
        leaderboard = [
            {
                "rank": idx + 1,
                "model_name": row.model_name,
                "family": row.family,
                "metric": metric_name,
                "score": row.metrics[metric_name],
                "training_seconds": row.training_seconds,
            }
            for idx, row in enumerate(rankable)
        ]

        actuals = test_df.copy()
        actuals["ds"] = actuals["ds"].dt.strftime("%Y-%m-%d")

        context = {
            "prediction_kind": "backtest",
            "freq": freq,
            "horizon": horizon,
            "history_start": self._format_ds(frame["ds"].min()),
            "history_end": self._format_ds(frame["ds"].max()),
            "train_end": self._format_ds(train_df["ds"].max()),
            "evaluation_start": self._format_ds(test_df["ds"].min()),
            "evaluation_end": self._format_ds(test_df["ds"].max()),
        }

        return ForecastRunOutput(
            run_mode="selection",
            metric=metric_name,
            champion_model=champion_model,
            model_results=results,
            leaderboard=leaderboard,
            actuals=actuals[["unique_id", "ds", "y"]].to_dict(orient="records"),
            context=context,
        )

    def run_future_forecast(self, raw_df: pd.DataFrame, dataset: Dataset, request: RunRequest) -> ForecastRunOutput:
        frame = self._normalize_input(raw_df, dataset)
        horizon = int(request.horizon)
        freq = request.freq or dataset.freq

        selected_models = self._resolve_model_candidates(request)
        if not selected_models:
            raise ValueError("No valid model candidates found for future_forecast mode")

        ensemble_requested = [m for m in selected_models if m in {"EnsembleMean", "EnsembleWeighted"}]
        base_model_candidates = [m for m in selected_models if m not in {"EnsembleMean", "EnsembleWeighted"}]

        if not base_model_candidates and ensemble_requested:
            for ensemble_name in ensemble_requested:
                ensemble_override = request.model_overrides.get(ensemble_name, {})
                base_models = ensemble_override.get("base_models")
                if isinstance(base_models, list):
                    for name in base_models:
                        model_name = str(name)
                        if model_name in self.specs and model_name not in {"EnsembleMean", "EnsembleWeighted"}:
                            base_model_candidates.append(model_name)
                weights = ensemble_override.get("weights")
                if isinstance(weights, dict):
                    for name in weights.keys():
                        model_name = str(name)
                        if model_name in self.specs and model_name not in {"EnsembleMean", "EnsembleWeighted"}:
                            base_model_candidates.append(model_name)
            base_model_candidates = list(dict.fromkeys(base_model_candidates))

        results: list[ModelRunResult] = []
        successful_prediction_frames: dict[str, pd.DataFrame] = {}

        for model_name in base_model_candidates:
            spec = self.specs.get(model_name)
            if spec is None:
                continue

            start = time.perf_counter()
            override_params = request.model_overrides.get(model_name, {})
            params = {
                **spec.default_params,
                **request.global_params,
                **override_params,
            }

            try:
                pred_df, final_params, diagnostics = self._forecast_by_backend(
                    model_name=model_name,
                    spec=spec,
                    train_df=frame,
                    horizon=horizon,
                    freq=freq,
                    params=params,
                    tune_trials=request.tune_trials,
                )

                tuned_params = diagnostics.pop("tuned_params", {}) if isinstance(diagnostics, dict) else {}
                diagnostics["param_trace"] = self._build_param_trace(
                    default_params=spec.default_params,
                    global_params=request.global_params,
                    override_params=override_params,
                    tuned_params=tuned_params if isinstance(tuned_params, dict) else {},
                    final_params=final_params,
                )
                diagnostics["implementation"] = self._implementation_hint(model_name=model_name, backend=spec.backend)
                diagnostics["run_mode"] = "future_forecast"

                elapsed = time.perf_counter() - start
                predictions = pred_df[["unique_id", "ds", "y_pred"]].copy()
                predictions["y"] = None
                predictions["ds"] = predictions["ds"].dt.strftime("%Y-%m-%d")

                results.append(
                    ModelRunResult(
                        model_name=model_name,
                        family=spec.family,
                        status="success",
                        params=final_params,
                        metrics={},
                        predictions=predictions[["unique_id", "ds", "y", "y_pred"]].to_dict(orient="records"),
                        diagnostics=diagnostics,
                        training_seconds=elapsed,
                    )
                )
                successful_prediction_frames[model_name] = pred_df[["unique_id", "ds", "y_pred"]].copy()
            except Exception as exc:  # noqa: BLE001
                elapsed = time.perf_counter() - start
                results.append(
                    ModelRunResult(
                        model_name=model_name,
                        family=spec.family,
                        status="failed",
                        params=params,
                        metrics={},
                        predictions=[],
                        diagnostics={},
                        training_seconds=elapsed,
                        error_message=str(exc),
                    )
                )

        if "EnsembleMean" in ensemble_requested and successful_prediction_frames:
            ensemble_override = request.model_overrides.get("EnsembleMean", {})
            base_models = ensemble_override.get("base_models")
            ensemble_result = self._build_future_ensemble_mean(
                successful_prediction_frames=successful_prediction_frames,
                base_models=[str(item) for item in base_models] if isinstance(base_models, list) else None,
            )
            ensemble_result.diagnostics["run_mode"] = "future_forecast"
            ensemble_result.diagnostics["implementation"] = self._implementation_hint(
                model_name="EnsembleMean",
                backend="postprocess",
            )
            results.append(ensemble_result)

        if "EnsembleWeighted" in ensemble_requested and successful_prediction_frames:
            ensemble_override = request.model_overrides.get("EnsembleWeighted", {})
            weights = ensemble_override.get("weights") if isinstance(ensemble_override, dict) else None
            ensemble_result = self._build_future_ensemble_weighted(
                successful_prediction_frames=successful_prediction_frames,
                weights=weights if isinstance(weights, dict) else None,
            )
            ensemble_result.diagnostics["run_mode"] = "future_forecast"
            ensemble_result.diagnostics["implementation"] = self._implementation_hint(
                model_name="EnsembleWeighted",
                backend="postprocess",
            )
            results.append(ensemble_result)

        preferred_champion = request.candidate_models[0] if request.candidate_models else None
        champion_model: str | None = None

        successful_models = [row for row in results if row.status == "success"]
        if preferred_champion and any(row.model_name == preferred_champion for row in successful_models):
            champion_model = preferred_champion
        elif successful_models:
            champion_model = successful_models[0].model_name

        leaderboard = [
            {
                "rank": idx + 1,
                "model_name": row.model_name,
                "family": row.family,
                "metric": "future_forecast",
                "score": None,
                "training_seconds": row.training_seconds,
            }
            for idx, row in enumerate(successful_models)
        ]

        forecast_dates = [
            pd.Timestamp(item["ds"])
            for row in successful_models
            for item in row.predictions
            if item.get("ds") is not None
        ]
        forecast_start = min(forecast_dates) if forecast_dates else None
        forecast_end = max(forecast_dates) if forecast_dates else None

        context = {
            "prediction_kind": "future",
            "freq": freq,
            "horizon": horizon,
            "history_start": self._format_ds(frame["ds"].min()),
            "history_end": self._format_ds(frame["ds"].max()),
            "forecast_start": self._format_ds(forecast_start),
            "forecast_end": self._format_ds(forecast_end),
            "selection_run_id": request.selection_run_id,
        }

        return ForecastRunOutput(
            run_mode="future_forecast",
            metric=request.metric.lower().strip(),
            champion_model=champion_model,
            model_results=results,
            leaderboard=leaderboard,
            actuals=[],
            context=context,
        )

    def _normalize_input(self, raw_df: pd.DataFrame, dataset: Dataset) -> pd.DataFrame:
        frame = raw_df.copy()
        if dataset.time_col not in frame.columns:
            raise ValueError(f"Time column '{dataset.time_col}' not found")
        if dataset.target_col not in frame.columns:
            raise ValueError(f"Target column '{dataset.target_col}' not found")

        frame = frame.rename(columns={dataset.time_col: "ds", dataset.target_col: "y"})

        if dataset.item_col and dataset.item_col in frame.columns:
            frame = frame.rename(columns={dataset.item_col: "unique_id"})
        else:
            frame["unique_id"] = "series_1"

        frame["ds"] = pd.to_datetime(frame["ds"])
        frame["y"] = pd.to_numeric(frame["y"], errors="coerce")
        frame = frame.dropna(subset=["ds", "y", "unique_id"]).sort_values(["unique_id", "ds"])

        return frame[["unique_id", "ds", "y"]].reset_index(drop=True)

    def _train_test_split(self, frame: pd.DataFrame, horizon: int) -> tuple[pd.DataFrame, pd.DataFrame]:
        train_parts: list[pd.DataFrame] = []
        test_parts: list[pd.DataFrame] = []

        for _, group in frame.groupby("unique_id", sort=False):
            if len(group) <= horizon + 2:
                raise ValueError(
                    f"Series '{group['unique_id'].iloc[0]}' is too short for horizon={horizon}."
                )
            train_parts.append(group.iloc[:-horizon].copy())
            test_parts.append(group.iloc[-horizon:].copy())

        train_df = pd.concat(train_parts, ignore_index=True)
        test_df = pd.concat(test_parts, ignore_index=True)
        return train_df, test_df

    def _forecast_by_backend(
        self,
        model_name: str,
        spec: ModelSpec,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
        tune_trials: int,
    ) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
        if spec.backend == "baseline":
            return self._forecast_baseline(model_name, train_df, horizon, freq, params), params, {}

        if spec.backend == "statsforecast":
            return self._forecast_statsforecast(model_name, train_df, horizon, freq, params), params, {}

        if spec.backend == "statsmodels":
            return self._forecast_statsmodels(model_name, train_df, horizon, freq, params), params, {}

        if spec.backend == "prophet":
            return self._forecast_prophet(train_df, horizon, freq, params), params, {}

        if spec.backend in {"sklearn", "xgboost", "lightgbm", "catboost"}:
            return self._forecast_ml(model_name, spec, train_df, horizon, freq, params, tune_trials)

        if spec.backend == "neuralforecast":
            return self._forecast_neuralforecast(model_name, train_df, horizon, freq, params), params, {}

        if spec.backend == "hierarchical":
            return self._forecast_hierarchical(model_name, train_df, horizon, freq), params, {}

        raise ValueError(f"Unsupported backend: {spec.backend}")

    def _forecast_baseline(
        self,
        model_name: str,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
    ) -> pd.DataFrame:
        rows: list[dict[str, Any]] = []

        for uid, group in train_df.groupby("unique_id", sort=False):
            values = group["y"].to_numpy(dtype=float)
            last_ds = group["ds"].iloc[-1]
            future_ds = pd.date_range(last_ds, periods=horizon + 1, freq=freq)[1:]

            if model_name == "Naive":
                preds = np.repeat(values[-1], horizon)
            elif model_name == "SeasonalNaive":
                season_length = int(params.get("season_length", 7))
                if len(values) >= season_length:
                    pattern = values[-season_length:]
                    preds = np.resize(pattern, horizon)
                else:
                    preds = np.repeat(values[-1], horizon)
            elif model_name == "Drift":
                slope = 0.0 if len(values) < 2 else (values[-1] - values[0]) / (len(values) - 1)
                preds = np.asarray([values[-1] + slope * step for step in range(1, horizon + 1)], dtype=float)
            elif model_name == "MovingAverage":
                window = int(params.get("window", 7))
                base = float(np.mean(values[-window:])) if len(values) >= window else float(np.mean(values))
                preds = np.repeat(base, horizon)
            else:
                raise ValueError(f"Unsupported baseline model '{model_name}'")

            for ds_val, pred in zip(future_ds, preds, strict=True):
                rows.append({"unique_id": uid, "ds": ds_val, "y_pred": float(pred)})

        return pd.DataFrame(rows)

    def _forecast_hierarchical(
        self,
        model_name: str,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
    ) -> pd.DataFrame:
        if model_name not in {"BottomUpReconciliation", "TopDownReconciliation", "MinTReconciliation"}:
            raise ValueError(f"Unsupported hierarchical model '{model_name}'")

        if train_df["unique_id"].nunique() <= 1:
            # If there is only one series, hierarchical reconciliation degenerates to a baseline forecast.
            return self._forecast_baseline("Naive", train_df, horizon, freq, {})

        last_date = train_df["ds"].max()
        horizon_dates = pd.date_range(last_date, periods=horizon + 1, freq=freq)[1:]

        # Bottom-up forecast: independent naive forecasts for each leaf series.
        bu_rows: list[dict[str, Any]] = []
        for uid, group in train_df.groupby("unique_id", sort=False):
            last_val = float(group["y"].iloc[-1])
            for ds_val in horizon_dates:
                bu_rows.append({"unique_id": uid, "ds": ds_val, "y_pred_bu": last_val})
        bu_df = pd.DataFrame(bu_rows)

        # Top-level forecast: naive total demand, then disaggregate by historical shares.
        total_series = train_df.groupby("ds", sort=True)["y"].sum()
        total_last = float(total_series.iloc[-1])
        total_forecast = np.repeat(total_last, horizon)

        shares = train_df.groupby("unique_id")["y"].sum()
        total_share = float(shares.sum())
        if total_share <= 0:
            uniform = 1.0 / len(shares)
            share_map = {idx: uniform for idx in shares.index}
        else:
            share_map = {idx: float(val / total_share) for idx, val in shares.items()}

        td_rows: list[dict[str, Any]] = []
        for uid, share in share_map.items():
            for ds_val, total_val in zip(horizon_dates, total_forecast, strict=True):
                td_rows.append({"unique_id": uid, "ds": ds_val, "y_pred_td": float(total_val * share)})
        td_df = pd.DataFrame(td_rows)

        merged = bu_df.merge(td_df, on=["unique_id", "ds"], how="inner")

        if model_name == "BottomUpReconciliation":
            merged["y_pred"] = merged["y_pred_bu"]
        elif model_name == "TopDownReconciliation":
            merged["y_pred"] = merged["y_pred_td"]
        else:
            # A lightweight MinT-style blend for operational comparison.
            merged["y_pred"] = 0.6 * merged["y_pred_bu"] + 0.4 * merged["y_pred_td"]

        return merged[["unique_id", "ds", "y_pred"]]

    def _forecast_statsforecast(
        self,
        model_name: str,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
    ) -> pd.DataFrame:
        sf_mod = _import_optional("statsforecast")
        sf_models_mod = _import_optional("statsforecast.models")
        if sf_mod is None or sf_models_mod is None:
            raise RuntimeError("statsforecast is not installed")

        class_map = {
            "AutoARIMA": "AutoARIMA",
            "AutoETS": "AutoETS",
            "AutoTheta": "AutoTheta",
            "MSTL": "MSTL",
            "TBATS": "TBATS",
            "CrostonClassic": "CrostonClassic",
            "CrostonSBA": "CrostonSBA",
            "TSB": "TSB",
            "ADIDA": "ADIDA",
            "IMAPA": "IMAPA",
        }

        if model_name not in class_map:
            raise ValueError(f"Unsupported StatsForecast model: {model_name}")

        model_cls_name = class_map[model_name]
        model_cls = getattr(sf_models_mod, model_cls_name, None)
        if model_cls is None:
            raise RuntimeError(f"StatsForecast model class '{model_cls_name}' is unavailable")

        model = model_cls(**params)
        sf = sf_mod.StatsForecast(models=[model], freq=freq, n_jobs=1)
        forecast = sf.forecast(df=train_df[["unique_id", "ds", "y"]], h=horizon)

        pred_col = [c for c in forecast.columns if c not in {"unique_id", "ds"}]
        if not pred_col:
            raise RuntimeError("StatsForecast output has no prediction column")

        out = forecast[["unique_id", "ds", pred_col[0]]].copy()
        out = out.rename(columns={pred_col[0]: "y_pred"})
        return out

    def _forecast_statsmodels(
        self,
        model_name: str,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
    ) -> pd.DataFrame:
        statsmodels_mod = _import_optional("statsmodels.tsa.statespace.sarimax")
        if statsmodels_mod is None:
            raise RuntimeError("statsmodels is not installed")

        sarimax_cls = getattr(statsmodels_mod, "SARIMAX", None)
        if sarimax_cls is None:
            raise RuntimeError("SARIMAX class is unavailable")

        rows: list[dict[str, Any]] = []

        for uid, group in train_df.groupby("unique_id", sort=False):
            series = group.set_index("ds")["y"].astype(float)

            if model_name == "SARIMAX":
                order = tuple(params.get("order", [1, 1, 1]))
                seasonal_order = tuple(params.get("seasonal_order", [1, 1, 1, 7]))
                model = sarimax_cls(series, order=order, seasonal_order=seasonal_order, enforce_stationarity=False)
            else:
                order = tuple(params.get("order", [1, 0, 1]))
                model = sarimax_cls(series, order=order, seasonal_order=(0, 0, 0, 0), enforce_stationarity=False)

            fitted = model.fit(disp=False)
            preds = fitted.forecast(steps=horizon)
            future_ds = pd.date_range(group["ds"].iloc[-1], periods=horizon + 1, freq=freq)[1:]

            for ds_val, pred in zip(future_ds, preds, strict=True):
                rows.append({"unique_id": uid, "ds": ds_val, "y_pred": float(pred)})

        return pd.DataFrame(rows)

    def _forecast_prophet(
        self,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
    ) -> pd.DataFrame:
        prophet_mod = _import_optional("prophet")
        if prophet_mod is None:
            raise RuntimeError("prophet is not installed")

        prophet_cls = getattr(prophet_mod, "Prophet")
        rows: list[dict[str, Any]] = []

        for uid, group in train_df.groupby("unique_id", sort=False):
            model = prophet_cls(**params)
            tmp = group[["ds", "y"]].copy()
            model.fit(tmp)

            future = model.make_future_dataframe(periods=horizon, freq=freq)
            pred = model.predict(future).tail(horizon)

            for _, row in pred.iterrows():
                rows.append({"unique_id": uid, "ds": row["ds"], "y_pred": float(row["yhat"])})

        return pd.DataFrame(rows)

    def _forecast_ml(
        self,
        model_name: str,
        spec: ModelSpec,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
        tune_trials: int,
    ) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
        if model_name == "InStockClassifier":
            pred_df, used_params = self._forecast_instock_classifier(train_df, horizon, freq, params)
            return pred_df, used_params, {}

        rows: list[dict[str, Any]] = []
        diagnostics: dict[str, Any] = {"series_tuning": {}}
        best_params_by_series: dict[str, dict[str, Any]] = {}
        tuned_params_by_series: dict[str, dict[str, Any]] = {}

        for uid, group in train_df.groupby("unique_id", sort=False):
            group = group.copy().sort_values("ds")
            X_frame, y_series = build_lagged_frame(group, target_col="y")
            if len(X_frame) < 20:
                raise ValueError(f"Series '{uid}' has insufficient rows for ML model '{model_name}'")

            X = X_frame.to_numpy(dtype=float)
            y = y_series.to_numpy(dtype=float)

            best_params, tune_score = tune_ml_model(
                model_name=model_name,
                X=X,
                y=y,
                tunable_params=spec.tunable_params,
                trials=tune_trials,
                random_seed=self.random_seed,
            )

            model_params = {**params, **best_params}
            estimator = build_ml_estimator(model_name, model_params, self.random_seed)
            estimator.fit(X, y)

            feature_names = X_frame.columns.tolist()
            history = group["y"].tolist()
            future_ds = pd.date_range(group["ds"].iloc[-1], periods=horizon + 1, freq=freq)[1:]

            for ds_val in future_ds:
                x_next = make_recursive_features(history, ds_val, feature_names).reshape(1, -1)
                y_hat = float(estimator.predict(x_next)[0])
                history.append(y_hat)
                rows.append({"unique_id": uid, "ds": ds_val, "y_pred": y_hat})

            best_params_by_series[str(uid)] = model_params
            tuned_params_by_series[str(uid)] = best_params

            series_detail: dict[str, Any] = {"tuned_params": best_params}
            if not np.isnan(tune_score):
                series_detail["tune_smape"] = float(tune_score)
            diagnostics["series_tuning"][str(uid)] = series_detail

        if tuned_params_by_series:
            diagnostics["tuned_params"] = tuned_params_by_series[next(iter(tuned_params_by_series))]

        merged_params = best_params_by_series[next(iter(best_params_by_series))] if best_params_by_series else params
        return pd.DataFrame(rows), merged_params, diagnostics

    def _forecast_instock_classifier(
        self,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
    ) -> tuple[pd.DataFrame, dict[str, Any]]:
        rows: list[dict[str, Any]] = []

        for uid, group in train_df.groupby("unique_id", sort=False):
            group = group.copy().sort_values("ds")
            X_frame, y_series = build_lagged_frame(group, target_col="y")
            if len(X_frame) < 20:
                raise ValueError(f"Series '{uid}' has insufficient rows for in-stock classifier")

            y_cls = (y_series.to_numpy(dtype=float) > 0).astype(int)
            X = X_frame.to_numpy(dtype=float)

            clf = RandomForestClassifier(
                n_estimators=int(params.get("n_estimators", 300)),
                max_depth=int(params.get("max_depth", 8)),
                random_state=self.random_seed,
                n_jobs=-1,
            )
            clf.fit(X, y_cls)

            non_zero = group.loc[group["y"] > 0, "y"]
            avg_non_zero = float(non_zero.mean()) if len(non_zero) else float(group["y"].mean())

            feature_names = X_frame.columns.tolist()
            history = group["y"].tolist()
            future_ds = pd.date_range(group["ds"].iloc[-1], periods=horizon + 1, freq=freq)[1:]

            for ds_val in future_ds:
                x_next = make_recursive_features(history, ds_val, feature_names).reshape(1, -1)
                p_in_stock = float(clf.predict_proba(x_next)[0, 1])
                expected_y = p_in_stock * avg_non_zero
                history.append(expected_y)
                rows.append({"unique_id": uid, "ds": ds_val, "y_pred": expected_y})

        return pd.DataFrame(rows), params

    def _forecast_neuralforecast(
        self,
        model_name: str,
        train_df: pd.DataFrame,
        horizon: int,
        freq: str,
        params: dict[str, Any],
    ) -> pd.DataFrame:
        nf_mod = _import_optional("neuralforecast")
        nf_models_mod = _import_optional("neuralforecast.models")
        if nf_mod is None or nf_models_mod is None:
            raise RuntimeError("neuralforecast is not installed")

        class_map = {
            "LSTM": "LSTM",
            "NBEATS": "NBEATS",
            "NHITS": "NHITS",
            "TFT": "TFT",
            "PatchTST": "PatchTST",
            "Informer": "Informer",
            "DeepAR": "DeepAR",
            "TimesNet": "TimesNet",
        }

        cls_name = class_map.get(model_name)
        if not cls_name:
            raise ValueError(f"Unknown neuralforecast model '{model_name}'")

        model_cls = getattr(nf_models_mod, cls_name, None)
        if model_cls is None:
            raise RuntimeError(f"NeuralForecast model class '{cls_name}' is unavailable")

        model = model_cls(
            h=horizon,
            input_size=max(horizon * 2, 24),
            max_steps=int(params.get("max_steps", 300)),
        )

        nf = nf_mod.NeuralForecast(models=[model], freq=freq)
        nf.fit(train_df[["unique_id", "ds", "y"]])
        pred = nf.predict().reset_index()

        pred_col = [c for c in pred.columns if c not in {"unique_id", "ds"}]
        if not pred_col:
            raise RuntimeError("NeuralForecast output has no prediction column")

        out = pred[["unique_id", "ds", pred_col[0]]].copy()
        out = out.rename(columns={pred_col[0]: "y_pred"})
        return out

    def _build_future_ensemble_mean(
        self,
        successful_prediction_frames: dict[str, pd.DataFrame],
        base_models: list[str] | None = None,
    ) -> ModelRunResult:
        names = [name for name in (base_models or list(successful_prediction_frames.keys())) if name in successful_prediction_frames]
        if not names:
            names = list(successful_prediction_frames.keys())

        merged = None
        for idx, name in enumerate(names):
            cols = successful_prediction_frames[name][["unique_id", "ds", "y_pred"]].copy()
            cols = cols.rename(columns={"y_pred": f"pred_{idx}"})
            if merged is None:
                merged = cols
            else:
                merged = merged.merge(cols, on=["unique_id", "ds"], how="inner")

        if merged is None or merged.empty:
            raise RuntimeError("No successful models for future ensemble")

        pred_cols = [c for c in merged.columns if c.startswith("pred_")]
        merged["y_pred"] = merged[pred_cols].mean(axis=1)

        out = merged[["unique_id", "ds", "y_pred"]].copy()
        out["y"] = None
        out["ds"] = out["ds"].dt.strftime("%Y-%m-%d")

        diagnostics = {
            "param_trace": [
                {
                    "param": "base_models",
                    "source": "model_override" if base_models else "derived",
                    "default_value": None,
                    "global_value": None,
                    "override_value": base_models,
                    "tuned_value": None,
                    "final_value": names,
                }
            ]
        }

        return ModelRunResult(
            model_name="EnsembleMean",
            family="ensemble",
            status="success",
            params={"base_models": names},
            metrics={},
            predictions=out[["unique_id", "ds", "y", "y_pred"]].to_dict(orient="records"),
            diagnostics=diagnostics,
            training_seconds=0.0,
        )

    def _build_future_ensemble_weighted(
        self,
        successful_prediction_frames: dict[str, pd.DataFrame],
        weights: dict[str, Any] | None = None,
    ) -> ModelRunResult:
        available = list(successful_prediction_frames.keys())
        if not available:
            raise RuntimeError("No successful models for future weighted ensemble")

        normalized_weights: dict[str, float] = {}
        if weights:
            for name, weight in weights.items():
                if name not in successful_prediction_frames:
                    continue
                try:
                    value = float(weight)
                except (TypeError, ValueError):
                    continue
                if value > 0:
                    normalized_weights[name] = value

        if not normalized_weights:
            equal_weight = 1.0 / len(available)
            normalized_weights = {name: equal_weight for name in available}
        else:
            total = sum(normalized_weights.values())
            normalized_weights = {name: value / total for name, value in normalized_weights.items()}

        merged = None
        for name, weight in normalized_weights.items():
            cols = successful_prediction_frames[name][["unique_id", "ds", "y_pred"]].copy()
            cols[f"weighted_{name}"] = cols["y_pred"] * weight
            cols = cols.drop(columns=["y_pred"])
            if merged is None:
                merged = cols
            else:
                merged = merged.merge(cols, on=["unique_id", "ds"], how="inner")

        if merged is None or merged.empty:
            raise RuntimeError("Weighted future ensemble could not be computed")

        weighted_cols = [c for c in merged.columns if c.startswith("weighted_")]
        merged["y_pred"] = merged[weighted_cols].sum(axis=1)

        out = merged[["unique_id", "ds", "y_pred"]].copy()
        out["y"] = None
        out["ds"] = out["ds"].dt.strftime("%Y-%m-%d")

        diagnostics = {
            "param_trace": [
                {
                    "param": "weights",
                    "source": "model_override" if weights else "derived",
                    "default_value": None,
                    "global_value": None,
                    "override_value": weights,
                    "tuned_value": None,
                    "final_value": normalized_weights,
                }
            ]
        }

        return ModelRunResult(
            model_name="EnsembleWeighted",
            family="ensemble",
            status="success",
            params={"weights": normalized_weights},
            metrics={},
            predictions=out[["unique_id", "ds", "y", "y_pred"]].to_dict(orient="records"),
            diagnostics=diagnostics,
            training_seconds=0.0,
        )

    def _build_ensemble_mean(
        self,
        successful_prediction_frames: dict[str, pd.DataFrame],
        seasonality: int,
    ) -> ModelRunResult:
        names = list(successful_prediction_frames.keys())
        merged = None

        for idx, name in enumerate(names):
            cols = successful_prediction_frames[name][["unique_id", "ds", "y", "y_pred"]].copy()
            cols = cols.rename(columns={"y_pred": f"pred_{idx}"})
            if merged is None:
                merged = cols
            else:
                merged = merged.merge(cols[["unique_id", "ds", f"pred_{idx}"]], on=["unique_id", "ds"], how="inner")

        if merged is None:
            raise RuntimeError("No successful models for ensemble")

        pred_cols = [c for c in merged.columns if c.startswith("pred_")]
        merged["y_pred"] = merged[pred_cols].mean(axis=1)

        metrics = evaluate_metrics(
            y_true=merged["y"].to_numpy(dtype=float),
            y_pred=merged["y_pred"].to_numpy(dtype=float),
            y_train=merged["y"].to_numpy(dtype=float),
            seasonality=seasonality,
        )

        out = merged[["unique_id", "ds", "y", "y_pred"]].copy()
        out["ds"] = out["ds"].dt.strftime("%Y-%m-%d")

        return ModelRunResult(
            model_name="EnsembleMean",
            family="ensemble",
            status="success",
            params={"base_models": names},
            metrics=metrics,
            predictions=out.to_dict(orient="records"),
            diagnostics={
                "param_trace": [
                    {
                        "param": "base_models",
                        "source": "derived",
                        "default_value": None,
                        "global_value": None,
                        "override_value": None,
                        "tuned_value": None,
                        "final_value": names,
                    }
                ]
            },
            training_seconds=0.0,
        )

    def _build_ensemble_weighted(
        self,
        successful_prediction_frames: dict[str, pd.DataFrame],
        model_results: list[ModelRunResult],
        seasonality: int,
    ) -> ModelRunResult:
        success_results = [r for r in model_results if r.status == "success" and "smape" in r.metrics]
        if not success_results:
            return self._build_ensemble_mean(successful_prediction_frames, seasonality)

        weights = {
            r.model_name: 1.0 / max(r.metrics["smape"], 1e-6)
            for r in success_results
            if r.model_name in successful_prediction_frames
        }
        denom = sum(weights.values())
        if denom <= 0:
            return self._build_ensemble_mean(successful_prediction_frames, seasonality)

        merged = None
        for name, weight in weights.items():
            cols = successful_prediction_frames[name][["unique_id", "ds", "y", "y_pred"]].copy()
            cols[f"weighted_{name}"] = cols["y_pred"] * (weight / denom)
            cols = cols.drop(columns=["y_pred"])
            if merged is None:
                merged = cols
            else:
                merged = merged.merge(cols[["unique_id", "ds", f"weighted_{name}"]], on=["unique_id", "ds"], how="inner")

        if merged is None:
            return self._build_ensemble_mean(successful_prediction_frames, seasonality)

        weighted_cols = [c for c in merged.columns if c.startswith("weighted_")]
        merged["y_pred"] = merged[weighted_cols].sum(axis=1)

        metrics = evaluate_metrics(
            y_true=merged["y"].to_numpy(dtype=float),
            y_pred=merged["y_pred"].to_numpy(dtype=float),
            y_train=merged["y"].to_numpy(dtype=float),
            seasonality=seasonality,
        )

        out = merged[["unique_id", "ds", "y", "y_pred"]].copy()
        out["ds"] = out["ds"].dt.strftime("%Y-%m-%d")

        return ModelRunResult(
            model_name="EnsembleWeighted",
            family="ensemble",
            status="success",
            params={"weights": weights},
            metrics=metrics,
            predictions=out.to_dict(orient="records"),
            diagnostics={
                "param_trace": [
                    {
                        "param": "weights",
                        "source": "derived",
                        "default_value": None,
                        "global_value": None,
                        "override_value": None,
                        "tuned_value": None,
                        "final_value": weights,
                    }
                ]
            },
            training_seconds=0.0,
        )
