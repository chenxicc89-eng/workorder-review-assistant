# 12345 回单智能预审助手

个人使用的网页平台,用于辅助审核 12345 工单回单。把「市民诉求」与「承办单位回单内容」粘贴进来,系统按回单规范进行**三段式预审**(本地规则预检 → AI 主审核 → AI 复核),识别回单中的不规范问题,自动生成:

- 审核结论(通过 / 建议修改 / 建议退回)与风险等级(高 / 中 / 低)
- 表格化问题清单(权重、原文依据、分析、整改要求、来源)
- 可直接复制给承办单位的正式审核意见

并支持保存历史案例、标记误判、维护回单规范库。

> 第一阶段聚焦**单条工单审核的准确性**,不追求极致速度。

---

## 技术栈

- 前端:React + TypeScript + Vite + Tailwind CSS + shadcn/ui 风格组件 + Lucide 图标 + React Router
- 后端:Node.js + Express + TypeScript(`tsx` 运行)
- 数据库:SQLite + Prisma ORM
- AI:OpenAI 兼容协议(可对接 OpenAI / DeepSeek / 通义千问 / Kimi / 硅基流动 等),抽象为 provider 接口
- **本地规则引擎**:在 AI 之前做确定性检查(7 条规则)

---

## 一、安装依赖

需要 Node.js ≥ 18(推荐 20)。

```bash
cd workorder-review-assistant
npm install
```

## 二、配置 API Key(可选)

复制环境变量模板:

```bash
cp .env.example .env
```

`.env` 关键字段:

| 变量           | 说明                                                              |
| -------------- | ----------------------------------------------------------------- |
| `PORT`         | 后端端口,默认 `3001`                                             |
| `DATABASE_URL` | SQLite 路径,默认 `file:./dev.db`                                 |
| `AI_ENABLED`   | 是否启用真实 AI。`false` 或 Key 为空 → 自动使用 **mock 模式**     |
| `AI_PROVIDER`  | 目前为 `openai`(OpenAI 兼容协议)                                |
| `AI_API_KEY`   | 你的 API Key(**不要提交到仓库**)                                |
| `AI_BASE_URL`  | OpenAI 兼容 Base URL(见模板中的各家示例)                        |
| `AI_MODEL`     | 模型名,如 `gpt-4o-mini` / `deepseek-chat` / `qwen-plus`          |
| `AI_VISION_MODEL` | 图片识别用的视觉模型,留空则复用 `AI_MODEL`。文本模型不支持图片时在此单独指定,如 `gpt-4o` / `qwen-vl-max` / `doubao-1.5-vision-pro` |

> **无需 Key 也能完整运行**:留空或 `AI_ENABLED=false` 时,系统使用基于本地规则的确定性 mock,依旧走完整三段式流程。
>
> **启用真实 AI**:设置 `AI_ENABLED=true` 并填入 `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`,重启后端即可。API Key 只从环境变量读取,绝不写死在代码里。

## 三、初始化数据库(PostgreSQL)

数据库使用 **PostgreSQL**(本地开发可用本地 Postgres,或直接指向云库如 Vercel Postgres / Neon)。
先把连接串填进 `.env` 的 `DATABASE_URL` 与 `DIRECT_URL`(见 `.env.example`),然后:

```bash
npm run db:generate   # 生成 Prisma Client
npm run db:migrate    # 创建表(首次会提示输入 migration 名,可回车用默认)
# 规范库无需手动 seed —— 库为空时会自动使用内置默认规范。
# 如需把 10 条默认规范预置入库(可选):
npm run db:seed
```

## 四、启动项目

```bash
npm run dev
```

- 后端:http://localhost:3001
- 前端:http://localhost:5173 (Vite 已把 `/api` 代理到后端)

打开 http://localhost:5173 即可使用。顶部右侧会显示当前 AI 模式(真实 / Mock)。

生产构建:

```bash
npm run build     # tsc 类型检查 + vite 打包
npm run preview   # 预览前端;后端用 npm start 启动
```

---

## 五、测试示例工单

