# 生产部署指南（HTTPS + 开机自启）

## 1. 目标

本指南用于将需求预测平台部署到云服务器并通过域名 HTTPS 访问，包含：

- 生产版 Docker Compose 部署
- 自动申请 TLS 证书（Caddy + Let's Encrypt）
- 开机自启（systemd）
- 日常运维命令（状态、日志、重启、停止）

## 2. 前置条件

1. 一台 Linux 服务器（建议 Ubuntu 22.04/24.04）
2. 已安装 Docker 与 Docker Compose
3. 已有域名，例如 `forecast.example.com`
4. DNS A 记录已指向服务器公网 IP
5. 云安全组与系统防火墙放行 80/443 端口

## 3. 关键文件

- 生产编排：`docker-compose.prod.yml`
- DuckDNS 覆盖编排：`docker-compose.duckdns.yml`
- HTTPS 反向代理配置：`deploy/Caddyfile`
- 生产脚本：`scripts/prod.sh`
- DuckDNS 长期部署脚本：`scripts/longterm.sh`
- 临时公网分享脚本：`scripts/share.sh`
- systemd 模板：`deploy/systemd/demand-forecast.service`
- 生产环境变量模板：`.env.prod.example`
- DuckDNS 环境变量模板：`.env.duckdns.example`

## 4. 首次部署步骤

在服务器执行：

```bash
git clone <your-repo-url> demand-forecast
cd demand-forecast

cp .env.example .env
cp .env.prod.example .env.prod
```

编辑 `.env.prod`，至少修改：

```bash
DOMAIN=forecast.example.com
ACME_EMAIL=your-email@example.com
```

启动生产服务：

```bash
chmod +x scripts/prod.sh scripts/share.sh
./scripts/prod.sh up
```

成功后访问：

- `https://你的域名`
- `https://你的域名/api/docs`

### 4.1 使用 DuckDNS 免费动态域名（长期在线）

准备 DuckDNS 参数：

```bash
cp .env.duckdns.example .env.duckdns
```

编辑 `.env.prod`：

```bash
DOMAIN=<你的子域名>.duckdns.org
ACME_EMAIL=<你的邮箱>
```

编辑 `.env.duckdns`：

```bash
DUCKDNS_DOMAIN=<你的子域名>
DUCKDNS_TOKEN=<你的DuckDNS token>
DUCKDNS_INTERVAL=300
```

启动长期模式：

```bash
chmod +x scripts/longterm.sh
./scripts/longterm.sh up
```

脚本会自动完成：

- 先执行一次 DuckDNS 记录同步
- 启动生产容器（含 DuckDNS 自动更新服务）
- 轮询平台健康接口
- 校验 DuckDNS 更新任务是否健康

## 5. 日常运维命令

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

## 6. 开机自启（systemd）

将服务模板复制到系统目录：

```bash
sudo cp deploy/systemd/demand-forecast.service /etc/systemd/system/
```

如果你的项目目录不是 `/opt/demand-forecast`，请先修改服务文件中的路径：

- `WorkingDirectory`
- `ExecStart`
- `ExecStop`

加载并启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable demand-forecast.service
sudo systemctl start demand-forecast.service
```

检查状态：

```bash
sudo systemctl status demand-forecast.service
```

## 7. 升级发布

```bash
git pull
./scripts/prod.sh up

# DuckDNS 长期模式
./scripts/longterm.sh up
```

说明：`up` 会重建并滚动更新容器（当前是单机方案，短暂停机属正常）。

## 8. 故障排查

1. 无法签发 HTTPS 证书
   - 确认 DNS 已生效并指向正确公网 IP
   - 确认 80/443 端口未被占用
2. 页面打开但接口异常
   - 查看后端日志：`./scripts/prod.sh logs`
   - 检查 `.env` 数据库参数
3. 域名未解析好但想先演示
   - 使用临时分享：`./scripts/share.sh start`
4. DuckDNS 更新异常
   - 查看 updater 日志：`./scripts/longterm.sh logs`
   - 手动跑健康检查：`./scripts/longterm.sh health`
   - 校验 `.env.duckdns` 的 `DUCKDNS_DOMAIN` 与 `DUCKDNS_TOKEN`
