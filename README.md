# EmoEra Lottery System (k-version)

EmoEra Lottery System（E时代抽奖）是一个基于 Next.js + FastAPI 的多人抽奖系统，适合年会、活动报名、现场互动和小型运营活动。管理员可以创建抽奖房间、生成报名二维码、查看参与者列表并执行抽奖；参与者可以通过链接或二维码进入报名页。

本分支（k-version）在 [miaojilab/emoera-lottery-system](https://github.com/miaojilab/emoera-lottery-system) 基础上完成了通行证接入与完整权限系统改造，对应线上站点：[choujiang.emoera.com](https://choujiang.emoera.com/)。

上游仓库：[github.com/miaojilab/emoera-lottery-system](https://github.com/miaojilab/emoera-lottery-system)

## 功能特性

- 房间制抽奖：每个房间拥有独立参与者、中奖记录和历史数据。
- 二维码报名：自动生成参与链接和二维码，方便现场扫码报名。
- 手动录入：支持管理员单个添加用户，也支持批量生成序号用户。
- 大转盘抽奖：SVG 扇形转盘动画，多中奖者顺序连转，简约蓝白风格。
- 防重复中奖：可选择是否排除已经中奖的参与者。
- 奖品名称：每轮抽奖可指定奖项名称，随中奖记录持久化。
- 实时推送：SSE 长连接，参与者报名毫秒级同步到所有房间页。
- 活动系统：活动作为容器统一管理多轮抽奖房间，支持活动维度聚合统计。
- 抽奖历史：记录房间创建、抽奖轮次、奖项名称和中奖者信息，支持跨页面恢复。
- 权限系统：OIDC 通行证登录，房间/活动仅创建者可管理，抽奖仅创建者可执行。
- 限额控制：每人最多 2 个房间、2 个活动，活动内最多 10 个房间。
- 自动清理：3 天未使用的房间自动删除。
- 移动端适配：报名页针对手机端做了导航和表单体验优化。

## 技术栈

- 前端：[Next.js](https://nextjs.org/) 15（App Router）+ [React](https://react.dev/) 18 + [Ant Design](https://ant.design/) 5 + TypeScript
- 后端：[FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) + [SQLAlchemy](https://www.sqlalchemy.org/) 2.0 + [PyMySQL](https://github.com/PyMySQL/PyMySQL)
- 数据库：[MySQL](https://www.mysql.com/) 8.x
- 认证：[Emoera 通行证](https://accountapi.emoera.com/)（OIDC / RS256 JWT）
- 实时推送：Server-Sent Events（SSE）

## 本地开发

### 环境要求

- Node.js 18.18 或更高版本
- Python 3.10 或更高版本
- MySQL 8.x 或兼容版本

### 安装前端依赖

```bash
npm install
```

### 安装后端依赖

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
pip install -r requirements.txt
```

### 配置环境变量

**前端**（项目根目录）：

```bash
cp .env.example .env.local
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 开发服务端口，默认 3000，本项目设为 `3001` |
| `NEXT_PUBLIC_BAIDU_ANALYTICS_ID` | 否 | 百度统计 ID，不配则不注入统计脚本 |

**后端**（`backend/` 目录）：

```bash
cd backend
cp .env.example .env
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `MYSQL_HOST` | 是 | 数据库主机地址 |
| `MYSQL_PORT` | 否 | 数据库端口，默认 `3306` |
| `MYSQL_USER` | 是 | 数据库用户名 |
| `MYSQL_PASSWORD` | 是 | 数据库密码 |
| `MYSQL_DATABASE` | 是 | 数据库名，如 `lottery` |
| `MYSQL_SSL` | 否 | 是否启用 SSL，默认 `false` |
| `SESSION_SECRET` | 是 | Session 签名密钥，生产环境请使用随机值 |
| `SESSION_MAX_AGE` | 否 | Session 有效期（秒），默认 7 天 |
| `MAX_ROOMS_PER_USER` | 否 | 每人独立房间上限，默认 `2` |
| `MAX_ACTIVITIES_PER_USER` | 否 | 每人活动上限，默认 `2` |
| `MAX_ROOMS_PER_ACTIVITY` | 否 | 每个活动内房间上限，默认 `10` |
| `MAX_NONLOGIN_PARTICIPANTS` | 否 | 未登录用户最多可报名人数，默认 `1` |
| `ROOM_EXPIRE_DAYS` | 否 | 房间闲置自动删除天数，默认 `3` |
| `PASSPORT_ENABLED` | 否 | 是否启用通行证登录，默认 `true`。本地开发可设为 `false` 启用本地自动登录 |
| `OIDC_ISSUER` | 启用时必填 | 通行证签发方地址，默认 `https://accountapi.emoera.com/api` |
| `OIDC_JWKS_URL` | 否 | JWKS 地址，缺省为 `{OIDC_ISSUER}/.well-known/jwks.json` |
| `OIDC_USERINFO_URL` | 否 | 用户信息接口地址，缺省为 `{OIDC_ISSUER}/userinfo/` |
| `OIDC_PROVIDER` | 否 | 授权登录 provider 名，默认 `github` |
| `OIDC_CLIENT_ID` | 启用时必填 | 通行证应用 Client ID |
| `OIDC_CLIENT_SECRET` | 启用时必填 | 通行证应用 Client Secret |
| `OIDC_REDIRECT_URI` | 否 | OIDC 回调地址，默认 `http://localhost:3001/api/auth/callback` |
| `OIDC_SCOPE` | 否 | OIDC 授权范围，默认 `openid profile email` |
| `FRONTEND_URL` | 否 | 前端地址（登录成功后跳转），默认 `http://localhost:3001` |
| `LOCAL_USER_ID` | 否 | 本地模式用户 ID，默认 `dev:314` |
| `LOCAL_USER_NAME` | 否 | 本地模式用户名，默认 `本地开发` |

> **本地开发快速开始**：将 `PASSPORT_ENABLED` 设为 `false`，打开页面会自动以本地身份登录（`LOCAL_USER_ID`/`LOCAL_USER_NAME`），直接拥有完整创建/抽奖/管理权限，无需配置通行证即可体验全部功能。

> 不要提交 `.env.local`、`.env` 或任何包含真实密码的环境文件。它们已被 `.gitignore` 覆盖。

### 准备数据库

先创建一个空数据库：

```sql
CREATE DATABASE lottery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

表结构由后端启动时自动创建（幂等），无需手工建表。

### 启动开发服务

需要**同时运行两个进程**：

**终端 1 — 启动后端（FastAPI，端口 8001）：**

```bash
cd backend
# 激活虚拟环境后
uvicorn app.main:app --reload --port 8001
```

验证：访问 http://localhost:8001/health 应返回 `{"status":"ok"}`。

**终端 2 — 启动前端（Next.js，端口 3001）：**

```bash
npm run dev
```

打开 http://localhost:3001 查看应用。

> 前端 API 请求走相对路径 `/api/...`，由 `next.config.ts` 的 rewrites 反向代理到后端 8001 端口。

## 常用脚本

```bash
npm run dev       # 启动前端开发服务
npm run build     # 构建生产版本
npm run start     # 启动生产服务
npm run lint      # 运行 lint
npx tsc --noEmit  # TypeScript 类型检查
```

## 项目结构

```text
emoera-lottery-system/
├── README.md
├── LICENSE
├── package.json
├── next.config.ts               # standalone 输出 + /api 反向代理
├── .env.example                 # 前端环境变量模板
│
├── public/                      # 静态资源
│
├── src/
│   ├── app/
│   │   ├── globals.css          # 全局样式 + 共享动画
│   │   ├── layout.tsx           # 根布局，全站导航栏
│   │   ├── providers.tsx        # 全局 Provider（Antd + Auth）
│   │   ├── page.tsx             # 首页：验证房间并创建/进入
│   │   ├── register/            # 参与者报名页
│   │   ├── history/             # 历史记录页
│   │   ├── activities/          # 活动列表 + 详情页
│   │   └── room/[roomId]/       # 房间管理页（抽奖主页面）
│   │
│   ├── components/
│   │   ├── Navbar/              # 全站导航栏
│   │   ├── QRCodeGenerator.tsx  # 报名二维码
│   │   └── room/                # 房间页子组件
│   │       ├── ParticipantManager.tsx  # 参与者列表
│   │       ├── LotteryPanel.tsx        # 抽奖面板
│   │       ├── Wheel.tsx               # SVG 大转盘
│   │       └── WinnerResultModal.tsx   # 中奖结果弹窗
│   │
│   └── lib/
│       ├── auth-context.tsx     # 登录态管理
│       ├── room-utils.ts        # 房间 ID 生成等工具函数
│       └── types.ts             # 前端类型定义
│
└── backend/
    ├── requirements.txt
    ├── .env.example             # 后端环境变量模板
    └── app/
        ├── main.py              # FastAPI 入口，CORS，路由注册，自动清理
        ├── config.py            # 环境变量配置
        ├── database.py          # 数据库连接与初始化
        ├── models.py            # 数据模型
        ├── schemas.py           # 请求/响应模型
        ├── auth.py              # Session 鉴权 + 权限检查 + 登录/登出端点
        ├── passport.py          # OIDC JWKS 验签
        └── routers/
            ├── rooms.py          # 房间 CRUD + 限额
            ├── users.py          # 报名与参与者管理
            ├── manual.py         # 手动添加/批量生成
            ├── lottery.py        # 抽奖与重置
            ├── history.py        # 历史查询
            ├── events.py         # SSE 实时推送
            ├── activities.py     # 活动系统
            ├── oidc.py           # OIDC 回调
            └── reset.py          # 重置数据库
```

## API 接口

所有业务接口挂在 `/api` 前缀下。

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录入口。生产模式返回 OIDC 授权 URL；本地模式（`PASSPORT_ENABLED=false`）直接签发 session cookie |
| GET | `/api/auth/callback` | OIDC 通行证回调，验证 code 后签发 session |
| GET | `/api/auth/me` | 获取当前登录用户信息 |
| POST | `/api/auth/logout` | 退出登录，清除 session cookie |

### 房间

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/rooms` | 房间列表 |
| POST | `/api/rooms` | 创建或获取房间（需登录，独立房间限 2 个；活动内房间限每活动 10 个） |
| DELETE | `/api/rooms/{room_id}` | 删除房间（仅创建者） |

### 参与者

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/users?roomId=` | 房间参与者列表 |
| POST | `/api/users` | 报名（未登录限 1 人） |
| DELETE | `/api/users` | 删除参与者（仅创建者） |
| POST | `/api/users/manual` | 手动添加单人（仅创建者） |
| PUT | `/api/users/manual` | 批量生成序号用户（仅创建者） |

### 抽奖

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/lottery` | 执行抽奖（仅创建者） |
| PUT | `/api/lottery` | 清空房间中奖记录（仅创建者） |

### 历史

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/history` | 支持 `?roomId=` 单房间、`?roomIds=[]` 多房间、全局聚合三种模式 |

### 活动

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/activities` | 活动列表（含聚合统计） |
| POST | `/api/activities` | 创建活动（需登录，限额 2） |
| GET | `/api/activities/{activity_id}` | 活动详情 |
| PUT | `/api/activities/{activity_id}` | 更新活动（仅创建者） |
| DELETE | `/api/activities/{activity_id}` | 删除活动（仅创建者） |

### 实时事件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/events?roomId=` | SSE 事件流 |

### 运维

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| POST | `/api/reset-db` | 重置数据库（危险操作） |

## 权限系统

| 操作 | 未登录 | 登录（非创建者） | 创建者 |
|------|--------|-----------------|--------|
| 创建独立房间/活动 | ❌ | ✅（各限 2） | ✅ |
| 在活动内创建房间 | ❌ | ✅（活动内限 10 个，不计入个人限额） | ✅ |
| 删除房间/活动 | ❌ | ❌ | ✅ |
| 报名 | ✅（限 1 人） | ✅ | ✅ |
| 手动添加/批量生成 | ❌ | ❌ | ✅ |
| 删除参与者 | ❌ | ❌ | ✅ |
| 抽奖 | ❌ | ❌ | ✅ |
| 重置/清空记录 | ❌ | ❌ | ✅ |

## 部署

### 部署架构

```
浏览器 ──→ Nginx ──→ Next.js (:3001) ──proxy──→ FastAPI (:8001) ──→ MySQL
                    │
                    └── SSE 事件流 ────────────→ FastAPI (:8001)
```

### 前端部署

`next.config.ts` 已配置 `output: 'standalone'`，构建产物自带最小运行时：

```bash
npm ci
npm run build
# 产物在 .next/standalone，配合 .next/static 与 public 一起部署
node .next/standalone/server.js
```

### 后端部署

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

**重要**：SSE 基于单进程内存事件总线，后端必须以**单 worker** 运行。如需多 worker 部署，请先换用 Redis Pub/Sub 等外部消息总线。

### Nginx 反向代理

```nginx
# SSE 事件流需要关闭缓冲
location /api/events {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 3600s;
}

location /api/ {
    proxy_pass http://127.0.0.1:8001;
}

location / {
    proxy_pass http://127.0.0.1:3001;
}
```

### 上线前检查清单

- [ ] CORS `allow_origins` 从 `["*"]` 改为真实前端域名
- [ ] `SESSION_SECRET` 换成强随机值
- [ ] 填写 OIDC 通行证凭证（`OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`）
- [ ] `OIDC_REDIRECT_URI` 和 `FRONTEND_URL` 改为生产域名
- [ ] 禁用或加固 `/api/reset-db`
- [ ] 生产环境关闭 `/docs`（Swagger UI）
- [ ] 数据库账号只授予本库权限，不使用 root
- [ ] 确认后端以单 worker 运行
- [ ] 配置数据库备份策略

## 安全说明

开源发布前请完成以下检查：

- 轮换曾经出现在代码或 Git 历史中的数据库密码、账号和访问地址。
- 确认 Git 历史不包含 `.env`、证书、私钥、Token、云服务密钥等敏感信息。
- 如需保留第三方统计脚本，请确认统计 ID 可以公开；否则建议改为环境变量或移除。
- 为生产环境添加认证、授权和操作审计，尤其是删除用户、重置数据库、执行抽奖等管理操作。

## License

本项目基于 [Apache License 2.0](./LICENSE) 开源。