1. 打开「工单审核」页,点击 **加载示例**(内置需求文档中的朝阳区频繁停电案例)。
2. 点击 **开始审核**。
3. 右侧应识别出以下问题:
   - **联系情况前后矛盾**(高):标注「【已联系】」但正文又说电话保密无法联系
   - **未回应频繁停电核心诉求**(高):仅说明本次停电,未回应常年频繁停电
   - **市民意见表述不规范**(高/中):出现「【未知意见】」
   - **办理时间与停电时间混同**(中)
   - **处理措施过于笼统**(中):仅「临时检修」「已解决」
   - **时间节点不完整**(中):缺少恢复供电时间
   - **口语化表述**(低):「隋师」
   - **「已解决」支撑不足**(中/高)
4. 可 **复制审核意见** → **保存为案例** → 到「历史案例」页查看 / 标记误判 / 复制最终意见。

---

## 五之二、上传图片/PDF/Word/Excel 自动识别工单

在「工单审核」页的**工单信息**卡片顶部,有「上传工单…自动识别」区:

1. **点击或拖拽**上传工单文件,可一次多个、可混合类型:
   - **图片(PNG/JPG 等)/ PDF** → 走**视觉大模型 OCR**(需配视觉模型);
   - **Word(.docx)/ Excel(.xlsx)** → 前端直接解析成文字,走**文本模型**拆分(**不消耗视觉额度,只需 DeepSeek 这类文本模型**)。
   诉求主表放前面、承办单位回单/附件说明放后面,识别更准。
2. 图片缩略图可**删除、上移/下移**;Word/Excel 以文件名列出,可删除。
3. 点击 **识别并填入** → 系统自动识别并拆分,回填到「市民诉求 / 回单内容 / 工单类型 / 编号 / 承办单位 / 附件说明」。混合上传时,图片走视觉、Office 走文本,结果自动合并。
4. **务必人工核对**回填内容(可展开「查看识别原文」比对),按需修改。
5. 确认无误后点 **开始审核**,走与手动录入完全相同的三段式审核流程。

支持格式:图片、PDF(逐页)、Word `.docx`、Excel `.xlsx`/`.xls`;图片一次最多 8 张,文档最多 8 个。**`.doc` 老格式不支持,请在 Word 中另存为 `.docx`。**

**关于模型配置:**

- **Word/Excel**:只要配了文本模型(`AI_ENABLED=true` + `AI_API_KEY`,如 DeepSeek)即可用,**无需视觉模型**。
- **图片/PDF**:需要视觉模型。若 `AI_MODEL` 是文本模型(如 `deepseek-chat`),另设 `AI_VISION_MODEL`/`AI_VISION_BASE_URL`/`AI_VISION_API_KEY` 指定支持视觉的模型(如 `qwen-vl-max` / `gpt-4o`)。未配视觉时,图片识别不可用,但 **Word/Excel 与手动粘贴仍可用**。
- **Mock 模式**(无 Key):识别可点击演示,但**不真正读取文件**,填入内置示例并提示。配置模型后即为真实识别。

---

## 五之三、部署到 Vercel

项目已适配 Vercel:前端(静态)+ 后端(Serverless Function,由 `api/index.ts` 承载整个 Express app)+ PostgreSQL。前端 API 走相对 `/api/*`,同域直连,无需改地址。

**你需要自己做的步骤:**

1. **开通云数据库**(Vercel Postgres 或 Neon),拿到两个连接串:
   - pooled(带 `-pooler` / `pgbouncer=true`)→ 用作 `DATABASE_URL`
   - direct → 用作 `DIRECT_URL`
2. **建表**:本地把这两个串填进 `.env`,执行 `npm run db:deploy`(等价 `prisma migrate deploy`)对云库建表。
   - 若还没有 migration 文件,先跑一次 `npm run db:migrate`(对着云库/本地 Postgres 生成迁移),再 `db:deploy`。
   - 规范库**无需 seed**,库为空时自动用内置默认;想预置可选 `npm run db:seed`。
