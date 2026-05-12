# Database Reports - AI 驱动的数据库报表生成器

基于 **TanStack Start** 构建的 AI 数据库报表应用，使用 **Netlify Database** (Postgres) 作为数据层，**TanStack AI Code Mode** 作为 LLM 工具层。用户通过自然语言向 AI 提问，AI 自动生成包含图表、指标和数据表的交互式报表。

## 功能特性

- **自然语言查询** — 用中文或英文描述你想看的数据分析，AI 自动理解并生成报表
- **多模型支持** — DeepSeek V4 Flash/Pro（默认）、Claude Haiku、GPT-4o、Gemini 2.5 Flash
- **实时报表构建** — 报表组件随着 AI 生成逐步呈现，支持图表、指标卡、数据表、Markdown 等 18 种组件
- **SSE 流式响应** — 基于 Server-Sent Events 的实时流式传输，思考过程可视化
- **沙箱代码执行** — AI 生成的 TypeScript 代码在 `isolated-vm` 沙箱中安全运行
- **本地 Postgres** — 通过 Netlify Vite 插件自动启动本地数据库，内置示例数据集

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 19 + TanStack Start (SSR) |
| 路由 | TanStack React Router (文件路由) |
| 样式 | Tailwind CSS v4 + Framer Motion |
| 图表 | Recharts 3 |
| LLM 工具层 | TanStack AI Code Mode |
| 沙箱引擎 | isolated-vm (Node.js) / QuickJS (fallback) |
| ORM | Drizzle ORM |
| 数据库 | Netlify Database (Postgres) |
| 构建 | Vite 8 + RSC Plugin |
| 部署 | Netlify Functions |

## 系统要求

- **Node.js 24** — `isolated-vm` 原生模块仅提供 Node 24 的预编译二进制。项目 `.nvmrc` 已固定版本号。
- **pnpm** — 包管理器
- **Netlify CLI** — 数据库脚本依赖（`pnpm db:apply` 等通过 CLI 操作本地 Postgres）

```bash
# 安装 Node 24
nvm install 24
nvm use

# 安装 Netlify CLI
npm install -g netlify-cli
```

## 快速开始

### 1. 环境变量

创建 `.env.local` 文件：

```env
EXPERIMENTAL_NETLIFY_DB_ENABLED=1
DEEPSEEK_API_KEY=sk-your-key-here

# 可选：其他 AI 提供商
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

> `EXPERIMENTAL_NETLIFY_DB_ENABLED=1` 必须设置，否则 Netlify Vite 插件不会启动本地 Postgres，`getDatabase()` 会抛出异常。

### 2. 安装依赖

```bash
pnpm install     # 同时编译 isolated-vm 原生模块
```

首次安装时，如果遇到 `ERR_PNPM_IGNORED_BUILDS` 错误，运行：

```bash
pnpm approve-builds
```

### 3. 启动开发服务器

```bash
pnpm dev
```

Vite 开发服务器启动在 `http://localhost:3000`，同时自动启动本地 Postgres 数据库。

### 4. 初始化数据库（首次运行）

在另一个终端中执行：

```bash
pnpm db:apply    # 应用数据库迁移（创建表结构）
pnpm db:seed     # 导入示例数据
```

示例数据包含：
- **customers** — 35 个客户（id, name, email, city, joined）
- **products** — 20 个产品（id, name, category, price, stock）
- **purchases** — 550 条购买记录（id, customer_id, product_id, quantity, total, purchased_at）
  - 日期范围：2026-02-13 至 2026-04-13

### 5. 打开应用

