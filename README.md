# 赛博赛事雷达 · CampusRace Radar

> 一个面向大学生的赛事情报解析工具：把杂乱的群聊、公众号推文、网页通知，变成一份「能不能信、适不适合我、该怎么准备」的决策报告。

参赛项目 · 传智杯 AI 创新应用挑战赛（Vibe Coding 赛道）

![产品演示](docs/prompt-log/demo.gif)

---

## 它解决什么问题

大学生找比赛，信息散在竞赛群、公众号、官网、社交平台，口径还经常不一致：同一赛事三版通知、截止时间对不上、"野鸡赛事"混在里面、主办方挂个查无此会的协会名。人工逐条核对既慢又容易漏。

本工具把这段流程做成一条可视化的 AI 工作流：

```
杂乱文本 → ① 信息提取 → ② 风险核查 → ③ 匹配评估 → ④ 备赛规划 → 决策报告
```

## 四个 Agent 节点

| 节点 | 职责 | 输出 |
|---|---|---|
| ① 信息提取 Extractor | 把非结构化的推文/群聊/OCR 文本抽成结构化 JSON | 赛事名、主办方、时间线、赛道要求、奖项 |
| ② 风险核查 Fact-Checker | 比对官方白名单 + 识别风险信号 | verdict（绿/黄/红）、风险标签、**核验动作清单** |
| ③ 匹配评估 Matchmaker | 赛事 × 个人画像 | 匹配分（技能/时间/目标/门槛四维加权）、推荐档位 |
| ④ 备赛规划 Planner | 倒排工期 | 分阶段任务、里程碑、缓冲周 |

> 设计原则：**工具不判定赛事真假**，只提示风险与可执行的核验路径，结论由人复核。

## 快速开始

```bash
# 1. 准备环境变量（没有 API Key 也能跑，用 mock 模式）
cp .env.example .env

# 2. 安装依赖
npm install

# 3. 同时启动前后端
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:8787（`POST /api/analyze`，SSE 推流）

`.env` 里 `USE_MOCK=true` 时使用本地假数据回放，不消耗任何 API 额度，断网也能完整演示。

## 架构

```mermaid
flowchart LR
  A[杂乱文本] --> B[① 信息提取]
  B -->|结构化 JSON + evidence| C[② 风险核查]
  C -->|verdict + 风险标签| D[③ 匹配评估]
  D -->|fit_score + 建议| E[④ 备赛规划]
  E --> F[决策报告]

  subgraph 确定性层
    C -.规则算分.-> C2[whitelist.json + risk.ts]
    B -.逐字校验.-> B2[validate.ts]
  end

  subgraph 模型层
    B
    D
    E
  end

  F --> G[SSE 逐节点推送]
```

两条设计原则：

1. **判定归规则，解释归模型**——风险分数由 `server/rules/risk.ts` 算出，同样输入永远同样结果；模型只负责把结论翻译成可执行动作。
2. **模型输出必须过校验**——`evidence` 在原文里找不到的字段一律置 null，宁可留空也不编。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Vite 8 + React 19 + TypeScript 7 | 无 UI 组件库，Tailwind 4 手写样式 |
| 后端 | Node + Express 5 | 不引数据库，白名单用静态 JSON |
| 通信 | SSE（Server-Sent Events） | 单向推流，节点逐个点亮 |
| 模型 | OpenAI 兼容协议 | 可在 DeepSeek / 通义 / Gemini 之间一行环境变量切换 |

## 目录结构

```
campusrace-radar/
├─ server/
│  ├─ index.ts          # Express + SSE 入口，四节点串行编排
│  ├─ agents/           # 四个 Agent 各一个文件
│  ├─ prompts/          # 四个 System Prompt（与文档版本一致）
│  ├─ rules/risk.ts     # 确定性风险规则（白名单 + 7 类信号）
│  ├─ llm.ts            # provider 无关的模型调用层（超时/重试/故障注入）
│  └─ validate.ts       # evidence 逐字校验、日期校验、冲突校验
├─ src/
│  ├─ components/       # 节点卡片、报告区、画像表单
│  ├─ lib/sse.ts        # SSE 流解析（纯函数）
│  └─ lib/profile.ts    # 画像类型与解析
├─ data/
│  ├─ whitelist.json    # 官方赛事白名单（可扩展）
│  └─ mock-run.json     # 演示回放数据
├─ eval/
│  ├─ cases.json        # 12 条评测用例
│  ├─ run.mjs           # 批量评测
│  ├─ fault.mjs         # 故障注入
│  └─ report.md         # 评测报告（生成物，已提交作证据）
└─ docs/
   ├─ defense-qa.md     # 答辩问答
   ├─ video-script.md   # 视频分镜
   └─ prompt-log/       # 过程材料（截图/录屏/日志）
```

## 文档索引

| 文档 | 说明 |
|---|---|
| [开发过程日志](docs/prompt-log/process-log.md) | 按时间线记录需求、决策、踩坑与修复 |
| [答辩问答准备](docs/defense-qa.md) | 12 个可能被追问的问题与回答思路 |
| [演示视频脚本](docs/video-script.md) | 产品演示 + AI 协同过程的分镜表 |
| [评测报告](eval/report.md) | 12 条用例的逐项结果与准确率 |
| [产品演示动图](docs/prompt-log/demo.gif) | 四节点依次点亮到决策报告 |

## 过程材料

`docs/prompt-log/` 目录存放参赛证据材料：

- `demo.gif` —— 产品演示动图（已提供）
- `video-a-product.mp4` —— 产品演示视频
- `video-b-ai-process.mp4` —— AI 协同过程录屏（过程可复现的硬性材料）
- `screenshot-*.png` —— 关键节点截图

## 评测

```bash
npm run test:validate  # 单元测试：evidence 校验、置空路径、日期边界
npm run eval           # 批量跑 eval/cases.json，生成 eval/report.md
npm run eval:fault     # 故障注入：模型输出坏 JSON / 接口 500，验证优雅失败
```

当前结果（12 条用例，含诈骗、过期、冲突、注入、OCR 噪声等对抗样本）：

| 指标 | 数值 |
|---|---|
| 用例全通过率 | 100% |
| 单项检查通过率 | 100% |
| 单条延迟（中位） | 10.9s |

> 说明：测试集为自建，覆盖 12 类场景，**不代表真实世界的准确率**。评测的价值在于把「模型可能怎么坏」变成可重复执行的检查。

## 开发进度

- [x] Day 0 · 项目骨架与工具链
- [x] Day 1 · SSE 假数据链路 + 看板动效
- [x] Day 2 · 接真模型 + 证据校验
- [x] Day 3 · 风险核查 / 匹配评估 / 备赛规划
- [x] Day 4 · 状态机与风险视觉
- [x] Day 5 · 评测与故障注入
- [x] Day 6 · 文档与演示视频

## 开发约定

1. 一个对话只干一件事，改完就 `commit`
2. 每个功能块独立提交，标签 `v0.x`
3. 演示资料（截图、录屏）存 `docs/prompt-log/`
4. `.env` 永不入库

---

## License

仅供参赛与学习使用。