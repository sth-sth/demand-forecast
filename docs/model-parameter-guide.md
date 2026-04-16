# 需求预测平台模型参数与底层逻辑指引

## 1. 数据契约

平台默认读取 CSV，至少包含以下字段：

- `ds`: 时间戳字段（日期或时间）
- `y`: 需求量字段
- `unique_id`（可选）: SKU/门店/区域等序列 ID

上传时可在前端映射为任意列名，后端会统一重命名为 `ds/y/unique_id`。

## 2. 自动建模总流程

1. 数据清洗与标准化：时间解析、数值转化、空值删除。
2. 时间切分：每个序列按 `horizon` 保留最后 H 个点做测试集。
3. 自动训练：默认遍历模型注册中心中的全部可用模型。
4. 自动调参：对 ML 类模型使用 Optuna（TPE）做时间序列交叉验证。
5. 统一评估：输出 MAE/RMSE/MAPE/sMAPE/WAPE/MASE。
6. 冠军选择：按配置指标最小值选择 champion model。
7. 可视化输出：模型排行榜 + 冠军模型实际值对比图。

## 3. 模型家族与参数设计

### 3.1 基线模型

- Naive: 使用最后一期数值。
- SeasonalNaive: 关键参数 `season_length`，默认 7。
- Drift: 线性漂移，默认无可调参数。
- MovingAverage: 关键参数 `window`，默认 7。

作用：作为业务基准线，任何复杂模型必须显著优于基线才建议上线。

### 3.2 统计模型

- AutoARIMA（StatsForecast）
  - 默认参数: `season_length=7`
  - 可调参数: `season_length in {1, 7, 12, 24}`
- AutoETS（StatsForecast）
  - 默认参数: `season_length=7`
- AutoTheta（StatsForecast）
  - 默认参数: `season_length=7`
- MSTL（StatsForecast）
  - 默认参数: `season_length=[7,30]`
  - 可调参数: `{[7], [7,30], [7,365]}`
- TBATS（StatsForecast）
  - 默认参数: `season_length=7`
- Prophet
  - 默认参数: `weekly_seasonality=True, yearly_seasonality=True`
  - 可调参数: `changepoint_prior_scale in {0.01,0.05,0.1,0.5}`
- SARIMAX（statsmodels）
  - 默认参数: `order=(1,1,1), seasonal_order=(1,1,1,7)`
- DynamicRegression（statsmodels）
  - 默认参数: `order=(1,0,1)`

AutoETS（霍尔特-温特）建议作为“可解释标杆”展示，至少包含以下两类信息：

- 函数包（可直接调用）
  - `statsforecast.models.AutoETS`
  - `statsmodels.tsa.holtwinters.ExponentialSmoothing`
- 更新公式（必须给出）

1) 加法季节 ETS(A,A,A)

$$
\ell_t=\alpha(y_t-s_{t-m})+(1-\alpha)(\ell_{t-1}+b_{t-1})
$$

$$
b_t=\beta(\ell_t-\ell_{t-1})+(1-\beta)b_{t-1}
$$

$$
s_t=\gamma(y_t-\ell_t)+(1-\gamma)s_{t-m}\quad\text{(additive seasonality)}
$$

$$
\hat{y}_{t+h}=\ell_t+h\cdot b_t+s_{t+h-m(k+1)}\quad\text{(additive)}
$$

2) 乘法季节 ETS(A,A,M)

$$
\ell_t=\alpha\left(\frac{y_t}{s_{t-m}}\right)+(1-\alpha)(\ell_{t-1}+b_{t-1})
$$

$$
b_t=\beta(\ell_t-\ell_{t-1})+(1-\beta)b_{t-1}
$$

$$
s_t=\gamma\left(\frac{y_t}{\ell_t}\right)+(1-\gamma)s_{t-m}\quad\text{(multiplicative seasonality)}
$$

$$
\hat{y}_{t+h}=(\ell_t+h\cdot b_t)\cdot s_{t+h-m(k+1)}\quad\text{(multiplicative)}
$$

3) 阻尼趋势（可选，避免远期过冲）

$$
\hat{y}^{add}_{t+h}=\ell_t+b_t\sum_{j=1}^{h}\phi^j+s_{t+h-m(k+1)}
$$

$$
\hat{y}^{mul}_{t+h}=\left(\ell_t+b_t\sum_{j=1}^{h}\phi^j\right)\cdot s_{t+h-m(k+1)}
$$

说明：除 AutoETS 外，其他模型也建议按同样标准展示：`函数包 + 更新公式 + 参数含义 + 手算示例 + Python 复现 + Excel 验算`。

### 3.3 间歇需求模型

- CrostonClassic
- CrostonSBA
- TSB
- ADIDA
- IMAPA

适用场景：长尾 SKU、零值占比高、需求突发的补货业务。

### 3.4 机器学习模型（滞后特征）

