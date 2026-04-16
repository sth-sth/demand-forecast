import axios from "axios";

import type {
  Dataset,
  DatasetPreview,
  ModelCatalogItem,
  ModelResult,
  Run,
  VisualizationResponse,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

export async function fetchModels(): Promise<ModelCatalogItem[]> {
  const { data } = await api.get<ModelCatalogItem[]>("/models");
  return data;
}

export async function fetchDatasets(): Promise<Dataset[]> {
  const { data } = await api.get<Dataset[]>("/datasets");
  return data;
}

export async function uploadDataset(formData: FormData): Promise<Dataset> {
  const { data } = await api.post<Dataset>("/datasets/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function createDemoDataset(): Promise<Dataset> {
  const { data } = await api.post<Dataset>("/datasets/demo");
  return data;
}

export async function fetchDatasetPreview(datasetId: number, limit = 20): Promise<DatasetPreview> {
  const { data } = await api.get<DatasetPreview>(`/datasets/${datasetId}/preview`, {
    params: { limit },
  });
  return data;
}

export async function createRun(payload: {
  dataset_id: number;
  horizon: number;
  metric: string;
  run_mode?: "selection" | "future_forecast";
  selection_run_id?: number | null;
  use_all_models: boolean;
  candidate_models: string[] | null;
  tune_trials: number;
  model_overrides: Record<string, Record<string, unknown>>;
  global_params: Record<string, unknown>;
}): Promise<{ run_id: number; status: string }> {
  const { data } = await api.post<{ run_id: number; status: string }>("/runs", payload);
  return data;
}

export async function fetchRun(runId: number): Promise<Run> {
  const { data } = await api.get<Run>(`/runs/${runId}`);
  return data;
}

export async function fetchRunResults(runId: number): Promise<ModelResult[]> {
  const { data } = await api.get<ModelResult[]>(`/runs/${runId}/results`);
  return data;
}

export async function fetchVisualizations(runId: number): Promise<VisualizationResponse> {
  const { data } = await api.get<VisualizationResponse>(`/runs/${runId}/visualizations`);
  return data;
}
