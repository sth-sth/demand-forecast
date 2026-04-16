from __future__ import annotations

from typing import Any

import pandas as pd
import plotly.graph_objects as go


def build_run_visualizations(
    model_results: list[dict[str, Any]],
    champion_model: str | None,
    metric: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    success_rows = [row for row in model_results if row.get("status") == "success" and metric in row.get("metrics", {})]
    success_rows = sorted(success_rows, key=lambda row: row["metrics"][metric])

    leaderboard_fig = go.Figure()
    leaderboard_fig.add_bar(
        x=[row["model_name"] for row in success_rows],
        y=[row["metrics"][metric] for row in success_rows],
        marker_color="#d97706",
    )
    leaderboard_fig.update_layout(
        title=f"Model Leaderboard by {metric.upper()}",
        xaxis_title="Model",
        yaxis_title=metric.upper(),
        template="plotly_white",
        margin={"l": 40, "r": 20, "t": 60, "b": 60},
    )

    champion_fig = go.Figure()
    has_actual_trace = False
    if champion_model:
        selected = next((row for row in model_results if row.get("model_name") == champion_model), None)
        if selected and selected.get("predictions"):
            pred_df = pd.DataFrame(selected["predictions"])
            if "ds" in pred_df.columns:
                pred_df["ds"] = pd.to_datetime(pred_df["ds"])

            for uid, group in pred_df.groupby("unique_id", sort=False):
                if "y" in group.columns and group["y"].notna().any():
                    actual_group = group[group["y"].notna()]
                    champion_fig.add_trace(
                        go.Scatter(
                            x=actual_group["ds"],
                            y=actual_group["y"],
                            mode="lines+markers",
                            name=f"actual:{uid}",
                            line={"color": "#1f2937", "width": 2},
                        )
                    )
                    has_actual_trace = True

                champion_fig.add_trace(
                    go.Scatter(
                        x=group["ds"],
                        y=group["y_pred"],
                        mode="lines+markers",
                        name=f"forecast:{uid}",
                        line={"color": "#dc2626", "dash": "dash", "width": 2},
                    )
                )

    champion_fig.update_layout(
        title=(
            f"Champion Model Backtest: {champion_model or 'N/A'}"
            if has_actual_trace
            else f"Champion Model Future Forecast: {champion_model or 'N/A'}"
        ),
        xaxis_title="Date",
        yaxis_title="Demand",
        template="plotly_white",
        margin={"l": 40, "r": 20, "t": 60, "b": 40},
    )

    return leaderboard_fig.to_dict(), champion_fig.to_dict()
