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

function isEnglishUi(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem("df_lang") === "en";
}

function extractErrorDetail(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const lines = detail.map((item) => String(item).trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.join("; ");
    }
  }

  return null;
}

function toReadableApiError(error: unknown): Error {
  const en = isEnglishUi();

  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new Error(en ? "Unknown error" : "未知错误");
  }

  if (!error.response) {
    return new Error(
      en
        ? `Cannot connect to backend API (current base URL: ${API_BASE_URL}). Ensure backend is online and VITE_API_BASE_URL is configured.`
        : `无法连接后端接口（当前 API 地址：${API_BASE_URL}）。请确认后端已上线，并在前端配置 VITE_API_BASE_URL。`
    );
  }

  const status = error.response.status;
  const detail = extractErrorDetail(error.response.data);

  if (status === 404 && API_BASE_URL === "/api") {
    return new Error(
      en
        ? "API returned 404: frontend is calling same-origin /api, but this deployment likely hosts frontend only. Set VITE_API_BASE_URL to your backend URL (for example https://your-backend-domain/api)."
        : "接口返回 404：当前前端在请求同域 /api，但该部署通常只托管前端。请把 VITE_API_BASE_URL 配置为后端完整地址（例如 https://your-backend-domain/api）。"
    );
  }

  if (detail) {
    return new Error(en ? `API request failed (${status}): ${detail}` : `接口请求失败 (${status})：${detail}`);
  }

  return new Error(en ? `API request failed (${status})` : `接口请求失败 (${status})`);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toReadableApiError(error))
);

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
