import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import {
  createDemoDataset,
  createRun,
  fetchDatasetPreview,
  fetchDatasets,
  fetchModels,
  fetchRun,
  fetchRunResults,
  fetchVisualizations,
  uploadDataset,
} from "./api";
import { getModelKnowledge } from "./modelKnowledge";
import type {
  Dataset,
  DatasetPreview,
  ModelCatalogItem,
  ModelResult,
  PlotlyFigure,
  Run,
  VisualizationResponse,
} from "./types";

type PredictionPoint = {
  ds: string;
  unique_id: string;
  y: number;
  y_pred: number;
};

type PlotlyApi = {
  react: (
    element: HTMLDivElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<unknown> | void;
  Plots?: {
    resize: (element: HTMLDivElement) => void;
  };
};

type RunMode = "selection" | "future_forecast";

type PipelineStage =
  | "idle"
  | "selection-running"
  | "selection-completed"
  | "future-running"
  | "completed"
  | "failed";

type ParamTraceRow = {
  param: string;
  source: string;
  default_value?: unknown;
  global_value?: unknown;
  override_value?: unknown;
  tuned_value?: unknown;
  final_value?: unknown;
};

type MetricFormulaGuide = {
  formula: string;
  explanation: string;
  params: Array<{
    symbol: string;
    meaning: string;
  }>;
};

function MarkdownMath({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {content}
    </ReactMarkdown>
  );
}

const PIPELINE_STAGE_LABEL: Record<PipelineStage, string> = {
  idle: "待启动",
  "selection-running": "阶段1进行中：模型选优",
  "selection-completed": "阶段1完成：已得到最佳模型",
  "future-running": "阶段2进行中：未来预测",
  completed: "两阶段完成：未来预测已生成",
  failed: "执行失败",
};

function getRunMode(run: Run | null): RunMode {
  const mode = run?.summary?.run_mode ?? run?.config?.run_mode;
  return mode === "future_forecast" ? "future_forecast" : "selection";
}

function toParamTraceRows(input: unknown): ParamTraceRow[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const rows: ParamTraceRow[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    const param = String(row.param ?? "").trim();
    if (!param) {
      continue;
    }

    rows.push({
      param,
      source: String(row.source ?? "unknown"),
      default_value: row.default_value,
      global_value: row.global_value,
      override_value: row.override_value,
      tuned_value: row.tuned_value,
      final_value: row.final_value,
    });
  }

  return rows;
}

declare global {
  interface Window {
    Plotly?: PlotlyApi;
  }
}

const METRIC_OPTIONS = [
  { value: "smape", label: "sMAPE（对称平均绝对百分比误差）" },
  { value: "mape", label: "MAPE（平均绝对百分比误差）" },
  { value: "mae", label: "MAE（平均绝对误差）" },
  { value: "rmse", label: "RMSE（均方根误差）" },
  { value: "wape", label: "WAPE（加权平均绝对百分比误差）" },
  { value: "mase", label: "MASE（平均绝对缩放误差）" },
];

const METRIC_FORMULA_GUIDES: Record<string, MetricFormulaGuide> = {
  mae: {
    formula: "$$MAE=\\frac{1}{n}\\sum_{i=1}^{n}|y_i-\\hat{y}_i|$$",
    explanation: "平均绝对误差，单位与销量一致，越小越好。",
    params: [
      { symbol: "y_i", meaning: "第 i 个样本真实需求" },
      { symbol: "y_pred_i", meaning: "第 i 个样本预测需求" },
      { symbol: "n", meaning: "样本数量" },
    ],
  },
  rmse: {
    formula: "$$RMSE=\\sqrt{\\frac{1}{n}\\sum_{i=1}^{n}(y_i-\\hat{y}_i)^2}$$",
    explanation: "对大误差更敏感，适合控制极端偏差。",
    params: [
      { symbol: "y_i", meaning: "第 i 个样本真实需求" },
      { symbol: "y_pred_i", meaning: "第 i 个样本预测需求" },
      { symbol: "n", meaning: "样本数量" },
    ],
  },
  mape: {
    formula: "$$MAPE=\\frac{100}{n}\\sum_{i=1}^{n}\\left|\\frac{y_i-\\hat{y}_i}{\\max(|y_i|,\\epsilon)}\\right|$$",
    explanation: "百分比误差，便于跨商品比较。",
    params: [
      { symbol: "eps", meaning: "极小值保护，避免除以 0" },
      { symbol: "y_i", meaning: "第 i 个样本真实需求" },
      { symbol: "y_pred_i", meaning: "第 i 个样本预测需求" },
    ],
  },
  smape: {
    formula:
      "$$sMAPE=\\frac{100}{n}\\sum_{i=1}^{n}\\frac{|y_i-\\hat{y}_i|}{\\max((|y_i|+|\\hat{y}_i|)/2,\\epsilon)}$$",
    explanation: "对称百分比误差，降低高低销量序列尺度差异影响。",
    params: [
      { symbol: "eps", meaning: "极小值保护，避免分母趋近 0" },
      { symbol: "y_i", meaning: "第 i 个样本真实需求" },
      { symbol: "y_pred_i", meaning: "第 i 个样本预测需求" },
    ],
  },
  wape: {
    formula: "$$WAPE=100\\cdot\\frac{\\sum_i|y_i-\\hat{y}_i|}{\\max(\\sum_i|y_i|,\\epsilon)}$$",
    explanation: "总量口径误差，适合采购与库存考核。",
    params: [
      { symbol: "sum|y_i|", meaning: "真实需求绝对值总和" },
      { symbol: "sum|y_i-y_pred_i|", meaning: "绝对误差总和" },
      { symbol: "eps", meaning: "极小值保护" },
    ],
  },
  mase: {
    formula:
      "$$MASE=\\frac{mean(|y_i-\\hat{y}_i|)}{\\max(mean(|y_t-y_{t-m}|),\\epsilon)}$$",
    explanation: "与季节性 Naive 标准化误差对比，便于跨序列评估。",
    params: [
      { symbol: "m", meaning: "季节周期长度" },
      { symbol: "y_t - y_{t-m}", meaning: "季节 Naive 的基准误差" },
      { symbol: "eps", meaning: "极小值保护" },
    ],
  },
};

const METRIC_EXCEL_WORKFLOW_GUIDES: Record<string, string[]> = {
  mae: [
    "将真实值放在 B 列，预测值放在 C 列。",
    "在 D2 写入绝对误差公式：`=ABS(B2-C2)`，向下填充。",
    "MAE 公式：`=AVERAGE(D2:Dn)`。",
  ],
  rmse: [
    "将真实值放在 B 列，预测值放在 C 列。",
    "在 D2 写入平方误差：`=(B2-C2)^2`，向下填充。",
    "RMSE 公式：`=SQRT(AVERAGE(D2:Dn))`。",
  ],
  mape: [
    "将真实值放在 B 列，预测值放在 C 列，设置 `eps` 在 H1（如 0.00000001）。",
    "在 D2 写入：`=ABS((B2-C2)/MAX(ABS(B2),$H$1))`，向下填充。",
    "MAPE(%) 公式：`=AVERAGE(D2:Dn)*100`。",
  ],
  smape: [
    "将真实值放在 B 列，预测值放在 C 列，设置 `eps` 在 H1（如 0.00000001）。",
    "在 D2 写入：`=ABS(B2-C2)/MAX((ABS(B2)+ABS(C2))/2,$H$1)`，向下填充。",
    "sMAPE(%) 公式：`=AVERAGE(D2:Dn)*100`。",
  ],
  wape: [
    "将真实值放在 B 列，预测值放在 C 列，设置 `eps` 在 H1（如 0.00000001）。",
    "在 D2 写入绝对误差：`=ABS(B2-C2)`，向下填充。",
    "WAPE(%) 公式：`=SUM(D2:Dn)/MAX(SUM(ABS(B2:Bn)),$H$1)*100`。",
  ],
  mase: [
    "将真实值放在 B 列，预测值放在 C 列，季节长度 `m` 放在 H1（如 7），`eps` 放在 H2。",
    "在 D2 写入绝对误差：`=ABS(B2-C2)`；在 E(m+2) 写入季节 naive 误差：`=ABS(B(m+2)-B2)`。",
    "MASE 公式：`=AVERAGE(D2:Dn)/MAX(AVERAGE(E(m+2):En),$H$2)`。",
  ],
};

const FAMILY_LABELS: Record<string, string> = {
  baseline: "基线模型",
  statistical: "统计模型",
  intermittent: "间歇需求模型",
  ml: "机器学习模型",
  deep: "深度学习模型",
  ensemble: "集成模型",
  hierarchical: "层级模型",
  inventory: "库存业务模型",
};

const COLUMN_EXPLANATIONS: Record<string, string> = {
  "日期": "业务日期（time_col）：每一行需求记录对应的发生日期。",
  "销量": "需求目标值（target_col）：该日期该商品的实际销量。",
  "商品编码": "序列ID（item_col）：用于区分不同商品或门店的时序。",
  "是否促销": "促销标记：1 表示促销，0 表示非促销。",
  "是否缺货": "缺货标记：1 表示出现缺货，0 表示正常供给。",
  "价格": "销售价格：用于业务解释，也可扩展为外生变量。",
  "温度": "环境温度：示例外部因素字段。",
  "节假日标签": "节假日标签：用于观察节日对需求波动的影响。",
  ds: "时间列（ds）：标准化后的日期字段。",
  y: "目标列（y）：标准化后的需求值字段。",
  unique_id: "序列ID（unique_id）：标准化后的商品/门店标识。",
};

const DEMO_FAST_MODELS = [
  "Naive",
  "SeasonalNaive",
  "AutoARIMA",
  "AutoETS",
  "RandomForest",
  "InStockClassifier",
  "EnsembleMean",
  "BottomUpReconciliation",
  "MinTReconciliation",
];

const METRIC_AXIS = ["mae", "rmse", "mape", "smape", "wape", "mase"];

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(3);
  }
  return String(value);
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeRelativeGain(best: number | null, reference: number | null): number | null {
  if (best === null || reference === null || reference === 0) {
    return null;
  }
  return ((reference - best) / Math.abs(reference)) * 100;
}

