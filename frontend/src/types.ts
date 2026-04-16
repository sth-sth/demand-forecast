export interface Dataset {
  id: number;
  name: string;
  time_col: string;
  target_col: string;
  item_col: string | null;
  freq: string;
  columns_json: Record<string, string>;
  created_at: string;
}

export interface DatasetPreview {
  dataset_id: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total_rows: number;
  shown_rows: number;
}

export interface Run {
  id: number;
  dataset_id: number;
  status: string;
  metric: string;
  champion_model: string | null;
  error_message: string | null;
  config: Record<string, unknown>;
  summary: {
    run_mode?: "selection" | "future_forecast";
    metric?: string;
    context?: {
      prediction_kind?: "backtest" | "future";
      freq?: string;
      horizon?: number;
      history_start?: string | null;
      history_end?: string | null;
      train_end?: string | null;
      evaluation_start?: string | null;
      evaluation_end?: string | null;
      forecast_start?: string | null;
      forecast_end?: string | null;
      selection_run_id?: number | null;
    };
    selection_run_id?: number | null;
    champion?: {
      model_name?: string | null;
      params?: Record<string, unknown>;
      param_trace?: Array<Record<string, unknown>>;
      implementation?: Record<string, unknown>;
      future_predictions?: Array<Record<string, unknown>>;
    };
    leaderboard?: LeaderboardRow[];
    actuals?: Array<Record<string, unknown>>;
    figures?: {
      leaderboard?: PlotlyFigure;
      champion?: PlotlyFigure;
    };
  };
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ModelCatalogItem {
  model_name: string;
  family: string;
  backend: string;
  description: string;
  default_params: Record<string, unknown>;
  tunable_params: Record<string, unknown>;
  requires: string[];
}

export interface ModelResult {
  model_name: string;
  family: string;
  status: string;
  params: Record<string, unknown>;
  metrics: Record<string, number>;
  predictions: Array<Record<string, unknown>>;
  diagnostics: Record<string, unknown>;
  training_seconds: number;
  error_message: string | null;
}

export interface LeaderboardRow {
  rank: number;
  model_name: string;
  family: string;
  metric: string;
  score: number;
  training_seconds: number;
}

export interface PlotlyFigure {
  data?: unknown[];
  layout?: Record<string, unknown>;
}

export interface VisualizationResponse {
  leaderboard_figure: PlotlyFigure;
  champion_figure: PlotlyFigure;
}
