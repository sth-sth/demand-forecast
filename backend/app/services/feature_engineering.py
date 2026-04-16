from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class FeatureConfig:
    lags: tuple[int, ...] = (1, 2, 3, 7, 14, 28)
    rolling_windows: tuple[int, ...] = (7, 14, 28)


def build_lagged_frame(
    series_df: pd.DataFrame,
    target_col: str,
    feature_config: FeatureConfig | None = None,
) -> tuple[pd.DataFrame, pd.Series]:
    config = feature_config or FeatureConfig()
    frame = series_df.copy()

    for lag in config.lags:
        frame[f"lag_{lag}"] = frame[target_col].shift(lag)

    for window in config.rolling_windows:
        frame[f"roll_mean_{window}"] = frame[target_col].shift(1).rolling(window).mean()
        frame[f"roll_std_{window}"] = frame[target_col].shift(1).rolling(window).std()

    frame["month"] = frame["ds"].dt.month
    frame["dayofweek"] = frame["ds"].dt.dayofweek
    frame["weekofyear"] = frame["ds"].dt.isocalendar().week.astype(int)
    frame["is_month_start"] = frame["ds"].dt.is_month_start.astype(int)
    frame["is_month_end"] = frame["ds"].dt.is_month_end.astype(int)

    frame = frame.dropna().reset_index(drop=True)

    y = frame[target_col]
    X = frame.drop(columns=[target_col, "ds", "unique_id"], errors="ignore")
    return X, y


def make_recursive_features(
    history: list[float],
    current_ts: pd.Timestamp,
    feature_names: list[str],
) -> np.ndarray:
    values: dict[str, float] = {}
    arr = np.asarray(history, dtype=float)

    for name in feature_names:
        if name.startswith("lag_"):
            lag = int(name.replace("lag_", ""))
            values[name] = float(arr[-lag]) if len(arr) >= lag else float(arr[0])
        elif name.startswith("roll_mean_"):
            window = int(name.replace("roll_mean_", ""))
            sub = arr[-window:] if len(arr) >= window else arr
            values[name] = float(np.mean(sub))
        elif name.startswith("roll_std_"):
            window = int(name.replace("roll_std_", ""))
            sub = arr[-window:] if len(arr) >= window else arr
            values[name] = float(np.std(sub))
        elif name == "month":
            values[name] = float(current_ts.month)
        elif name == "dayofweek":
            values[name] = float(current_ts.dayofweek)
        elif name == "weekofyear":
            values[name] = float(current_ts.isocalendar().week)
        elif name == "is_month_start":
            values[name] = float(int(current_ts.is_month_start))
        elif name == "is_month_end":
            values[name] = float(int(current_ts.is_month_end))
        else:
            values[name] = 0.0

    return np.asarray([values[name] for name in feature_names], dtype=float)