function toPredictionPoints(result: ModelResult | null): PredictionPoint[] {
  if (!result) {
    return [];
  }

  const points: PredictionPoint[] = [];
  for (const row of result.predictions) {
    const y = Number(row.y);
    const yPred = Number(row.y_pred);
    if (!Number.isFinite(y) || !Number.isFinite(yPred)) {
      continue;
    }
    points.push({
      ds: String(row.ds ?? ""),
      unique_id: String(row.unique_id ?? "unknown"),
      y,
      y_pred: yPred,
    });
  }
  return points;
}

function buildResidualFigure(points: PredictionPoint[]): PlotlyFigure | undefined {
  if (points.length === 0) {
    return undefined;
  }

  const residuals = points.map((item) => item.y - item.y_pred);
  return {
    data: [
      {
        type: "histogram",
        x: residuals,
        marker: { color: "#0f766e" },
        opacity: 0.85,
      },
    ],
    layout: {
      title: "冠军模型残差分布",
      xaxis: { title: "残差 (实际 - 预测)" },
      yaxis: { title: "频次" },
    },
  };
}

function buildScatterFigure(points: PredictionPoint[]): PlotlyFigure | undefined {
  if (points.length === 0) {
    return undefined;
  }

  const grouped = points.reduce<Record<string, PredictionPoint[]>>((acc, point) => {
    if (!acc[point.unique_id]) {
      acc[point.unique_id] = [];
    }
    acc[point.unique_id].push(point);
    return acc;
  }, {});

  return {
    data: Object.entries(grouped).map(([seriesId, rows]) => ({
      type: "scatter",
      mode: "markers",
      name: seriesId,
      x: rows.map((item) => item.y),
      y: rows.map((item) => item.y_pred),
      marker: { size: 8, opacity: 0.7 },
    })),
    layout: {
      title: "冠军模型 实际值 vs 预测值",
      xaxis: { title: "实际值" },
      yaxis: { title: "预测值" },
    },
  };
}

function buildRuntimeFigure(results: ModelResult[]): PlotlyFigure | undefined {
  const successRows = results.filter((item) => item.status === "success");
  if (successRows.length === 0) {
    return undefined;
  }

  const sorted = [...successRows].sort((a, b) => a.training_seconds - b.training_seconds);
  return {
    data: [
      {
        type: "bar",
        x: sorted.map((item) => item.model_name),
        y: sorted.map((item) => item.training_seconds),
        marker: { color: "#c2410c" },
      },
    ],
    layout: {
      title: "模型训练耗时对比",
      xaxis: { title: "模型" },
      yaxis: { title: "训练秒数" },
    },
  };
}

function buildMetricHeatmapFigure(results: ModelResult[]): PlotlyFigure | undefined {
  const successRows = results.filter((item) => item.status === "success");
  if (successRows.length === 0) {
    return undefined;
  }

  const ranked = [...successRows]
    .filter((item) => Number.isFinite(item.metrics.smape))
    .sort((a, b) => (a.metrics.smape ?? Number.MAX_VALUE) - (b.metrics.smape ?? Number.MAX_VALUE))
    .slice(0, 12);

  if (ranked.length === 0) {
    return undefined;
  }

  return {
    data: [
      {
        type: "heatmap",
        x: METRIC_AXIS.map((item) => item.toUpperCase()),
        y: ranked.map((item) => item.model_name),
        z: ranked.map((item) => METRIC_AXIS.map((metric) => Number(item.metrics[metric] ?? 0))),
        colorscale: "YlOrRd",
      },
    ],
    layout: {
      title: "Top 模型指标热力图（按 sMAPE）",
      xaxis: { title: "指标" },
      yaxis: { title: "模型" },
    },
  };
}

