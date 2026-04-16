from __future__ import annotations

import math
from typing import Callable

import numpy as np


EPS = 1e-8


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(math.sqrt(np.mean((y_true - y_pred) ** 2)))


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.maximum(np.abs(y_true), EPS)
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100)


def smape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.maximum((np.abs(y_true) + np.abs(y_pred)) / 2.0, EPS)
    return float(np.mean(np.abs(y_true - y_pred) / denom) * 100)


def wape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.maximum(np.sum(np.abs(y_true)), EPS)
    return float(np.sum(np.abs(y_true - y_pred)) / denom * 100)


def mase(y_true: np.ndarray, y_pred: np.ndarray, y_train: np.ndarray, seasonality: int = 1) -> float:
    if len(y_train) <= seasonality:
        scale = np.mean(np.abs(np.diff(y_train)))
    else:
        scale = np.mean(np.abs(y_train[seasonality:] - y_train[:-seasonality]))
    scale = max(scale, EPS)
    return float(np.mean(np.abs(y_true - y_pred)) / scale)


METRIC_REGISTRY: dict[str, Callable[..., float]] = {
    "mae": mae,
    "rmse": rmse,
    "mape": mape,
    "smape": smape,
    "wape": wape,
    "mase": mase,
}


def evaluate_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_train: np.ndarray | None = None,
    seasonality: int = 1,
) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    out = {
        "mae": mae(y_true, y_pred),
        "rmse": rmse(y_true, y_pred),
        "mape": mape(y_true, y_pred),
        "smape": smape(y_true, y_pred),
        "wape": wape(y_true, y_pred),
    }
    if y_train is not None and len(y_train) > 1:
        out["mase"] = mase(y_true, y_pred, np.asarray(y_train, dtype=float), seasonality)
    return out
