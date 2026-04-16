from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ModelSpec:
    model_name: str
    family: str
    backend: str
    description: str
    default_params: dict[str, Any] = field(default_factory=dict)
    tunable_params: dict[str, Any] = field(default_factory=dict)
    requires: list[str] = field(default_factory=list)


def get_model_specs() -> dict[str, ModelSpec]:
    specs: list[ModelSpec] = [
        ModelSpec("Naive", "baseline", "baseline", "Last value baseline."),
        ModelSpec("SeasonalNaive", "baseline", "baseline", "Seasonal repeat baseline.", {"season_length": 7}),
        ModelSpec("Drift", "baseline", "baseline", "Linear drift baseline."),
        ModelSpec("MovingAverage", "baseline", "baseline", "Rolling average baseline.", {"window": 7}),
        ModelSpec(
            "AutoARIMA",
            "statistical",
            "statsforecast",
            "Automatic ARIMA.",
            {"season_length": 7},
            {"season_length": [1, 7, 12, 24]},
            ["statsforecast"],
        ),
        ModelSpec(
            "AutoETS",
            "statistical",
            "statsforecast",
            "Automatic ETS model.",
            {"season_length": 7},
            {"season_length": [1, 7, 12, 24]},
            ["statsforecast"],
        ),
        ModelSpec(
            "AutoTheta",
            "statistical",
            "statsforecast",
            "Automatic Theta model.",
            {"season_length": 7},
            {"season_length": [1, 7, 12, 24]},
            ["statsforecast"],
        ),
        ModelSpec(
            "MSTL",
            "statistical",
            "statsforecast",
            "Multi-seasonal decomposition.",
            {"season_length": [7, 30]},
            {"season_length": [[7], [7, 30], [7, 365]]},
            ["statsforecast"],
        ),
        ModelSpec(
            "TBATS",
            "statistical",
            "statsforecast",
            "Complex seasonality model.",
            {"season_length": 7},
            {"season_length": [7, 12, 24, 52]},
            ["statsforecast"],
        ),
        ModelSpec(
            "Prophet",
            "statistical",
            "prophet",
            "Additive trend-seasonality-holiday model.",
            {"weekly_seasonality": True, "yearly_seasonality": True},
            {"changepoint_prior_scale": [0.01, 0.05, 0.1, 0.5]},
            ["prophet"],
        ),
        ModelSpec(
            "SARIMAX",
            "statistical",
            "statsmodels",
            "SARIMAX from statsmodels.",
            {"order": [1, 1, 1], "seasonal_order": [1, 1, 1, 7]},
            {
                "p": [0, 1, 2],
                "d": [0, 1],
                "q": [0, 1, 2],
                "P": [0, 1],
                "D": [0, 1],
                "Q": [0, 1],
                "m": [1, 7, 12],
            },
            ["statsmodels"],
        ),
        ModelSpec(
            "DynamicRegression",
            "statistical",
            "statsmodels",
            "Regression with ARIMA errors.",
            {"order": [1, 0, 1]},
            {"p": [0, 1, 2], "d": [0, 1], "q": [0, 1, 2]},
            ["statsmodels"],
        ),
        ModelSpec("CrostonClassic", "intermittent", "statsforecast", "Intermittent demand model.", {}, {}, ["statsforecast"]),
        ModelSpec("CrostonSBA", "intermittent", "statsforecast", "Croston SBA variant.", {}, {}, ["statsforecast"]),
        ModelSpec("TSB", "intermittent", "statsforecast", "Teunter-Syntetos-Babai model.", {}, {}, ["statsforecast"]),
        ModelSpec("ADIDA", "intermittent", "statsforecast", "Aggregate-disaggregate intermittent model.", {}, {}, ["statsforecast"]),
        ModelSpec("IMAPA", "intermittent", "statsforecast", "Intermittent demand via multiple aggregation levels.", {}, {}, ["statsforecast"]),
        ModelSpec("LinearRegression", "ml", "sklearn", "Linear regression lag model."),
        ModelSpec("Ridge", "ml", "sklearn", "Ridge lag model.", {"alpha": 1.0}, {"alpha": [0.01, 0.1, 1.0, 10.0]}),
        ModelSpec("Lasso", "ml", "sklearn", "Lasso lag model.", {"alpha": 0.1}, {"alpha": [0.001, 0.01, 0.1, 1.0]}),
        ModelSpec(
            "ElasticNet",
            "ml",
            "sklearn",
            "ElasticNet lag model.",
            {"alpha": 0.1, "l1_ratio": 0.5},
            {"alpha": [0.001, 0.01, 0.1, 1.0], "l1_ratio": [0.1, 0.5, 0.9]},
        ),
        ModelSpec(
            "RandomForest",
            "ml",
            "sklearn",
            "Random forest lag model.",
            {"n_estimators": 300, "max_depth": 12},
            {"n_estimators": [200, 400, 600], "max_depth": [6, 12, 18], "min_samples_leaf": [1, 2, 4]},
        ),
        ModelSpec(
            "XGBoost",
            "ml",
            "xgboost",
            "XGBoost lag model.",
            {"n_estimators": 400, "learning_rate": 0.05, "max_depth": 8, "subsample": 0.9, "colsample_bytree": 0.9},
            {
                "n_estimators": [200, 400, 600],
                "learning_rate": [0.01, 0.03, 0.05, 0.1],
                "max_depth": [4, 6, 8, 10],
                "subsample": [0.7, 0.85, 1.0],
                "colsample_bytree": [0.7, 0.85, 1.0],
            },
            ["xgboost"],
        ),
        ModelSpec(
            "LightGBM",
            "ml",
            "lightgbm",
            "LightGBM lag model.",
            {"n_estimators": 400, "learning_rate": 0.05, "num_leaves": 31, "feature_fraction": 0.9, "bagging_fraction": 0.9},
            {
                "n_estimators": [200, 400, 600],
                "learning_rate": [0.01, 0.03, 0.05, 0.1],
                "num_leaves": [15, 31, 63],
                "feature_fraction": [0.7, 0.85, 1.0],
                "bagging_fraction": [0.7, 0.85, 1.0],
            },
            ["lightgbm"],
        ),
        ModelSpec(
            "CatBoost",
            "ml",
            "catboost",
            "CatBoost lag model.",
            {"depth": 8, "learning_rate": 0.05, "iterations": 500},
            {"depth": [6, 8, 10], "learning_rate": [0.01, 0.03, 0.05, 0.1], "iterations": [300, 500, 800]},
            ["catboost"],
        ),
        ModelSpec("LSTM", "deep", "neuralforecast", "LSTM sequence model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("NBEATS", "deep", "neuralforecast", "N-BEATS deep model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("NHITS", "deep", "neuralforecast", "N-HiTS deep model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("TFT", "deep", "neuralforecast", "Temporal Fusion Transformer.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("PatchTST", "deep", "neuralforecast", "PatchTST transformer model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("Informer", "deep", "neuralforecast", "Informer transformer model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("DeepAR", "deep", "neuralforecast", "DeepAR probabilistic model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("TimesNet", "deep", "neuralforecast", "TimesNet deep model.", {"max_steps": 300}, {}, ["neuralforecast", "torch"]),
        ModelSpec("EnsembleMean", "ensemble", "postprocess", "Average ensemble across successful models."),
        ModelSpec("EnsembleWeighted", "ensemble", "postprocess", "Weighted ensemble by inverse error."),
        ModelSpec("BottomUpReconciliation", "hierarchical", "hierarchical", "Bottom-up hierarchy reconciliation."),
        ModelSpec("TopDownReconciliation", "hierarchical", "hierarchical", "Top-down hierarchy reconciliation."),
        ModelSpec("MinTReconciliation", "hierarchical", "hierarchical", "MinT reconciliation."),
        ModelSpec(
            "InStockClassifier",
            "inventory",
            "sklearn",
            "Binary in-stock probability classifier using lag and calendar features.",
            {"n_estimators": 300, "max_depth": 8},
            {"n_estimators": [200, 400, 600], "max_depth": [6, 8, 12]},
        ),
    ]
    return {spec.model_name: spec for spec in specs}


def get_default_model_list() -> list[str]:
    specs = get_model_specs()
    return list(specs.keys())
