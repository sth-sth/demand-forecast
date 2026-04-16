from __future__ import annotations

import importlib
from typing import Any

import numpy as np
import optuna
from sklearn.model_selection import TimeSeriesSplit

from app.services.metrics import smape


def import_optional(module_name: str):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError:
        return None


def build_ml_estimator(model_name: str, params: dict[str, Any], random_seed: int):
    if model_name == "LinearRegression":
        from sklearn.linear_model import LinearRegression

        return LinearRegression(**params)

    if model_name == "Ridge":
        from sklearn.linear_model import Ridge

        return Ridge(**params)

    if model_name == "Lasso":
        from sklearn.linear_model import Lasso

        return Lasso(**params)

    if model_name == "ElasticNet":
        from sklearn.linear_model import ElasticNet

        return ElasticNet(**params)

    if model_name == "RandomForest":
        from sklearn.ensemble import RandomForestRegressor

        return RandomForestRegressor(random_state=random_seed, n_jobs=-1, **params)

    if model_name == "XGBoost":
        xgb = import_optional("xgboost")
        if xgb is None:
            raise RuntimeError("xgboost is not installed")
        return xgb.XGBRegressor(random_state=random_seed, n_jobs=-1, objective="reg:squarederror", **params)

    if model_name == "LightGBM":
        lgb = import_optional("lightgbm")
        if lgb is None:
            raise RuntimeError("lightgbm is not installed")
        return lgb.LGBMRegressor(random_state=random_seed, n_jobs=-1, **params)

    if model_name == "CatBoost":
        cb = import_optional("catboost")
        if cb is None:
            raise RuntimeError("catboost is not installed")
        return cb.CatBoostRegressor(random_seed=random_seed, verbose=False, **params)

    raise ValueError(f"Unsupported ML model for estimator build: {model_name}")


def tune_ml_model(
    model_name: str,
    X: np.ndarray,
    y: np.ndarray,
    tunable_params: dict[str, list[Any]],
    trials: int,
    random_seed: int,
) -> tuple[dict[str, Any], float]:
    if trials <= 0 or not tunable_params:
        return {}, float("nan")

    if len(X) < 30:
        return {}, float("nan")

    n_splits = 3 if len(X) > 60 else 2
    tscv = TimeSeriesSplit(n_splits=n_splits)

    def objective(trial: optuna.Trial) -> float:
        params: dict[str, Any] = {}
        for key, values in tunable_params.items():
            if all(isinstance(v, int) for v in values):
                params[key] = int(trial.suggest_categorical(key, values))
            elif all(isinstance(v, float) for v in values):
                params[key] = float(trial.suggest_categorical(key, values))
            else:
                params[key] = trial.suggest_categorical(key, values)

        model = build_ml_estimator(model_name, params, random_seed)
        fold_scores: list[float] = []

        for train_idx, valid_idx in tscv.split(X):
            X_train, X_valid = X[train_idx], X[valid_idx]
            y_train, y_valid = y[train_idx], y[valid_idx]
            model.fit(X_train, y_train)
            y_hat = model.predict(X_valid)
            fold_scores.append(smape(y_valid, y_hat))

        return float(np.mean(fold_scores))

    sampler = optuna.samplers.TPESampler(seed=random_seed)
    study = optuna.create_study(direction="minimize", sampler=sampler)
    study.optimize(objective, n_trials=trials)

    best_params = study.best_trial.params if study.best_trial else {}
    best_score = float(study.best_value) if study.best_trial else float("nan")
    return best_params, best_score
