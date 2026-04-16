# Demand Forecast Platform

企业级需求预测平台，覆盖统计模型、机器学习模型、深度学习模型、间歇需求模型与有货概率模型，支持自动模型对比、自动调参、可视化输出与数据库存档。

## 1. 功能清单

- 全模型自动遍历对比（默认）
- 自动超参数优化（Optuna）
- 多指标统一评估：MAE、RMSE、MAPE、sMAPE、WAPE、MASE
- 模型排行榜与冠军模型图表输出
- 前端上传数据、配置任务、查看结果
- 后端任务执行、结果落库、可视化 JSON 输出

## 2. 技术栈

- Frontend: React + Vite + Plotly
- Backend: FastAPI + SQLModel + Pandas
- Forecast Engine: StatsForecast / StatsModels / Scikit-learn / Optuna / NeuralForecast(可选)
- Database: PostgreSQL
- Deploy: Docker Compose + Nginx

## 3. 目录结构

```text
.
├── backend
│   ├── app
│   │   ├── api
│   │   ├── core
│   │   ├── db
│   │   ├── services
│   │   └── workers
│   ├── data/uploads
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend
│   ├── src
│   ├── Dockerfile
│   └── nginx.conf
├── docs
│   ├── model-parameter-guide.md
│   └── platform-architecture.md
├── docker-compose.yml
└── .env.example
```

## 4. 快速启动（推荐）

新增一键演示脚本，适合现场展示：

```bash
chmod +x scripts/demo.sh
./scripts/demo.sh up
```

脚本会自动完成：

- 首次启动时自动生成 `.env`
- 后台构建并启动 Docker Compose
- 轮询 `GET /api/health`，确认服务可用
- 尝试自动打开前端页面（不可用时会输出可访问地址）

常用命令：

```bash
./scripts/demo.sh status
./scripts/demo.sh logs
./scripts/demo.sh open
./scripts/demo.sh down
```

默认访问地址：

- 前端: http://localhost:8080
- 后端 OpenAPI: http://localhost:8000/docs

可选：临时公网展示（快速“上线”给他人访问）

在本地启动成功后，直接使用仓库内脚本（无需安装 ngrok）：

```bash
./scripts/share.sh start
```

脚本会优先使用本机 `cloudflared`，若未安装则自动使用 Docker 版 `cloudflared`。
默认使用 `http2` 协议，避免 QUIC 的 UDP 缓冲区告警。

如果你需要 QUIC：

```bash
TUNNEL_PROTOCOL=quic ./scripts/share.sh start
```

若出现告警：

```text
failed to sufficiently increase receive buffer size
```

可在 Linux 上执行：

```bash
sudo sysctl -w net.core.rmem_max=7500000
sudo sysctl -w net.core.wmem_max=7500000
```

执行后会得到一个公网 URL，可直接发给他人演示。

可选：长期固定公网地址（DuckDNS + HTTPS）

```bash
cp .env.prod.example .env.prod
cp .env.duckdns.example .env.duckdns
# 编辑 .env.prod: DOMAIN=<你的子域名>.duckdns.org, ACME_EMAIL=<你的邮箱>
# 编辑 .env.duckdns: DUCKDNS_DOMAIN=<你的子域名>, DUCKDNS_TOKEN=<你的 DuckDNS token>
chmod +x scripts/longterm.sh
./scripts/longterm.sh up
```

长期运维命令：

```bash
./scripts/longterm.sh status
./scripts/longterm.sh logs
./scripts/longterm.sh health
./scripts/longterm.sh restart
./scripts/longterm.sh down
```

如需手动启动（不使用脚本）：

```bash
cp .env.example .env
docker compose up --build
```

## 5. 一键 Demo（可直接跑）

平台内置中文 Demo 数据，前端提供两种快速体验方式：

- `加载 Demo 数据`: 仅加载演示数据并展示数据内容、字段说明
- `一键跑 Demo`: 自动加载 Demo 并发起预测任务（快速模型组合）

