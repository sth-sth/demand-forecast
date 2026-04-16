# 平台架构说明

## 1. 总体架构

平台采用三层架构：

- 前端：React + Vite
- 后端：FastAPI + Forecast Engine
- 数据层：PostgreSQL + 文件存储（CSV 上传文件）

部署方式采用 Docker Compose，一键启动：

- `db`: PostgreSQL
- `backend`: API + 训练执行器
- `frontend`: Nginx 托管 UI，反向代理 `/api` 到后端

## 2. 后端模块

- `app/api/routes.py`
  - 数据上传、模型目录、运行任务创建、结果查询、可视化查询
- `app/workers/job_runner.py`
  - 后台执行运行任务，写入结果与图表
- `app/services/model_registry.py`
  - 全模型注册中心
- `app/services/forecasting.py`
  - 核心训练与预测引擎
- `app/services/tuning.py`
  - Optuna 调参逻辑
- `app/services/metrics.py`
  - 统一评估指标
- `app/services/visualization.py`
  - Plotly 图表 JSON 生成

## 3. 数据库设计

- `Dataset`
  - 保存上传文件路径、列映射、频率等元信息
- `ForecastRun`
  - 保存任务状态、配置、冠军模型、总结信息和图表
- `ModelResult`
  - 保存每个模型的指标、参数、预测序列和诊断信息

## 4. 关键 API

- `GET /api/health`
- `GET /api/models`
- `POST /api/datasets/upload`
- `GET /api/datasets`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/results`
- `GET /api/runs/{run_id}/visualizations`

## 5. 任务执行链路

1. 用户上传 CSV，创建数据集。
2. 用户选择参数并发起 run。
3. 后端创建 `ForecastRun`（pending），并在后台执行。
4. 引擎自动遍历模型、调参、预测、评估、排序。
5. 写入 `ModelResult`，并更新 `ForecastRun.summary_json`。
6. 前端轮询 run 状态，完成后拉取结果和图表。

## 6. 上线建议

- 将 `backend` 横向扩展为多 worker（异步队列）
- 将上传文件落地到对象存储（S3/OSS）
- 增加 RBAC 权限、审计日志、模型版本审批
- 增加模型漂移监控与告警
- 对深度模型启用 GPU 节点