3. **推到 Git 并在 Vercel 导入项目**(Framework Preset 选 Other/Vite 均可,已有 `vercel.json` 指定构建)。
4. **在 Vercel 项目 → Settings → Environment Variables** 里填:
   - `DATABASE_URL`、`DIRECT_URL`(上面两个串)
   - `AI_ENABLED=true`、`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`
   - 需要图片识别再加 `AI_VISION_API_KEY`、`AI_VISION_BASE_URL`、`AI_VISION_MODEL`
   （`.env` 不会上传,线上 Key 只在这里配。）
5. **Deploy**。打开分配的域名即可使用。

**说明:**
- Serverless 请求体上限约 4.5MB,前端已把图片压缩到最长边 1280、质量 0.72,单次最多 6 张并做体积拦截,正常工单截图足够。
- Prisma 用 pooled 连接串以适配 serverless 并发,`postinstall` 会自动 `prisma generate`。
- react-router 深链(如刷新 `/cases`)由 `vercel.json` 的 SPA fallback 处理。

---

## 六、如何添加新的审核规则(本地规则引擎)

本地规则位于 [`src/lib/ruleEngine.ts`](src/lib/ruleEngine.ts),每条规则:命中关键词 → 产出结构化 `ReviewIssue`。新增一条规则的步骤:

1. 在文件顶部关键词字典区加入你的关键词数组(参考 `NOT_CONTACTED_WORDS` 等)。
2. 在 `checkRules()` 里追加一个规则块:

   ```ts
   // ---- 规则 8:你的规则(权重)----
   {
     const hits = matchedKeywords(reply, YOUR_KEYWORDS);
     if (hits.length > 0) {
       issues.push({
         id: ruleId(8),
         weight: "中",
         category: "你的问题分类",
         evidence: evidenceFor(reply, hits, 2),
         analysis: "问题分析说明。",
         requirement: "整改要求。",
         source: "rule",
       });
     }
   }
   ```

3. 文本处理辅助函数在 [`src/lib/utils/textExtract.ts`](src/lib/utils/textExtract.ts)(`containsAny` / `matchedKeywords` / `evidenceFor` / `snippetAround` / `hasTimeInfo`)。
4. 无需改动前后端 —— 规则命中会自动进入合并流程与结果展示。

> AI 主审核的提示词在 [`src/lib/prompts/reviewPrompt.ts`](src/lib/prompts/reviewPrompt.ts),复核提示词在 [`src/lib/prompts/verifyPrompt.ts`](src/lib/prompts/verifyPrompt.ts),可按需调整审核维度与权重标准。

---

## 七、如何维护规范库

- **界面维护**:打开「规范库」页,可按工单类型查看、**新增 / 编辑 / 启用 / 停用 / 删除**规范。每个字段(必备要素、各级风险问题、规范要求、意见模板)按「每行一条」编辑。
- **审核如何使用规范**:审核时按工单类型取**启用中的**规范传给规则引擎与 AI;数据库无对应规范时回退到内置默认规范。
- **修改内置默认**:编辑 [`src/lib/standards/defaultStandards.ts`](src/lib/standards/defaultStandards.ts),再执行 `npm run db:seed`(幂等 upsert,按稳定 id 更新)。
- **重置规范库**:`npm run db:reset` 会重建数据库并自动重新 seed。

### 从已审核通过工单升级规范

「学习中心」只保留“多文件智能配对”导入方式：可一次选择 Word、Excel、PDF、PNG/JPG 等工单资料，系统按工单编号自动配对工单内容、回复内容和不计入考核评价报告。

- 必填：工单编号、工单类型、工单内容、工单回复内容；
- 可选：不计入考核评价报告、承办单位；
- 确认导入前会展示配对结果和资料完整性，有问题的工单不会写入；
- 选择对应工单类型并点击“生成候选准则”，系统会提炼必备要素、规范要求、豁免准则和标准正例；
- 候选只有人工点击“采纳”后才会进入生效规范，已采纳规则可撤回。

已通过样本不会自动推断风险等级。单条样本可以生成候选，但置信度最高为 0.6，仍需人工采纳后才生效；豁免候选必须有评价报告支撑。