前端“开始预测”按钮支持严格两阶段串行：

- 勾选 `启用两阶段串行`：阶段1先做模型选优（回测），阶段2自动做未来预测（无真实 y）
- 不勾选：仅执行阶段1选优，不进入阶段2

阶段含义：

- 阶段1（selection）：用于比较模型和选冠军，结果里有 `y` 和 `y_pred`
- 阶段2（future_forecast）：用于真正未来窗口预测，结果里 `y=null`，只看 `y_pred`

接口请求可通过 `run_mode` 指定：

```json
{
	"dataset_id": 1,
	"horizon": 14,
	"metric": "smape",
	"run_mode": "selection",
	"selection_run_id": null,
	"use_all_models": true,
	"candidate_models": null,
	"tune_trials": 15,
	"model_overrides": {},
	"global_params": {}
}
```

Demo 数据文件位置：`backend/data/demo/demand_demo_cn.csv`

Demo 字段（中文）示例：

- `日期`: 时间列（time_col）
- `销量`: 目标列（target_col）
- `商品编码`: 序列列（item_col）
- `是否促销` / `是否缺货` / `价格` / `温度` / `节假日标签`: 业务解释字段

前端会自动展示 Demo 数据前几行，并给出每个字段的中文解释。

## 6. 后端本地运行

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
# 如需 Prophet / XGBoost / LightGBM / CatBoost / NeuralForecast / Torch，再执行：
# pip install -e ".[advanced]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 7. 前端本地运行

```bash
cd frontend
npm install
npm run dev
```

默认通过 `VITE_API_BASE_URL=/api` 调用后端。

## 8. 数据格式要求

CSV 至少包含：

- 时间列：默认 `ds`
- 目标列：默认 `y`
- 序列 ID 列：可选（例如 `sku_id`）

如果列名不同，可在上传界面映射。

## 9. 模型覆盖

平台模型注册中心当前覆盖：

- 基线：Naive、SeasonalNaive、Drift、MovingAverage
- 统计：AutoARIMA、AutoETS、AutoTheta、MSTL、TBATS、Prophet、SARIMAX、DynamicRegression
- 间歇：CrostonClassic、CrostonSBA、TSB、ADIDA、IMAPA
- 机器学习：LinearRegression、Ridge、Lasso、ElasticNet、RandomForest、XGBoost、LightGBM、CatBoost
- 深度学习：LSTM、NBEATS、NHITS、TFT、PatchTST、Informer、DeepAR、TimesNet
- 业务模型：InStockClassifier（有货概率）
- 集成：EnsembleMean、EnsembleWeighted

> 说明：深度学习和部分增强模型依赖 advanced 依赖包，未安装时系统会自动标记该模型失败并继续运行其他模型。

## 10. 核心接口

- `GET /api/models`
- `POST /api/datasets/upload`
- `POST /api/datasets/demo`
- `GET /api/datasets/{dataset_id}/preview`
- `POST /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/results`
- `GET /api/runs/{run_id}/visualizations`

## 11. 指引文档

- 模型参数与底层逻辑：`docs/model-parameter-guide.md`
- 架构与上线建议：`docs/platform-architecture.md`
- Demo 中文使用说明：`docs/demo-quickstart-zh.md`
- 生产部署（HTTPS + systemd）：`docs/production-deploy-zh.md`

## 12. 正式上线（HTTPS）

首次执行：

```bash
cp .env.example .env
cp .env.prod.example .env.prod
# 方案A（自有域名）: 编辑 .env.prod，填写 DOMAIN 和 ACME_EMAIL
chmod +x scripts/prod.sh
./scripts/prod.sh up
```

如果使用 DuckDNS（免费动态域名，长期在线推荐）：

```bash
cp .env.duckdns.example .env.duckdns
# .env.prod: DOMAIN=<子域名>.duckdns.org, ACME_EMAIL=<你的邮箱>
# .env.duckdns: DUCKDNS_DOMAIN=<子域名>, DUCKDNS_TOKEN=<token>
chmod +x scripts/longterm.sh
./scripts/longterm.sh up
```