function PlotCanvas({
  figure,
  layoutOverrides,
}: {
  figure: PlotlyFigure;
  layoutOverrides?: Record<string, unknown>;
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [plotlyReady, setPlotlyReady] = useState(
    typeof window !== "undefined" && Boolean(window.Plotly)
  );

  useEffect(() => {
    if (plotlyReady || typeof window === "undefined") {
      return;
    }

    const timer = window.setInterval(() => {
      if (window.Plotly) {
        setPlotlyReady(true);
        window.clearInterval(timer);
      }
    }, 150);

    return () => window.clearInterval(timer);
  }, [plotlyReady]);

  useEffect(() => {
    if (!plotRef.current || !window.Plotly || !plotlyReady) {
      return;
    }

    const mergedLayout = {
      ...(figure.layout ?? {}),
      ...(layoutOverrides ?? {}),
    };

    window.Plotly.react(plotRef.current, (figure.data ?? []) as unknown[], mergedLayout, {
      responsive: true,
      displayModeBar: false,
    });

    const handleResize = () => {
      if (plotRef.current && window.Plotly?.Plots?.resize) {
        window.Plotly.Plots.resize(plotRef.current);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [figure.data, figure.layout, layoutOverrides, plotlyReady]);

  if (!plotlyReady) {
    return <p className="muted">图表引擎加载中，请稍后...</p>;
  }

  return <div ref={plotRef} className="plot-canvas" />;
}

function FigurePanel({ title, figure }: { title: string; figure?: PlotlyFigure }) {
  if (!figure?.data || figure.data.length === 0) {
    return (
      <section className="card">
        <h3>{title}</h3>
        <p className="muted">暂无可视化结果，先运行一次预测任务。</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>{title}</h3>
      <div className="plot-wrap">
        <PlotCanvas
          figure={figure}
          layoutOverrides={{
            autosize: true,
            paper_bgcolor: "#fff9ef",
            plot_bgcolor: "#fff9ef",
            font: { family: "Space Grotesk, sans-serif", color: "#1f2937" },
            margin: { l: 40, r: 20, t: 60, b: 50 },
          }}
        />
      </div>
    </section>
  );
}

export default function App() {
  const [models, setModels] = useState<ModelCatalogItem[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetPreview, setDatasetPreview] = useState<DatasetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<number | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [timeCol, setTimeCol] = useState("日期");
  const [targetCol, setTargetCol] = useState("销量");
  const [itemCol, setItemCol] = useState("");
  const [freq, setFreq] = useState("D");

  const [useAllModels, setUseAllModels] = useState(true);
  const [chosenModels, setChosenModels] = useState<string[]>([]);
  const [horizon, setHorizon] = useState(14);
  const [metric, setMetric] = useState("smape");
  const [tuneTrials, setTuneTrials] = useState(15);
  const [autoForecastEnabled, setAutoForecastEnabled] = useState(true);
  const [modelQuery, setModelQuery] = useState("");

  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [viz, setViz] = useState<VisualizationResponse | null>(null);
  const [selectionRunId, setSelectionRunId] = useState<number | null>(null);
  const [selectionRun, setSelectionRun] = useState<Run | null>(null);
  const [selectionResults, setSelectionResults] = useState<ModelResult[]>([]);
  const [selectionViz, setSelectionViz] = useState<VisualizationResponse | null>(null);
  const [futureRunId, setFutureRunId] = useState<number | null>(null);
  const [futureRun, setFutureRun] = useState<Run | null>(null);
  const [futureResults, setFutureResults] = useState<ModelResult[]>([]);
  const [futureViz, setFutureViz] = useState<VisualizationResponse | null>(null);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("平台已就绪，可上传数据或一键运行 Demo。");

  const selectedDatasetDetail = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDataset) ?? null,
    [datasets, selectedDataset]
  );

  const modelCountByFamily = useMemo(() => {
    return models.reduce<Record<string, number>>((acc, model) => {
      acc[model.family] = (acc[model.family] || 0) + 1;
      return acc;
    }, {});
  }, [models]);

  const evaluationResults = useMemo(() => {
    if (selectionResults.length > 0) {
      return selectionResults;
    }
    if (activeRun && getRunMode(activeRun) === "selection") {
      return results;
    }
    return [] as ModelResult[];
  }, [activeRun, results, selectionResults]);

  const rankedResults = useMemo(() => {
    return [...evaluationResults]
      .filter((r) => r.status === "success" && Number.isFinite(r.metrics[metric]))
      .sort((a, b) => (a.metrics[metric] ?? Number.MAX_VALUE) - (b.metrics[metric] ?? Number.MAX_VALUE));
  }, [evaluationResults, metric]);

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    if (!query) {
      return models;
    }
    return models.filter((item) => {
      const content = `${item.model_name} ${item.family} ${FAMILY_LABELS[item.family] ?? ""} ${item.description}`.toLowerCase();
      return content.includes(query);
    });
  }, [models, modelQuery]);

  const successfulResultByModel = useMemo(() => {
    const map = new Map<string, ModelResult>();
    for (const row of evaluationResults) {
      if (row.status === "success") {
        map.set(row.model_name, row);
      }
    }
    return map;
  }, [evaluationResults]);

  const championResult = useMemo(() => {
    const championName = selectionRun?.champion_model ?? rankedResults[0]?.model_name;
    if (!championName) {
      return null;
    }
    return evaluationResults.find((item) => item.model_name === championName && item.status === "success") ?? null;
  }, [evaluationResults, rankedResults, selectionRun?.champion_model]);

  const championModelName = championResult?.model_name ?? selectionRun?.champion_model ?? null;

  const futureResultRows = useMemo(() => {
    if (futureResults.length > 0) {
      return futureResults;
    }
    if (activeRun && getRunMode(activeRun) === "future_forecast") {
      return results;
    }
    return [] as ModelResult[];
  }, [activeRun, futureResults, results]);

  const futureChampionName =
    futureRun?.champion_model ??
    (activeRun && getRunMode(activeRun) === "future_forecast" ? activeRun.champion_model : null);

  const futureChampionResult = useMemo(() => {
    if (!futureChampionName) {
      return null;
    }
    return (
      futureResultRows.find(
        (row) => row.model_name === futureChampionName && row.status === "success"
      ) ?? null
    );
  }, [futureChampionName, futureResultRows]);

  const championModelSpec = useMemo(() => {
    if (!championModelName) {
      return null;
    }
    return models.find((item) => item.model_name === championModelName) ?? null;
  }, [championModelName, models]);

  const championKnowledge = useMemo(() => {
    if (!championModelSpec) {
      return null;
    }
    return getModelKnowledge(championModelSpec);
  }, [championModelSpec]);

  const championParamEntries = useMemo(() => {
    if (championResult) {
      const learnedParams = Object.entries(championResult.params ?? {});
      if (learnedParams.length > 0) {
        return learnedParams;
      }
    }
    return Object.entries(championModelSpec?.default_params ?? {});
  }, [championModelSpec, championResult]);

  const championMetricEntries = useMemo(() => {
    if (!championResult) {
      return [] as Array<[string, number]>;
    }
    return Object.entries(championResult.metrics ?? {}) as Array<[string, number]>;
  }, [championResult]);

  const championBacktestPreview = useMemo(() => {
    if (!championResult) {
      return [];
    }
    return championResult.predictions.slice(0, 8);
  }, [championResult]);

  const futurePredictionPreview = useMemo(() => {
    if (!futureChampionResult) {
      return [];
    }
    return futureChampionResult.predictions.slice(0, 12);
  }, [futureChampionResult]);

  const championParamTraceRows = useMemo(() => {
    if (!championResult) {
      return [] as ParamTraceRow[];
    }
    return toParamTraceRows((championResult.diagnostics as Record<string, unknown>)?.param_trace);
  }, [championResult]);

  const activeMetricGuide = METRIC_FORMULA_GUIDES[metric] ?? METRIC_FORMULA_GUIDES.smape;
  const activeMetricExcelWorkflow =
    METRIC_EXCEL_WORKFLOW_GUIDES[metric] ?? METRIC_EXCEL_WORKFLOW_GUIDES.smape;

  const championMetricScore = useMemo(() => {
    return championResult ? toFiniteNumber(championResult.metrics[metric]) : null;
  }, [championResult, metric]);

  const runnerUpResult = rankedResults.length > 1 ? rankedResults[1] : null;

  const baselineReferenceResult = useMemo(() => {
    return (
      rankedResults.find((row) => row.family === "baseline") ??
      evaluationResults.find((row) => row.family === "baseline" && row.status === "success") ??
      null
    );
  }, [evaluationResults, rankedResults]);

  const championGainVsRunnerUp = useMemo(() => {
    return computeRelativeGain(championMetricScore, toFiniteNumber(runnerUpResult?.metrics[metric]));
  }, [championMetricScore, metric, runnerUpResult]);

  const championGainVsBaseline = useMemo(() => {
    return computeRelativeGain(championMetricScore, toFiniteNumber(baselineReferenceResult?.metrics[metric]));
  }, [baselineReferenceResult, championMetricScore, metric]);

  const championBusinessActions = useMemo(() => {
    const actions: string[] = [];

    if (championGainVsRunnerUp !== null) {
      actions.push(
        `相对第二名模型，${metric.toUpperCase()} 下降 ${championGainVsRunnerUp.toFixed(2)}%，可作为当前优先上线候选。`
      );
    }

    if (championGainVsBaseline !== null) {
      actions.push(
        `相对最佳基线模型，${metric.toUpperCase()} 改善 ${championGainVsBaseline.toFixed(2)}%，说明不是“随机判断”，而是有可量化增益。`
      );
    }

    const futureValues = futurePredictionPreview
      .map((row) => toFiniteNumber(row.y_pred))
      .filter((value): value is number => value !== null);
    const backtestActualValues = championBacktestPreview
      .map((row) => toFiniteNumber(row.y))
      .filter((value): value is number => value !== null);

    if (futureValues.length > 0 && backtestActualValues.length > 0) {
      const futureAvg = futureValues.reduce((sum, value) => sum + value, 0) / futureValues.length;
      const backtestAvg =
        backtestActualValues.reduce((sum, value) => sum + value, 0) / backtestActualValues.length;

      if (backtestAvg > 0) {
        const ratio = futureAvg / backtestAvg;
        const deltaPct = (ratio - 1) * 100;
        if (ratio >= 1.1) {
          actions.push(`未来均值需求较最近回测均值上升 ${deltaPct.toFixed(1)}%，建议提前加大补货与产能准备。`);
        } else if (ratio <= 0.9) {
          actions.push(`未来均值需求较最近回测均值下降 ${Math.abs(deltaPct).toFixed(1)}%，建议控制库存水位与采购节奏。`);
        } else {
          actions.push("未来需求与近期水平接近，建议维持当前补货策略并持续周度监控。");
        }
      }
    }

    if (actions.length === 0) {
      actions.push("当前样本不足以生成自动业务建议，建议先完成阶段1和阶段2后再查看。");
    }

    return actions;
  }, [
    championBacktestPreview,
    championGainVsBaseline,
    championGainVsRunnerUp,
    futurePredictionPreview,
    metric,
  ]);

  const championMetricAuditPythonExample = useMemo(() => {
    return `import numpy as np
import pandas as pd

# 1) 准备文件：从平台导出阶段1回测结果为 backtest_predictions.csv
#    需要至少包含两列：y, y_pred
df = pd.read_csv("backtest_predictions.csv")
y_true = df["y"].astype(float).to_numpy()
y_pred = df["y_pred"].astype(float).to_numpy()
eps = 1e-8

def mae(a, b):
    return float(np.mean(np.abs(a - b)))

def rmse(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))

def mape(a, b):
    denom = np.maximum(np.abs(a), eps)
    return float(np.mean(np.abs((a - b) / denom)) * 100)

def smape(a, b):
    denom = np.maximum((np.abs(a) + np.abs(b)) / 2.0, eps)
    return float(np.mean(np.abs(a - b) / denom) * 100)

def wape(a, b):
    denom = np.maximum(np.sum(np.abs(a)), eps)
    return float(np.sum(np.abs(a - b)) / denom * 100)

def mase(a, b, seasonality=7):
    if len(a) <= seasonality:
        scale = np.mean(np.abs(np.diff(a)))
    else:
        scale = np.mean(np.abs(a[seasonality:] - a[:-seasonality]))
    scale = max(scale, eps)
    return float(np.mean(np.abs(a - b)) / scale)

scores = {
    "mae": mae(y_true, y_pred),
    "rmse": rmse(y_true, y_pred),
    "mape": mape(y_true, y_pred),
    "smape": smape(y_true, y_pred),
    "wape": wape(y_true, y_pred),
    "mase": mase(y_true, y_pred),
}

target_metric = "${metric}"
print(f"{target_metric.upper()} = {scores[target_metric]:.4f}")
print(scores)`;
  }, [metric]);

  const selectionLeaderboardFigure = selectionViz?.leaderboard_figure;
  const selectionChampionFigure = selectionViz?.champion_figure;
  const futureChampionFigure =
    futureViz?.champion_figure ??
    (activeRun && getRunMode(activeRun) === "future_forecast" ? viz?.champion_figure : undefined);

  const futureWindow =
    futureRun?.summary?.context ??
    (activeRun && getRunMode(activeRun) === "future_forecast" ? activeRun.summary?.context : undefined);

  const championPoints = useMemo(() => toPredictionPoints(championResult), [championResult]);
  const residualFigure = useMemo(() => buildResidualFigure(championPoints), [championPoints]);
  const scatterFigure = useMemo(() => buildScatterFigure(championPoints), [championPoints]);
  const runtimeFigure = useMemo(() => buildRuntimeFigure(evaluationResults), [evaluationResults]);
  const metricHeatmapFigure = useMemo(() => buildMetricHeatmapFigure(evaluationResults), [evaluationResults]);

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedDataset) {
      setDatasetPreview(null);
      return;
    }
    void loadDatasetPreview(selectedDataset);
  }, [selectedDataset]);

  useEffect(() => {
    if (!activeRunId) return;

    const timer = window.setInterval(async () => {
      try {
        const run = await fetchRun(activeRunId);
        setActiveRun(run);

        if (run.status === "completed") {
          window.clearInterval(timer);
          const [rows, charts] = await Promise.all([
            fetchRunResults(activeRunId),
            fetchVisualizations(activeRunId),
          ]);
          const runMode = getRunMode(run);

          if (runMode === "selection") {
            setSelectionRunId(run.id);
            setSelectionRun(run);
            setSelectionResults(rows);
            setSelectionViz(charts);

            const championName = run.champion_model;
            if (autoForecastEnabled && championName) {
              setPipelineStage("future-running");

              const championRow = rows.find(
                (row) => row.model_name === championName && row.status === "success"
              );
              const config = (run.config ?? {}) as Record<string, unknown>;

              const autoPayload = {
                dataset_id: Number(config.dataset_id ?? run.dataset_id) || run.dataset_id,
                horizon: Number(config.horizon ?? horizon) || horizon,
                metric: String(config.metric ?? run.metric ?? metric),
                run_mode: "future_forecast" as const,
                selection_run_id: run.id,
                use_all_models: false,
                candidate_models: [championName],
                tune_trials: 0,
                model_overrides: championRow
                  ? {
                      [championName]: championRow.params,
                    }
                  : {},
                global_params:
                  config.global_params && typeof config.global_params === "object"
                    ? (config.global_params as Record<string, unknown>)
                    : {},
              };

              try {
                const created = await createRun(autoPayload);
                setFutureRunId(created.run_id);
                setActiveRunId(created.run_id);
                setResults([]);
                setViz(null);
                setMessage(
                  `阶段1已完成（任务 #${run.id}，冠军模型 ${championName}）。阶段2未来预测任务 #${created.run_id} 已自动启动。`
                );
                return;
              } catch (autoError) {
                setPipelineStage("failed");
                setMessage(
                  `阶段1已完成，但阶段2自动预测启动失败：${(autoError as Error).message}`
                );
                return;
              }
            }

            setPipelineStage("selection-completed");
            setResults(rows);
            setViz(charts);
            setMessage(
              `阶段1已完成（任务 #${run.id}，冠军模型：${run.champion_model ?? "无"}）。当前为仅评估模式，未启动阶段2。`
            );
            return;
          }

          setFutureRunId(run.id);
          setFutureRun(run);
          setFutureResults(rows);
          setFutureViz(charts);
          setResults(rows);
          setViz(charts);
          setPipelineStage("completed");

          const context = run.summary?.context;
          const forecastStart = context?.forecast_start ?? "未知";
          const forecastEnd = context?.forecast_end ?? "未知";
          setMessage(
            `阶段2已完成（任务 #${run.id}，模型：${run.champion_model ?? "无"}）。未来预测窗口：${forecastStart} 至 ${forecastEnd}。`
          );
        }

        if (run.status === "failed") {
          window.clearInterval(timer);
          setPipelineStage("failed");
          setMessage(`任务 #${activeRunId} 失败：${run.error_message ?? "未知错误"}`);
        }
      } catch (error) {
        window.clearInterval(timer);
        setPipelineStage("failed");
        setMessage(`轮询任务状态失败：${(error as Error).message}`);
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [
    activeRunId,
    autoForecastEnabled,
    horizon,
    metric,
  ]);

  async function loadInitial() {
    setLoading(true);
    try {
      const [modelRows, datasetRows] = await Promise.all([fetchModels(), fetchDatasets()]);
      setModels(modelRows);
      setDatasets(datasetRows);
      if (datasetRows.length > 0) setSelectedDataset(datasetRows[0].id);
      if (modelRows.length > 0) setChosenModels(modelRows.slice(0, 8).map((m) => m.model_name));
    } finally {
      setLoading(false);
    }
  }

  async function loadDatasetPreview(datasetId: number) {
    setPreviewLoading(true);
    try {
      const preview = await fetchDatasetPreview(datasetId, 15);
      setDatasetPreview(preview);
    } catch {
      setDatasetPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function upsertDataset(dataset: Dataset) {
    setDatasets((prev) => {
      const exists = prev.some((row) => row.id === dataset.id);
      if (exists) {
        return prev.map((row) => (row.id === dataset.id ? dataset : row));
      }
      return [dataset, ...prev];
    });
  }

  async function onUpload() {
    if (!file) {
      setMessage("请先选择 CSV 文件。可直接使用下方 Demo 一键加载。 ");
      return;
    }

    setLoading(true);
    setMessage("正在上传数据集...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (datasetName.trim()) fd.append("name", datasetName.trim());
      fd.append("time_col", timeCol);
      fd.append("target_col", targetCol);
      fd.append("freq", freq);
      if (itemCol.trim()) fd.append("item_col", itemCol.trim());

      const row = await uploadDataset(fd);
      upsertDataset(row);
      setSelectedDataset(row.id);
      setMessage(`数据集上传成功：${row.name}`);
    } catch (error) {
      setMessage(`上传失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateDemoDataset() {
    setLoading(true);
    setMessage("正在加载内置 Demo 数据...");
    try {
      const row = await createDemoDataset();
      upsertDataset(row);
      setSelectedDataset(row.id);
      setTimeCol("日期");
      setTargetCol("销量");
      setItemCol("商品编码");
      setFreq("D");
      setMessage("Demo 数据已加载，可直接点击“开始预测”或“一键跑 Demo”。");
    } catch (error) {
      setMessage(`加载 Demo 失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function onRunDemoDirectly() {
    setLoading(true);
    setMessage("正在初始化 Demo 并启动阶段1模型选优...");
    try {
      const demoDataset = await createDemoDataset();
      upsertDataset(demoDataset);
      setSelectedDataset(demoDataset.id);
      setUseAllModels(false);
      setChosenModels(DEMO_FAST_MODELS);
      setHorizon(14);
      setMetric("smape");
      setTuneTrials(8);

      setSelectionRunId(null);
      setSelectionRun(null);
      setSelectionResults([]);
      setSelectionViz(null);
      setFutureRunId(null);
      setFutureRun(null);
      setFutureResults([]);
      setFutureViz(null);
      setPipelineStage("selection-running");

      const created = await createRun({
        dataset_id: demoDataset.id,
        horizon: 14,
        metric: "smape",
        run_mode: "selection",
        selection_run_id: null,
        use_all_models: false,
        candidate_models: DEMO_FAST_MODELS,
        tune_trials: 8,
        model_overrides: {},
        global_params: {},
      });

      setActiveRunId(created.run_id);
      setResults([]);
      setViz(null);
      setMessage(
        autoForecastEnabled
          ? `阶段1任务 #${created.run_id} 已启动。完成后将自动进入阶段2未来预测。`
          : `阶段1任务 #${created.run_id} 已启动。当前为仅评估模式。`
      );
    } catch (error) {
      setPipelineStage("failed");
      setMessage(`一键跑 Demo 失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function toggleModel(modelName: string) {
    setChosenModels((prev) => {
      if (prev.includes(modelName)) return prev.filter((name) => name !== modelName);
      return [...prev, modelName];
    });
  }

  async function onRun() {
    if (!selectedDataset) {
      setMessage("请先选择一个数据集。可点击“一键加载 Demo 数据”。");
      return;
    }

    setLoading(true);
    setMessage("正在创建阶段1模型选优任务...");
    try {
      setSelectionRunId(null);
      setSelectionRun(null);
      setSelectionResults([]);
      setSelectionViz(null);
      setFutureRunId(null);
      setFutureRun(null);
      setFutureResults([]);
      setFutureViz(null);
      setPipelineStage("selection-running");

      const payload = {
        dataset_id: selectedDataset,
        horizon,
        metric,
        run_mode: "selection" as const,
        selection_run_id: null,
        use_all_models: useAllModels,
        candidate_models: useAllModels ? null : chosenModels,
        tune_trials: tuneTrials,
        model_overrides: {},
        global_params: {},
      };

      const created = await createRun(payload);
      setActiveRunId(created.run_id);
      setResults([]);
      setViz(null);
      setMessage(
        autoForecastEnabled
          ? `阶段1任务 #${created.run_id} 已启动。完成后将自动进入阶段2未来预测。`
          : `阶段1任务 #${created.run_id} 已启动。当前为仅评估模式。`
      );
    } catch (error) {
      setPipelineStage("failed");
      setMessage(`创建任务失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="kicker">Enterprise Forecasting Platform</p>
        <h1>需求预测 Demo 工作台</h1>
        <p>
          支持一键加载中文 Demo、自动训练对比多模型、自动调参、输出排行榜与冠军模型可视化。
          页面中的字段与输入参数均提供中文解释，便于业务与技术团队协作。
        </p>
      </header>

      <main className="grid">
        <section className="card">
          <h3>1) 数据接入（支持中文字段）</h3>
          <p className="section-desc">
            说明：如果你想立刻体验，请直接点击下方“加载 Demo”或“一键跑 Demo”。
          </p>
          <div className="form-grid">
            <label>
              CSV 文件（file）
              <span className="help-text">上传历史需求数据文件，建议 UTF-8 编码。</span>
              <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label>
              数据集名称（name）
              <span className="help-text">可选。用于区分不同批次数据集。</span>
              <input
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="例如：华东门店日销量"
              />
            </label>
            <label>
              时间列（time_col）
              <span className="help-text">表示日期时间的字段名，例如“日期”或“ds”。</span>
              <input value={timeCol} onChange={(e) => setTimeCol(e.target.value)} />
            </label>
            <label>
              目标列（target_col）
              <span className="help-text">实际需求量字段名，例如“销量”或“y”。</span>
              <input value={targetCol} onChange={(e) => setTargetCol(e.target.value)} />
            </label>
            <label>
              序列列（item_col，可选）
              <span className="help-text">多商品/门店场景下用于区分序列，例如“商品编码”。</span>
              <input value={itemCol} onChange={(e) => setItemCol(e.target.value)} placeholder="例如：商品编码" />
            </label>
            <label>
              频率（freq）
              <span className="help-text">D=日，W=周，M=月。与业务统计口径保持一致。</span>
              <input value={freq} onChange={(e) => setFreq(e.target.value)} placeholder="D / W / M" />
            </label>
          </div>
          <div className="button-row">
            <button disabled={loading} onClick={() => void onUpload()}>
              上传自有数据
            </button>
            <button className="btn-secondary" disabled={loading} onClick={() => void onCreateDemoDataset()}>
              加载 Demo 数据
            </button>
            <button className="btn-secondary" disabled={loading} onClick={() => void onRunDemoDirectly()}>
              一键跑 Demo
            </button>
          </div>
        </section>

        <section className="card">
          <h3>2) 模型范围（中文分类）</h3>
          <p className="section-desc">
            说明：可以自动跑全模型，也可以手动选择模型集合做快速实验。
          </p>
          <div className="family-stats">
            {Object.entries(modelCountByFamily).map(([family, count]) => (
              <span key={family} className="pill">
                {FAMILY_LABELS[family] ?? family}: {count}
              </span>
            ))}
          </div>
          <label className="inline">
            <input
              type="checkbox"
              checked={useAllModels}
              onChange={(e) => setUseAllModels(e.target.checked)}
            />
            自动对比全部模型（全面评估）
          </label>

          <label>
            算法搜索（用于模型选择与知识中心）
            <span className="help-text">支持按模型名、分类、描述关键字筛选。</span>
            <input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="例如：LightGBM / intermittent / prophet"
            />
          </label>

          {!useAllModels && (
            <div className="model-pool">
              {filteredModels.map((model) => (
                <label key={model.model_name} className="model-item">
                  <input
                    type="checkbox"
                    checked={chosenModels.includes(model.model_name)}
                    onChange={() => toggleModel(model.model_name)}
                  />
                  <span>{model.model_name}</span>
                </label>
              ))}
              {filteredModels.length === 0 && (
                <p className="muted">未找到匹配模型，请调整检索词。</p>
              )}
            </div>
          )}
        </section>

        <section className="card full-width">
          <h3>3) 业务落地知识中心（函数包 + 更新公式 + Python/Excel 复现）</h3>
          <p className="section-desc">
            说明：每个算法都展示业务逻辑、可直接调用函数包、可渲染数学公式、状态更新方程、参数释义、数学推导步骤、底层 Python 实现和 Excel 复核路径，确保可讲清、可复验、可落地。
          </p>
          <p className="muted">
            当前显示 {filteredModels.length} / {models.length} 个模型。点击卡片可展开详细内容。
          </p>

          <div className="knowledge-grid">
            {filteredModels.map((model) => {
              const knowledge = getModelKnowledge(model);
              const paramEntries = Object.entries(knowledge.paramNotes);
              const logicItems = knowledge.logic;
              const functionPackageItems = knowledge.functionPackages;
              const formulaItems = knowledge.formula;
              const updateEquationItems = knowledge.updateEquations;
              const exampleItems = knowledge.example;
              const tipItems = knowledge.tips;
              const defaultEntries = Object.entries(model.default_params ?? {});
              const tunableEntries = Object.entries(model.tunable_params ?? {});
              const runResult = successfulResultByModel.get(model.model_name);
              const trainedParamEntries = Object.entries(runResult?.params ?? {});
              const modelMetricEntries = Object.entries(runResult?.metrics ?? {});
              const predictionPreviewRows = (runResult?.predictions ?? []).slice(0, 5);

              return (
                <details key={`knowledge-${model.model_name}`} className="knowledge-card">
                  <summary>
                    <div className="knowledge-head">
                      <div>
                        <p className="label">算法名称</p>
                        <h4>{model.model_name}</h4>
                      </div>
                      <span className="pill">{FAMILY_LABELS[model.family] ?? model.family}</span>
                    </div>
                    <p className="muted">{knowledge.overview}</p>
                  </summary>

                  <div className="knowledge-body">
                    <p>
                      <strong>算法逻辑：</strong>
                    </p>
                    <ul className="knowledge-list">
                      {logicItems.map((item, index) => (
                        <li key={`${model.model_name}-logic-${index}`}>{item}</li>
                      ))}
                    </ul>

                    <div className="knowledge-section">
                      <p className="label">函数包（可直接调用）</p>
                      <ul className="knowledge-list">
                        {functionPackageItems.map((item, index) => (
                          <li key={`${model.model_name}-pkg-${index}`}>
                            <MarkdownMath content={item} className="markdown-content" />
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">核心公式</p>
                      <div className="markdown-math-list">
                        {formulaItems.map((item, index) => (
                          <div className="math-block" key={`${model.model_name}-formula-${index}`}>
                            <MarkdownMath content={item} className="markdown-content" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">状态更新公式（递推）</p>
                      <div className="markdown-math-list">
                        {updateEquationItems.map((item, index) => (
                          <div className="math-block" key={`${model.model_name}-update-eq-${index}`}>
                            <MarkdownMath content={item} className="markdown-content" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">公式参数解释（符号 - 含义 - 业务取值）</p>
                      {knowledge.formulaParameters.length > 0 ? (
                        <div className="table-wrap compact-table">
                          <table>
                            <thead>
                              <tr>
                                <th>符号</th>
                                <th>含义</th>
                                <th>业务取值建议</th>
                              </tr>
                            </thead>
                            <tbody>
                              {knowledge.formulaParameters.map((row) => (
                                <tr key={`${model.model_name}-symbol-${row.symbol}`}>
                                  <td>{row.symbol}</td>
                                  <td>{row.meaning}</td>
                                  <td>{row.businessValueGuide}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted">该算法没有固定闭式公式，请参考下方 Python 步骤复现。</p>
                      )}
                    </div>

                    <div className="knowledge-section">
                      <p className="label">数学推导步骤（可人工验算）</p>
                      <ol className="guide-list">
                        {knowledge.mathWorkflow.map((workflowItem, index) => (
                          <li key={`${model.model_name}-math-${index}`}>
                            <MarkdownMath content={workflowItem} className="markdown-content" />
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">手算示例（代入具体数字）</p>
                      <ol className="guide-list">
                        {knowledge.manualCalculationSteps.map((workflowItem, index) => (
                          <li key={`${model.model_name}-manual-calc-${index}`}>
                            <MarkdownMath content={workflowItem} className="markdown-content" />
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">具体例子</p>
                      <ul className="knowledge-list">
                        {exampleItems.map((item, index) => (
                          <li key={`${model.model_name}-example-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <p>
                      <strong>模型概览：</strong>
                      {knowledge.overview}
                    </p>
                    <p>
                      <strong>基础描述：</strong>
                      {model.description}
                    </p>

                    <div className="knowledge-section">
                      <p className="label">参数解释</p>
                      {paramEntries.length > 0 ? (
                        <ul className="knowledge-list">
                          {paramEntries.map(([key, value]) => (
                            <li key={`${model.model_name}-param-${key}`}>
                              <strong>{key}</strong>：{value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">暂无预置参数解释。</p>
                      )}
                    </div>

                    <div className="knowledge-section">
                      <p className="label">默认参数参考值</p>
                      {defaultEntries.length > 0 ? (
                        <div className="param-pills">
                          {defaultEntries.map(([key, value]) => (
                            <span className="pill" key={`${model.model_name}-default-${key}`}>
                              {key} = {formatParamValue(value)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">该模型没有默认参数配置。</p>
                      )}
                    </div>

                    <div className="knowledge-section">
                      <p className="label">可调参数搜索空间</p>
                      {tunableEntries.length > 0 ? (
                        <div className="param-pills">
                          {tunableEntries.map(([key, value]) => (
                            <span className="pill" key={`${model.model_name}-tunable-${key}`}>
                              {key} in {formatParamValue(value)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">该模型当前未配置自动调参搜索空间。</p>
                      )}
                    </div>

                    <div className="knowledge-section">
                      <p className="label">本次运行得到的模型参数</p>
                      {runResult ? (
                        <>
                          {trainedParamEntries.length > 0 ? (
                            <div className="param-pills">
                              {trainedParamEntries.map(([key, value]) => (
                                <span className="pill" key={`${model.model_name}-trained-${key}`}>
                                  {key} = {formatParamValue(value)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="muted">本次运行未返回该模型参数明细。</p>
                          )}

                          {modelMetricEntries.length > 0 && (
                            <div className="param-pills metric-pills">
                              {modelMetricEntries.map(([key, value]) => (
                                <span className="pill" key={`${model.model_name}-metric-${key}`}>
                                  {key.toUpperCase()} = {Number(value).toFixed(4)}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="muted">该模型尚未产出结果。先运行一次任务后会显示训练后的实际参数。</p>
                      )}
                    </div>

                    <div className="knowledge-section">
                      <p className="label">Python 落地步骤（可在本机复现）</p>
                      <ol className="guide-list">
                        {knowledge.pythonWorkflow.map((workflowItem) => (
                          <li key={`${model.model_name}-workflow-${workflowItem.step}`}>
                            <strong>{workflowItem.step}</strong>：{workflowItem.detail}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">底层 Python 参考实现（核心计算逻辑）</p>
                      <pre className="code-block">{knowledge.pythonReferenceCode}</pre>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">Excel 复现路径（便于业务同学验算）</p>
                      <ol className="guide-list">
                        {knowledge.excelWorkflow.map((workflowItem, index) => (
                          <li key={`${model.model_name}-excel-${index}`}>
                            <MarkdownMath content={workflowItem} className="markdown-content" />
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">可复现检查清单</p>
                      <ul className="knowledge-list">
                        {knowledge.reproducibilityChecklist.map((checkItem, index) => (
                          <li key={`${model.model_name}-check-${index}`}>{checkItem}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="knowledge-section">
                      <p className="label">阶段1回测样例（前 5 条）</p>
                      {predictionPreviewRows.length > 0 ? (
                        <div className="table-wrap compact-table">
                          <table>
                            <thead>
                              <tr>
                                <th>日期</th>
                                <th>序列</th>
                                <th>预测值 y_pred</th>
                                <th>实际值 y</th>
                              </tr>
                            </thead>
                            <tbody>
                              {predictionPreviewRows.map((row, index) => (
                                <tr key={`${model.model_name}-pred-${index}`}>
                                  <td>{formatCell(row.ds)}</td>
                                  <td>{formatCell(row.unique_id)}</td>
                                  <td>{formatCell(row.y_pred)}</td>
                                  <td>{formatCell(row.y)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted">暂无样例预测值。先完成阶段1后，这里会显示该模型的回测结果。</p>
                      )}
                    </div>

                    <div className="knowledge-section">
                      <p className="label">调参建议</p>
                      <ul className="knowledge-list">
                        {tipItems.map((item, index) => (
                          <li key={`${model.model_name}-tip-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="knowledge-links">
                      {knowledge.links.map((link) => (
                        <a
                          key={`${model.model_name}-${link.url}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>

          {filteredModels.length === 0 && <p className="muted">未匹配到算法，请更换搜索关键词。</p>}
        </section>

        <section className="card full-width">
          <h3>4) Demo 数据内容与中文字段解释</h3>
          {selectedDatasetDetail ? (
            <div className="dataset-meta">
              <p>
                当前数据集：<strong>{selectedDatasetDetail.name}</strong>（ID: {selectedDatasetDetail.id}）
              </p>
              <div className="meta-grid">
                <span className="pill">时间列: {selectedDatasetDetail.time_col}</span>
                <span className="pill">目标列: {selectedDatasetDetail.target_col}</span>
                <span className="pill">序列列: {selectedDatasetDetail.item_col ?? "未设置"}</span>
                <span className="pill">频率: {selectedDatasetDetail.freq}</span>
              </div>
            </div>
          ) : (
            <p className="muted">尚未选择数据集。</p>
          )}

          {previewLoading && <p className="muted">正在加载数据预览...</p>}

          {!previewLoading && datasetPreview && (
            <>
              <p className="muted">
                数据总行数：{datasetPreview.total_rows}，当前展示前 {datasetPreview.shown_rows} 行。
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {datasetPreview.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datasetPreview.rows.map((row, idx) => (
                      <tr key={idx}>
                        {datasetPreview.columns.map((col) => (
                          <td key={`${idx}-${col}`}>{formatCell(row[col])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="explain-grid">
                {datasetPreview.columns.map((col) => (
                  <div className="explain-item" key={`explain-${col}`}>
                    <p className="label">字段：{col}</p>
                    <p className="muted">{COLUMN_EXPLANATIONS[col] ?? "该字段暂无预置说明，可按业务自行补充。"}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {!previewLoading && !datasetPreview && (
            <p className="muted">暂无数据预览。请上传数据或加载 Demo。</p>
          )}
        </section>

        <section className="card">
          <h3>5) 预测参数配置（中文解释）</h3>
          <div className="form-grid">
            <label>
              数据集（dataset_id）
              <span className="help-text">选择要建模的数据集。</span>
              <select
                value={selectedDataset ?? ""}
                onChange={(e) => setSelectedDataset(Number(e.target.value))}
              >
                <option value="" disabled>
                  请选择数据集
                </option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    #{dataset.id} {dataset.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              预测步长（horizon）
              <span className="help-text">向未来预测多少期，日频下通常为 7/14/30 天。</span>
              <input
                type="number"
                min={1}
                max={180}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
              />
            </label>
            <label>
              优化指标（metric）
              <span className="help-text">用于模型排序与冠军模型选择的指标。</span>
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {METRIC_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              调参轮次（tune_trials）
              <span className="help-text">数值越大越可能找到好参数，但耗时更长。</span>
              <input
                type="number"
                min={0}
                max={50}
                value={tuneTrials}
                onChange={(e) => setTuneTrials(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="inline">
            <input
              type="checkbox"
              checked={autoForecastEnabled}
              onChange={(e) => setAutoForecastEnabled(e.target.checked)}
            />
            启用两阶段串行（先选优，再未来预测；严格串行，不并行）
          </label>
          <button disabled={loading} onClick={() => void onRun()}>
            {autoForecastEnabled ? "开始串行预测（先选优后未来预测）" : "开始评估（仅阶段1选优）"}
          </button>
          <p className="muted">{message}</p>
        </section>

        <section className="card">
          <h3>6) 任务状态</h3>
          <div className="status-grid">
            <div>
              <p className="label">流程阶段</p>
              <p>{PIPELINE_STAGE_LABEL[pipelineStage]}</p>
            </div>
            <div>
              <p className="label">阶段1任务ID（选优）</p>
              <p>{selectionRunId ? `#${selectionRunId}` : "-"}</p>
            </div>
            <div>
              <p className="label">阶段2任务ID（未来预测）</p>
              <p>{futureRunId ? `#${futureRunId}` : "-"}</p>
            </div>
            <div>
              <p className="label">当前活跃任务</p>
              <p>{activeRun ? `#${activeRun.id} (${activeRun.status})` : "-"}</p>
            </div>
          </div>

          {futureWindow?.forecast_start && futureWindow?.forecast_end && (
            <p className="muted">
              未来预测窗口：{futureWindow.forecast_start} 至 {futureWindow.forecast_end}，
              步长 {futureWindow.horizon ?? "-"}，频率 {futureWindow.freq ?? "-"}。
            </p>
          )}

          {!activeRun && pipelineStage === "idle" && <p className="muted">暂无运行中的任务。</p>}
        </section>

        <section className="card full-width">
          <h3>7) 冠军模型业务决策链（参数 + 公式 + 可复现）</h3>
          {championModelSpec && championKnowledge ? (
            <>
              <p>
                当前冠军模型：<strong>{championModelSpec.model_name}</strong>
                （{FAMILY_LABELS[championModelSpec.family] ?? championModelSpec.family}）
              </p>
              <p className="muted">
                下面展示的是阶段1选优得到的冠军模型参数、选型依据和业务动作建议，确保过程可审计、可解释、可复现。
              </p>

              {championModelSpec.model_name === "AutoETS" && (
                <div className="focus-box">
                  <p>
                    <strong>AutoETS 读法（示例）：</strong>
                    如果你看到参数 season_length = 7，表示模型按 7 天一个周期学习季节性。
                    日频业务里通常对应“周内模式”。
                  </p>
                </div>
              )}

              <div className="knowledge-section">
                <p className="label">为什么它是冠军模型</p>
                <ul className="knowledge-list">
                  <li>
                    本次按 <strong>{metric.toUpperCase()}</strong> 指标选优，冠军得分为
                    <strong> {championMetricScore !== null ? championMetricScore.toFixed(4) : "-"}</strong>（越小越好）。
                  </li>
                  <li>
                    相对第二名模型：
                    {championGainVsRunnerUp !== null
                      ? `指标改善 ${championGainVsRunnerUp.toFixed(2)}%`
                      : "当前样本不足，无法计算改善率"}
                    。
                  </li>
                  <li>
                    相对最佳基线模型：
                    {championGainVsBaseline !== null
                      ? `指标改善 ${championGainVsBaseline.toFixed(2)}%`
                      : "当前无可比较基线"}
                    。
                  </li>
                </ul>
              </div>

              <div className="knowledge-section">
                <p className="label">当前选优指标公式与参数解释</p>
                <div className="math-block">
                  <MarkdownMath content={activeMetricGuide.formula} className="markdown-content" />
                </div>
                <p className="muted">{activeMetricGuide.explanation}</p>
                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>符号</th>
                        <th>含义</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeMetricGuide.params.map((row) => (
                        <tr key={`metric-guide-${row.symbol}`}>
                          <td>{row.symbol}</td>
                          <td>{row.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="knowledge-section">
                <p className="label">这个冠军模型的参数是什么</p>
                {championParamEntries.length > 0 ? (
                  <div className="table-wrap compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>参数</th>
                          <th>当前值</th>
                          <th>通俗解释</th>
                        </tr>
                      </thead>
                      <tbody>
                        {championParamEntries.map(([key, value]) => (
                          <tr key={`champion-param-${key}`}>
                            <td>{key}</td>
                            <td>{formatParamValue(value)}</td>
                            <td>{championKnowledge.paramNotes[key] ?? "该参数用于控制模型学习方式，可按验证结果微调。"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">当前没有返回参数明细，建议重新运行一次任务后查看。</p>
                )}

                {championMetricEntries.length > 0 && (
                  <div className="param-pills metric-pills">
                    {championMetricEntries.map(([key, value]) => (
                      <span className="pill" key={`champion-metric-${key}`}>
                        {key.toUpperCase()} = {Number(value).toFixed(4)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="knowledge-section">
                <p className="label">冠军模型函数包（可直接调用）</p>
                <ul className="knowledge-list">
                  {championKnowledge.functionPackages.map((item, index) => (
                    <li key={`champion-pkg-${index}`}>
                      <MarkdownMath content={item} className="markdown-content" />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="knowledge-section">
                <p className="label">冠军模型状态更新公式（递推）</p>
                <div className="markdown-math-list">
                  {championKnowledge.updateEquations.map((item, index) => (
                    <div className="math-block" key={`champion-update-eq-${index}`}>
                      <MarkdownMath content={item} className="markdown-content" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="knowledge-section">
                <p className="label">参数如何带入模型（来源链路）</p>
                {championParamTraceRows.length > 0 ? (
                  <div className="table-wrap compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>参数</th>
                          <th>默认值</th>
                          <th>全局覆盖</th>
                          <th>模型覆盖</th>
                          <th>调参值</th>
                          <th>最终值</th>
                          <th>最终来源</th>
                        </tr>
                      </thead>
                      <tbody>
                        {championParamTraceRows.map((row) => (
                          <tr key={`param-trace-${row.param}`}>
                            <td>{row.param}</td>
                            <td>{formatParamValue(row.default_value)}</td>
                            <td>{formatParamValue(row.global_value)}</td>
                            <td>{formatParamValue(row.override_value)}</td>
                            <td>{formatParamValue(row.tuned_value)}</td>
                            <td>{formatParamValue(row.final_value)}</td>
                            <td>{row.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">该模型暂未返回参数来源链路（可能是失败模型或未完成阶段1）。</p>
                )}
              </div>

              <div className="knowledge-section">
                <p className="label">底层算法 Python 复现（冠军模型核心逻辑）</p>
                <pre className="code-block">{championKnowledge.pythonReferenceCode}</pre>
              </div>

              <div className="knowledge-section">
                <p className="label">冠军模型手算示例（代入具体数字）</p>
                <ol className="guide-list">
                  {championKnowledge.manualCalculationSteps.map((workflowItem, index) => (
                    <li key={`champion-manual-calc-${index}`}>
                      <MarkdownMath content={workflowItem} className="markdown-content" />
                    </li>
                  ))}
                </ol>
              </div>

              <div className="knowledge-section">
                <p className="label">指标复算 Python（可验证冠军分数）</p>
                <pre className="code-block">{championMetricAuditPythonExample}</pre>
              </div>

              <div className="knowledge-section">
                <p className="label">Excel 复现路径（冠军模型 + 当前指标）</p>
                <p className="muted">
                  先按冠军模型步骤计算预测值，再用下方当前指标的 Excel 公式做人手复核。
                </p>
                <ol className="guide-list">
                  {championKnowledge.excelWorkflow.map((workflowItem, index) => (
                    <li key={`champion-excel-model-${index}`}>
                      <MarkdownMath content={workflowItem} className="markdown-content" />
                    </li>
                  ))}
                </ol>
                <p className="label">当前指标（{metric.toUpperCase()}）Excel 复核步骤</p>
                <ol className="guide-list">
                  {activeMetricExcelWorkflow.map((workflowItem, index) => (
                    <li key={`champion-excel-metric-${index}`}>
                      <MarkdownMath content={workflowItem} className="markdown-content" />
                    </li>
                  ))}
                </ol>
              </div>

              <div className="knowledge-section">
                <p className="label">阶段1回测样例（用于选优，含真实值）</p>
                {championBacktestPreview.length > 0 ? (
                  <div className="table-wrap compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>序列</th>
                          <th>预测值 y_pred</th>
                          <th>实际值 y</th>
                        </tr>
                      </thead>
                      <tbody>
                        {championBacktestPreview.map((row, index) => (
                          <tr key={`champion-pred-${index}`}>
                            <td>{formatCell(row.ds)}</td>
                            <td>{formatCell(row.unique_id)}</td>
                            <td>{formatCell(row.y_pred)}</td>
                            <td>{formatCell(row.y)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">还没有冠军模型预测样例。先运行一次任务，这里会自动出现数据。</p>
                )}
              </div>

              <div className="knowledge-section">
                <p className="label">阶段2未来预测样例（真正未来值，无真实 y）</p>
                {futurePredictionPreview.length > 0 ? (
                  <div className="table-wrap compact-table">
                    <table>
                      <thead>
                        <tr>
                          <th>未来日期</th>
                          <th>序列</th>
                          <th>预测值 y_pred</th>
                          <th>真实值 y</th>
                        </tr>
                      </thead>
                      <tbody>
                        {futurePredictionPreview.map((row, index) => (
                          <tr key={`future-pred-${index}`}>
                            <td>{formatCell(row.ds)}</td>
                            <td>{formatCell(row.unique_id)}</td>
                            <td>{formatCell(row.y_pred)}</td>
                            <td>（未来未知）</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">尚未生成阶段2未来预测。勾选“两阶段串行”后点击开始即可自动生成。</p>
                )}
                <p className="muted">
                  说明：阶段1是历史回测用于选优；阶段2才是未来预测值（时间范围由上方“未来预测窗口”明确给出）。
                </p>
              </div>

              <div className="knowledge-section">
                <p className="label">业务动作建议（由指标和预测自动推导）</p>
                <ul className="knowledge-list">
                  {championBusinessActions.map((item, index) => (
                    <li key={`champion-business-action-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="muted">暂无冠军模型。先运行任务后，这里会自动显示最优模型参数与操作步骤。</p>
          )}
        </section>

        <section className="card full-width">
          <h3>8) 模型排行榜</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>模型</th>
                  <th>模型分类</th>
                  <th>{metric.toUpperCase()}</th>
                  <th>训练耗时(秒)</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {rankedResults.map((row, index) => (
                  <tr key={row.model_name}>
                    <td>{index + 1}</td>
                    <td>{row.model_name}</td>
                    <td>{FAMILY_LABELS[row.family] ?? row.family}</td>
                    <td>{row.metrics[metric]?.toFixed(4)}</td>
                    <td>{row.training_seconds.toFixed(2)}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
                {rankedResults.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      暂无已完成结果。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <FigurePanel title="9) 阶段1模型评分对比图" figure={selectionLeaderboardFigure} />
        <FigurePanel title="10) 阶段1冠军回测（实际 vs 预测）" figure={selectionChampionFigure} />
        <FigurePanel title="11) 阶段2冠军未来预测图（未来窗口）" figure={futureChampionFigure} />
        <FigurePanel title="12) 阶段1冠军残差分布" figure={residualFigure} />
        <FigurePanel title="13) 阶段1实际值 vs 预测值散点图" figure={scatterFigure} />
        <FigurePanel title="14) 阶段1各模型训练耗时对比" figure={runtimeFigure} />
        <section className="card full-width">
          <h3>15) 阶段1模型指标热力图</h3>
          {metricHeatmapFigure?.data && metricHeatmapFigure.data.length > 0 ? (
            <div className="plot-wrap">
              <PlotCanvas
                figure={metricHeatmapFigure}
                layoutOverrides={{
                  autosize: true,
                  paper_bgcolor: "#fff9ef",
                  plot_bgcolor: "#fff9ef",
                  font: { family: "Space Grotesk, sans-serif", color: "#1f2937" },
                  margin: { l: 120, r: 20, t: 60, b: 60 },
                }}
              />
            </div>
          ) : (
            <p className="muted">暂无可视化结果，先运行一次预测任务。</p>
          )}
        </section>
      </main>

      <footer>
        <p>
          已支持：自动对比、自动调参、可视化与中文字段解释。{loading ? " 系统处理中..." : ""}
        </p>
      </footer>
    </div>
  );
}