### 第二期：多资料配对、版本与评估

- **多文件智能配对**：学习中心可一次选择 Word、Excel、PDF、PNG/JPG 等资料。系统逐文件识别，优先按正文中的工单编号归并；识别不到时按文件名归并。建议文件名同时包含工单编号和“工单内容 / 回单 / 不计入考核报告”等资料类型。
- **已通过工单样本库**：导入后可在学习中心查看最近样本，展开核对工单内容、回复和评价报告，并按单条或导入批次删除；支持多选/全选后批量修改工单类型。删除或改类型会同步清理尚未采纳候选中的旧来源引用。
- **人工补配**：配对结果会展示工单、回单、评价报告是否齐全；可补录工单编号和工单类型，只有资料完整的行能导入。
- **类型确认**：OCR 返回空类型或兜底“其他”时，系统会要求用户从已有类型选择或直接输入新类型后再导入；已入库样本也可在样本库中点击“改类型”修正。
- **规范版本**：规范每次人工保存、模板覆盖、采纳/撤回学习候选、版本回滚都会生成不可变快照。在规范卡片点“版本”查看逐版本新增/删除项并回滚。
- **冲突检测**：候选生成时会与当前规范、已存在候选及同批候选进行相似度检查。疑似重复或与豁免/强制要求冲突的候选会标红并禁止直接采纳。
- **候选批量处理**：待审候选支持多选/全选后批量采纳或驳回；批量采纳时疑似重复、冲突候选会被跳过并提示，不影响其他正常候选生效。
- **样本回放评估**：规范至少有两个版本且同类型至少有两条已通过样本时，可在版本窗口点击“样本回放评估”，对比新旧规范下的通过数和问题数。已通过样本通过率下降通常意味着规则可能过严。

图片/PDF 真实识别需要配置视觉模型；Word/Excel 使用文本模型。Mock 模式可演示流程，但不会真实读取文件语义。

---

## 八、项目结构

```
src/
  lib/
    types.ts               # 前后端共享类型
    ruleEngine.ts          # 本地规则引擎(7 条规则)
    reviewMerger.ts        # 规则结果 + AI 结果合并
    api.ts                 # 前端 API 封装
    ai/                    # provider 抽象 / openai / mock / client(三段式)
    prompts/               # 主审核 & 复核提示词
    standards/             # 内置默认规范
    utils/                 # 文本处理 / 风险等级 / 剪贴板 / cn
  components/              # 业务组件 + ui/ (shadcn 风格基础组件)
  pages/                   # ReviewPage / CasesPage / StandardsPage
  server/                  # Express 入口 / routes / services / db
prisma/
  schema.prisma            # WorkOrderCase + StandardRule
  seed.ts                  # 写入默认规范
```

## 九、API 一览

| 方法   | 路径                 | 说明                              |
| ------ | -------------------- | --------------------------------- |
| POST   | `/api/review`        | 单条工单预审,返回 `ReviewResult` |
| POST   | `/api/cases`         | 保存案例                          |
| GET    | `/api/cases`         | 查询案例(类型/风险/关键词/时间/误判) |
| GET    | `/api/cases/:id`     | 案例详情                          |
| PATCH  | `/api/cases/:id`     | 修改最终意见 / 标记误判 / 备注    |
| GET    | `/api/standards`     | 查询规范库                        |
| POST   | `/api/standards`     | 新增 / 更新规范                   |
| PATCH  | `/api/standards/:id` | 启用 / 停用                       |
| DELETE | `/api/standards/:id` | 删除规范                          |
| GET    | `/api/health`        | 健康检查 + 当前 AI 模式           |

---

## 十、后续扩展方向(已在结构上预留,第一版未实现)

批量 Excel 审核、OCR 识别截图、规范 Excel 导入、多用户登录、单位问题统计、常见问题报表、本地模型部署、企业微信 / 手机端 H5、审核意见模板管理、人工反馈训练案例库。

provider 已抽象为接口([`src/lib/ai/providers.ts`](src/lib/ai/providers.ts)),后续切换模型只需新增一个 provider 实现。
```