公共特征：

- Lags: `1,2,3,7,14,28`
- Rolling: `mean/std(7,14,28)`
- Calendar: `month/dayofweek/weekofyear/is_month_start/is_month_end`

模型参数：

- LinearRegression: 无核心超参
- Ridge: `alpha`
- Lasso: `alpha`
- ElasticNet: `alpha, l1_ratio`
- RandomForest: `n_estimators, max_depth, min_samples_leaf`
- XGBoost: `n_estimators, learning_rate, max_depth, subsample, colsample_bytree`
- LightGBM: `n_estimators, learning_rate, num_leaves, feature_fraction, bagging_fraction`
- CatBoost: `depth, learning_rate, iterations`

### 3.5 深度学习时序模型

基于 NeuralForecast（可选安装 advanced 依赖）：

- LSTM
- NBEATS
- NHITS
- TFT
- PatchTST
- Informer
- DeepAR
- TimesNet

统一默认训练参数：

- `h = horizon`
- `input_size = max(2*horizon, 24)`
- `max_steps = 300`

## 4. 自动调参与优化策略

平台调参策略（当前版本）：

- 优化器: Optuna TPE
- 目标函数: 时间序列交叉验证平均 sMAPE
- 默认 trial 数: `tune_trials=15`（可配置 0-50）
- 可调模型: ML 家族（含树模型和线性正则模型）
- 统计模型中的 Auto 系列由模型内部自动识别参数

建议：

- 小数据集（<500 行/序列）: `tune_trials=10-20`
- 中大数据集（>=500 行/序列）: `tune_trials=20-50`

## 5. 有货模型（InStockClassifier）底层逻辑

### 5.1 模型定义

`InStockClassifier` 是一个“有货概率”模型：

- 目标变量：`is_in_stock = 1(y>0), 0(y=0)`
- 训练器：RandomForestClassifier
- 输出：未来每期有货概率 `P(in_stock)`

### 5.2 概率到需求的映射

平台使用期望需求映射：

`ExpectedDemand = P(in_stock) * AvgNonZeroDemand`

其中 `AvgNonZeroDemand` 来自历史正需求样本均值。

### 5.3 业务含义

- 高 `P(in_stock)` 低 `ExpectedDemand`: 建议低库存保障。
- 高 `P(in_stock)` 高 `ExpectedDemand`: 建议提高补货阈值。
- 低 `P(in_stock)` 但高波动: 建议结合安全库存策略，避免误判断供。

## 6. 集成与扩展机制

模型通过注册中心管理，新增模型仅需两步：

1. 在 `model_registry.py` 增加 `ModelSpec`
2. 在 `forecasting.py` 实现对应 backend 的预测函数

这样可支持企业后续新增私有模型或行业特化模型。

## 7. 指标解释与选型建议

- MAE: 绝对误差，易解释
- RMSE: 对大误差更敏感
- MAPE/sMAPE: 便于跨品类比较
- WAPE: 适合总量型业务考核
- MASE: 可对比不同序列尺度

选型建议：

- 若业务追求稳定补货：优先看 WAPE、MAE
- 若业务追求大误差控制：优先看 RMSE
- 若多品类统一看板：优先看 sMAPE

## 8. 评估指标公式与参数释义（与系统实现一致）

以下公式与后端评估函数保持一致，业务复核时可直接使用：

$$
MAE = \frac{1}{n}\sum_{i=1}^{n}\left|y_i-\hat{y}_i\right|
$$

$$
RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i-\hat{y}_i)^2}
$$

$$
MAPE = \frac{100}{n}\sum_{i=1}^{n}\left|\frac{y_i-\hat{y}_i}{\max(|y_i|,\epsilon)}\right|
$$

$$
sMAPE = \frac{100}{n}\sum_{i=1}^{n}\frac{|y_i-\hat{y}_i|}{\max\left((|y_i|+|\hat{y}_i|)/2,\epsilon\right)}
$$

$$
WAPE = 100\cdot\frac{\sum_i|y_i-\hat{y}_i|}{\max(\sum_i|y_i|,\epsilon)}
$$

$$
MASE = \frac{\operatorname{mean}(|y_i-\hat{y}_i|)}{\max\left(\operatorname{mean}(|y_t-y_{t-m}|),\epsilon\right)}
$$

符号解释：

- `y_i`: 第 `i` 个样本真实需求
- `\hat{y}_i`: 第 `i` 个样本预测需求
- `n`: 评估样本数
- `m`: 季节周期（如日频常取 `7`）
- `\epsilon`: 防止除零的极小值（平台默认为 `1e-8`）

## 9. 参数在业务里如何展示与解释

建议在业务评审会上按“符号 -> 业务含义 -> 取值依据 -> 影响方向”展示：

- `season_length`
  - 业务含义：季节周期长度
  - 取值依据：日频一般 7，月频一般 12
  - 影响方向：过小会欠拟合周期，过大可能引入噪声