运维命令：

```bash
./scripts/prod.sh status
./scripts/prod.sh logs
./scripts/prod.sh restart
./scripts/prod.sh down

# DuckDNS 长期模式
./scripts/longterm.sh status
./scripts/longterm.sh logs
./scripts/longterm.sh health
./scripts/longterm.sh restart
./scripts/longterm.sh down
```

详细说明见：`docs/production-deploy-zh.md`

## Vercel 部署说明（仅前端）

如果你在 Vercel 打开项目后看到：

```text
404: NOT_FOUND
Code: NOT_FOUND
```

通常是以下两类原因：

- Vercel 没有构建到前端产物（项目根目录/输出目录配置不对）。
- 前端已上线，但接口仍走默认 `/api`，而 Vercel 上没有同域后端，导致接口 404。

本仓库已提供根目录 `vercel.json`，会让 Vercel 从 `frontend` 构建并输出 `frontend/dist`。

部署建议：

1. 导入仓库到 Vercel 后直接部署（使用仓库根目录即可）。
2. 在 Vercel 项目环境变量中设置 `VITE_API_BASE_URL`，例如：`https://your-backend-domain/api`。
3. 重新部署。

说明：当前后端依赖数据库与任务执行链路（FastAPI + Worker + PostgreSQL），建议部署在 Render/Railway/Fly.io/云主机等环境，再由 Vercel 前端调用该后端地址。

### 长期稳定最简流程

如果你希望避免临时隧道失效，建议使用“稳定后端域名 + Vercel 前端”模式：

最快方式（推荐，交互式输入 3 个参数）：

```bash
./scripts/stable_bootstrap.sh
```

脚本会自动完成：

- 生成并写入 `.env.prod` / `.env.duckdns`
- 启动 DuckDNS 长期模式（HTTPS + 健康检查）
- 若检测到已登录 Vercel，自动同步 `VITE_API_BASE_URL` 并触发生产重部署

1. 在云主机部署后端（可直接使用 DuckDNS 长期脚本）：

```bash
cp .env.example .env
cp .env.prod.example .env.prod
cp .env.duckdns.example .env.duckdns
# 编辑 .env.prod 和 .env.duckdns 后执行
./scripts/longterm.sh up
```

2. 一键把前端 API 地址绑定到 Vercel 生产环境并触发重部署：

```bash
BACKEND_API_BASE=https://你的后端域名/api ./scripts/vercel_sync_api.sh
```

3. 后续如果后端域名变更，只需重复第 2 步，无需手动点 Vercel 控制台。

## 13. 生产化建议

- 将后台任务从 FastAPI BackgroundTasks 升级为消息队列（Celery/RQ/Kafka）
- 增加对象存储、权限体系、模型审批流、审计日志
- 增加漂移监控、自动重训、告警联动

## 14. 业务可复现使用说明（重点）

如果你的目标是向业务团队解释“为什么这个预测可靠”，建议按下面方式展示：

1. 先展示选优指标公式（Markdown 数学公式渲染）：MAE / RMSE / MAPE / sMAPE / WAPE / MASE。
2. 再展示公式参数含义：如 `y`、`\hat{y}`、`season_length`、`horizon`、`eps`。
3. 展示冠军模型相对第二名与基线模型的改进幅度（百分比）。
4. 最后给出可复现链路：函数包 + 更新公式 + 数学推导步骤 + 底层 Python 计算逻辑 + Excel 验算步骤。

平台内位置：

- 前端知识中心：每个模型均提供“函数包 + 更新公式 + 参数释义 + 数学推导 + 底层 Python + Excel 复现 + 可复现检查清单”
- 冠军模型面板：提供“入选依据 + 参数来源链路 + 指标复算 Python + 模型底层 Python + Excel 复核”

可直接参考：

- 详细公式与参数说明：`docs/model-parameter-guide.md`
- 无闭式公式模型的可运行 Python 示例：`docs/model-parameter-guide.md` 第 10 节