浏览器访问 [http://localhost:3000](http://localhost:3000)，选择 AI 模型后输入查询。

## 数据流架构

```
用户输入 → POST /api/reports → DeepSeek/其他 LLM Adapter
  → chat() + tools: [codeMode, new_report, list_reports, delete_report]
    → LLM 调用 new_report → 服务端创建 ReportState
    → LLM 调用 execute_typescript → 沙箱中执行 TypeScript
      → 沙箱调用 external_queryTable → 查询 Postgres
      → 沙箱调用 external_report_* → 添加 UI 组件
        → 每个操作发送 SSE 事件 → 客户端实时更新
```

### API 端点

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/reports` | POST | 主聊天端点 — SSE 流式响应 |
| `/api/report-sse` | GET | 报表实时更新 SSE 流 |
| `/api/report-event` | POST | 处理器执行（按钮点击等） |
| `/api/invalidate` | POST | 信号失效 → 重新计算订阅组件 |

## 项目结构

```
├── db/
│   ├── schema.ts              # Drizzle ORM 表定义
│   ├── seed.ts                # 数据库种子脚本
│   └── seed-data.ts           # 示例数据
├── netlify/
│   └── database/migrations/   # 数据库迁移文件
├── src/
│   ├── server/
│   │   └── deepseek-adapter.ts   # DeepSeek Chat Completions API 适配器
│   ├── routes/
│   │   ├── index.tsx           # 主页面（聊天 UI + 报表面板）
│   │   ├── __root.tsx          # 根布局
│   │   └── _reporting/
│   │       ├── api.reports.ts      # POST /api/reports — 核心聊天端点
│   │       ├── api.report-sse.ts   # GET /api/report-sse — 报表 SSE
│   │       ├── api.report-event.ts # POST /api/report-event — 事件处理
│   │       └── api.invalidate.ts   # POST /api/invalidate — 信号失效
│   ├── components/
│   │   ├── reports/
│   │   │   ├── ReportRenderer.tsx  # 报表渲染入口
│   │   │   ├── NodeRenderer.tsx    # 节点渲染器
│   │   │   ├── useReportState.ts   # 客户端报表状态
│   │   │   ├── usePersistedReports.ts  # localStorage 持久化
│   │   │   ├── useReportSSE.ts     # SSE 事件处理
│   │   │   └── primitives/         # 18 种 UI 组件原语
│   │   │       ├── layout/         # VBox, HBox, Grid, Card, Section
│   │   │       ├── content/        # Text, Metric, Badge, Markdown, Divider, Spacer, Button
│   │   │       ├── data/           # Chart, Sparkline, DataTable, Progress
│   │   │       └── special/        # Placeholder, ErrorDisplay, Empty
│   │   └── db-demo/            # 代码块渲染和 VM 事件显示组件
│   └── lib/
│       ├── reports/
│       │   ├── types.ts            # 核心类型定义（Report, UINode, UIEvent 等）
│       │   ├── report-storage.ts   # 服务端报表状态管理（内存 Map）
│             ├── tools.ts               # TanStack AI 工具（new_report, list_reports, delete_report）
│       │   ├── create-report-bindings.ts  # ~25 个 external_report_* 沙箱绑定函数
│       │   ├── apply-event.ts       # UIEvent → UINode 树变更
│       │   ├── signal-registry.ts   # 信号注册表（订阅/取消订阅）
│       │   ├── evaluate-watchers.ts # Watcher 条件评估
│       │   └── validate-handler.ts  # 处理器验证
│       ├── tools/
│       │   ├── database-tools.ts    # external_queryTable, external_getSchemaInfo
│       │   └── database-constants.ts # 列名白名单验证
│       └── create-isolate-driver.ts # isolated-vm / QuickJS 驱动创建
├── .env.local                  # 环境变量（API 密钥等，已 gitignore）
├── netlify.toml                # Netlify 构建配置
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置（含 #/* 路径别名）
└── package.json
```

## 路径别名

`#/*` 和 `@/*` 均解析到 `./src/*`，在 `tsconfig.json` 和 `vite.config.ts` 中配置。

## 报表系统

### 组件类型（18 种）

| 分类 | 组件 | 说明 |
|------|------|------|
| **布局** | `vbox`, `hbox`, `grid`, `card`, `section` | 容器组件，可嵌套子组件 |
| **内容** | `text`, `metric`, `badge`, `markdown`, `divider`, `spacer`, `button` | 叶子组件，显示内容 |
| **数据** | `chart`, `sparkline`, `dataTable`, `progress` | 交互式数据可视化 |
| **特殊** | `placeholder`, `error`, `empty` | 状态占位组件 |

### 事件协议

报表通过 `UIEvent` 进行增量更新：

- `add` — 添加组件（指定 parentId 进行嵌套）
- `update` — 更新组件 props（合并覆盖）
- `remove` — 移除组件
- `reorder` — 重排子组件顺序

### 状态管理

- **服务端**：`report-storage.ts` — 内存 `Map<string, ServerReportState>`，包含信号注册表、SSE 控制器、Watcher 订阅
- **客户端**：`useReportState.ts` + `usePersistedReports.ts` — 客户端 UINode 树 + localStorage 持久化

> 注意：服务端报表状态在服务器重启后丢失。客户端报表通过 localStorage 持久化。

## DeepSeek 适配器

`src/server/deepseek-adapter.ts` 是自定义的 DeepSeek Chat Completions API 适配器，绕过 `@tanstack/ai-openai`（使用不兼容的 Responses API）直接对接 DeepSeek 的 OpenAI 兼容接口。

### 特殊处理

- **Thinking Mode**：DeepSeek V4 模型返回 `reasoning_content` 字段，后续 API 调用必须回传。适配器在 `lastReasoningContent` 中缓存推理内容，构建消息时自动注入。
- **SSE 流解析**：手动解析 Server-Sent Events，映射到 TanStack AI 的 `StreamChunk` 类型。
- **工具调用**：支持流式工具调用增量（tool_calls delta），正确拼接 arguments。

### 模型列表

| 模型 ID | 说明 |
|---------|------|
| `deepseek-v4-flash` | 默认，快速推理，适合大多数查询 |
| `deepseek-v4-pro` | 深度推理，适合复杂分析 |

## Code Mode（代码沙箱）

AI 通过 `execute_typescript` 工具在沙箱中执行 TypeScript 代码，而非逐个调用工具。

### 沙箱中可用的函数

| 函数 | 说明 |
|------|------|
| `external_queryTable({ table, columns?, where?, orderBy?, limit? })` | 查询数据库表 |
| `external_getSchemaInfo({ table? })` | 获取表结构信息 |
| `external_report_card`, `external_report_chart`, `external_report_metric` 等 ~25 个 | 添加报表 UI 组件 |

### 沙箱配置

- **主引擎**：`isolated-vm`（Node.js 原生 V8 沙箱）
- **降级引擎**：QuickJS（浏览器兼容）
- **内存限制**：128MB
- **超时**：60 秒
- **服务端外部包**：`esbuild`, `pg`, `isolated-vm`, `quickjs-emscripten` 等标记为 SSR external

## 数据库命令

| 命令 | 用途 | 何时使用 |
|------|------|----------|
| `pnpm db:apply` | 应用迁移 | 首次设置或 schema 变更后 |
| `pnpm db:seed` | 导入示例数据 | 首次设置或需要重置数据时 |
| `pnpm db:reset` | 删除所有表和数据 | 想从头开始时 |
| `pnpm db:generate` | 从 `db/schema.ts` 生成迁移 | 修改 schema 后 |
| `pnpm db:studio` | 打开 Drizzle Studio GUI | 查看数据库数据 |
| `pnpm db:status` | 查看迁移状态 | 检查数据库状态 |

完整重置流程：

```bash
pnpm db:reset && pnpm db:apply && pnpm db:seed
```

> `db:seed` 会先 `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` 再插入数据，切勿用于生产环境。

## 构建与部署

### 本地构建

```bash
pnpm build    # 输出到 dist/client + 服务端 bundle
```

### 部署到 Netlify

1. **关联 Netlify 站点**

```bash
netlify login
netlify init   # 或 netlify link（关联已有站点）
```

2. **确保迁移文件已提交**

```bash
ls netlify/database/migrations   # 应包含 <timestamp>_<name>/ 目录
```

3. **部署**

```bash
netlify deploy --build --prod    # 或 git push（如果已配置 GitHub 集成）
```

首次部署会自动：
- 配置生产环境 Postgres
- 执行 `vite build`
- 应用所有数据库迁移
- 发布站点

4. **导入生产数据**

```bash
# 方式 A：Team Owner 直接 seed
NETLIFY_DB_URL="postgres://..." pnpm db:seed

# 方式 B：通过数据迁移（适用于所有角色）
pnpm db:seed:migration
git add netlify/database/migrations/*_seed_demo_data
git commit -m "Seed demo data via migration"
netlify deploy --build --prod
```

### 环境变量说明

**本地开发**（`.env.local`）：
- `EXPERIMENTAL_NETLIFY_DB_ENABLED=1` — 启用本地 Postgres
- `DEEPSEEK_API_KEY` — DeepSeek API 密钥
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` — 可选的其他提供商

**生产部署**：
- Netlify AI Gateway 自动注入 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY`
- Netlify Database 自动注入 `NETLIFY_DATABASE_URL` / `NETLIFY_DB_URL`
- DeepSeek 需要在 Netlify 环境变量中手动设置 `DEEPSEEK_API_KEY`

## 常见问题

### `ERR_PNPM_IGNORED_BUILDS`

首次安装时原生模块编译被阻止：

```bash
pnpm approve-builds
```

### `MissingDatabaseConnectionError`

`EXPERIMENTAL_NETLIFY_DB_ENABLED=1` 未设置或数据库未迁移：

```bash
# 确认 .env.local 中有该变量
echo $env:EXPERIMENTAL_NETLIFY_DB_ENABLED   # PowerShell
# 或
grep EXPERIMENTAL_NETLIFY_DB_ENABLED .env.local

# 然后初始化数据库
pnpm db:apply && pnpm db:seed
```

### DeepSeek 不执行第二步（execute_typescript）

DeepSeek V4 的 thinking mode 要求在后续 API 调用中回传 `reasoning_content`。适配器已自动处理此问题（`lastReasoningContent` 缓存机制）。如果仍有问题，检查 `.env.local` 中 `DEEPSEEK_API_KEY` 是否有效。

### 端口被占用

如果 3000 端口被占用，Vite 会自动切换到 3001：

```
Port 3000 is in use, trying another one...
Local: http://localhost:3001/
```

### hydration mismatch 警告

浏览器扩展（如密码管理器）在 React 加载前修改 HTML 可能导致此警告。不影响功能，可忽略。

## 测试

```bash
pnpm test    # vitest run
```

## 相关资源

- [TanStack Start 文档](https://tanstack.com/start)
- [TanStack AI Code Mode](https://www.npmjs.com/package/@tanstack/ai-code-mode)
- [Netlify Database 文档](https://docs.netlify.com/build/data-and-storage/netlify-database/)
- [Netlify Database 本地开发](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)
- [DeepSeek API 文档](https://api-docs.deepseek.com/)
- 架构详解：[`CODE-MODE.md`](./CODE-MODE.md)
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code 协作指南

## License

Private