- `horizon`
  - 业务含义：向未来预测多少期
  - 取值依据：补货周期、采购提前期、生产周期
  - 影响方向：越大不确定性越高
- `alpha` / `learning_rate`
  - 业务含义：学习步长/正则强度
  - 取值依据：通过验证集调参
  - 影响方向：过大容易震荡，过小收敛慢
- `n_estimators`
  - 业务含义：树模型基学习器数量
  - 取值依据：在耗时预算内逐步增加并观察收益
  - 影响方向：通常提高稳定性，但训练更慢

## 10. 无闭式公式模型的 Python 可复现步骤

对于树模型、深度学习等“难以手算”的模型，建议用下面流程复现，而不是“凭经验拍脑袋”：

1. 固定随机种子（`random_state=42`）
2. 固定切分方式（最后 `horizon` 做验证）
3. 固定特征构造方式（lag/rolling/calendar）
4. 固定评估公式（使用上文 6 个指标）
5. 保存参数、指标和预测结果（可追溯）

示例脚本（可直接运行）：

```python
"""
python reproducible_ml_workflow.py \
  --csv demand.csv \
  --horizon 14 \
  --seasonality 7
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

EPS = 1e-8


def build_features(df: pd.DataFrame) -> pd.DataFrame:
  out = df.copy()
  out = out.sort_values(["unique_id", "ds"])
  for lag in [1, 7, 14]:
    out[f"lag_{lag}"] = out.groupby("unique_id")["y"].shift(lag)
  out["rolling_mean_7"] = (
    out.groupby("unique_id")["y"].shift(1).rolling(7).mean().reset_index(level=0, drop=True)
  )
  out["dayofweek"] = out["ds"].dt.dayofweek
  out["month"] = out["ds"].dt.month
  return out.dropna().reset_index(drop=True)


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
  return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
  return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
  denom = np.maximum(np.abs(y_true), EPS)
  return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100)


def smape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
  denom = np.maximum((np.abs(y_true) + np.abs(y_pred)) / 2.0, EPS)
  return float(np.mean(np.abs(y_true - y_pred) / denom) * 100)


def wape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
  denom = np.maximum(np.sum(np.abs(y_true)), EPS)
  return float(np.sum(np.abs(y_true - y_pred)) / denom * 100)


def mase(y_true: np.ndarray, y_pred: np.ndarray, seasonality: int) -> float:
  if len(y_true) <= seasonality:
    scale = np.mean(np.abs(np.diff(y_true)))
  else:
    scale = np.mean(np.abs(y_true[seasonality:] - y_true[:-seasonality]))
  scale = max(scale, EPS)
  return float(np.mean(np.abs(y_true - y_pred)) / scale)


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--csv", required=True, help="输入 CSV，至少包含 ds/y，可选 unique_id")
  parser.add_argument("--horizon", type=int, default=14)
  parser.add_argument("--seasonality", type=int, default=7)
  args = parser.parse_args()

  df = pd.read_csv(args.csv)
  if "unique_id" not in df.columns:
    df["unique_id"] = "series_1"

  df["ds"] = pd.to_datetime(df["ds"])
  df["y"] = pd.to_numeric(df["y"], errors="coerce")
  df = df.dropna(subset=["ds", "y"]).sort_values(["unique_id", "ds"]).reset_index(drop=True)

  feat = build_features(df)
  feature_cols = ["lag_1", "lag_7", "lag_14", "rolling_mean_7", "dayofweek", "month"]

  train = feat.iloc[:-args.horizon].copy()
  test = feat.iloc[-args.horizon:].copy()

  model = RandomForestRegressor(
    n_estimators=300,
    max_depth=10,
    min_samples_leaf=2,
    random_state=42,
    n_jobs=-1,
  )
  model.fit(train[feature_cols], train["y"])
  test["y_pred"] = model.predict(test[feature_cols])

  y_true = test["y"].to_numpy(dtype=float)
  y_pred = test["y_pred"].to_numpy(dtype=float)
  scores = {
    "mae": mae(y_true, y_pred),
    "rmse": rmse(y_true, y_pred),
    "mape": mape(y_true, y_pred),
    "smape": smape(y_true, y_pred),
    "wape": wape(y_true, y_pred),
    "mase": mase(y_true, y_pred, args.seasonality),
  }

  print("metrics =", {k: round(v, 4) for k, v in scores.items()})

  output = Path("backtest_predictions.csv")
  test[["unique_id", "ds", "y", "y_pred"]].to_csv(output, index=False)
  print(f"saved: {output.resolve()}")


if __name__ == "__main__":
  main()
```

这份脚本满足三个关键点：

- 指标计算可审计（公式公开且固定）
- 参数和随机种子固定（可重复）
- 输出预测明细（可追溯）
