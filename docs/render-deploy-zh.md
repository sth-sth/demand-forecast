# Render 部署后端（无 Linux 服务器）

适用场景：你没有自己的 Linux 服务器，但希望长期稳定运行后端 API + 数据库。

推荐架构：

- 前端：Vercel
- 后端：Render Web Service（Docker）
- 数据库：Render PostgreSQL

## 1. 一次性部署后端（Blueprint）

1. 打开 Render 控制台。
2. 选择 New + Blueprint。
3. 连接你的 GitHub 仓库并选择本项目。
4. Render 会读取仓库根目录的 `render.yaml`，自动创建：
   - `demand-forecast-backend`（Web Service）
   - `demand-forecast-db`（PostgreSQL）

等待部署完成后，记下后端域名，例如：

- `https://your-backend.onrender.com`

### 1.1 Blueprint 不可用时（手动免费方案）

如果你的账号里 Blueprint 不可用或提示付费，可以手动创建一个 Web Service（免费实例）：

1. Render -> New Web Service。
2. 连接本仓库并选择 `main`。
3. Environment 选 `Docker`。
4. Dockerfile Path 使用默认值 `Dockerfile`（仓库根目录已提供）。
5. Health Check Path 填 `/api/health`。
6. 创建后进入 Environment，配置变量（见第 2 节和第 2.1 节）。

说明：Render 的托管 Postgres 在部分套餐可能收费，你可直接用 Neon 免费 PostgreSQL。

## 2. 设置后端 CORS

在 Render 后端服务的 Environment 中设置：

- `CORS_ORIGINS=https://你的vercel生产域名`

如果你有多个前端域名，可用逗号分隔：

- `CORS_ORIGINS=https://a.vercel.app,https://b.vercel.app`

保存后点击 Redeploy。

## 2.1 数据库（免费推荐 Neon）

1. 注册 Neon 并创建一个 Postgres 数据库。
2. 复制连接串（Connection string）。
3. 在 Render 后端 Environment 新增：
   - `DATABASE_URL=<你的 Neon 连接串>`

可选变量：

- `UPLOAD_DIR=/app/data/uploads`
- `ENVIRONMENT=production`

提示：本项目已兼容 `postgres://` 与 `postgresql://` 两种格式，无需手动改前缀。

## 3. 让前端指向 Render 后端

在仓库根目录执行：

```bash
BACKEND_API_BASE=https://your-backend.onrender.com/api ./scripts/vercel_sync_api.sh
```

该脚本会自动：

- 更新 Vercel 生产环境变量 `VITE_API_BASE_URL`
- 触发一次生产重部署

## 4. 验证

先检查后端：

- `https://your-backend.onrender.com/api/health`

再打开前端：

- `https://你的vercel域名`

然后测试：

- 加载 Demo 数据
- 一键跑 Demo

## 5. 常见问题

1. 前端提示 404 或接口失败
   - 检查 `VITE_API_BASE_URL` 是否指向 Render 后端 `/api`。
2. 浏览器报 CORS 错误
   - 检查 Render 的 `CORS_ORIGINS` 是否包含当前 Vercel 域名。
3. 后端无法连数据库
   - 确认 Render Blueprint 创建了 `demand-forecast-db`，并且 `DATABASE_URL` 来自 `fromDatabase.connectionString`。
