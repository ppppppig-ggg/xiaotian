# 赛博赛事雷达 · CampusRace Radar

> 一个面向大学生的赛事情报解析工具：把杂乱的群聊、公众号推文、网页通知，变成一份「能不能信、适不适合我、该怎么准备」的决策报告。

参赛项目 · 传智杯 AI 创新应用挑战赛（Vibe Coding 赛道）

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
│  ├─ index.ts          # Express + SSE 入口
│  ├─ agents/           # 四个 Agent 各一个文件
│  ├─ llm.ts            # provider 无关的模型调用层
│  └─ validate.ts       # evidence 校验、日期校验
├─ src/
│  ├─ components/       # 看板、节点卡片、报告区
│  └─ lib/sse.ts        # SSE 流解析（纯函数，可单测）
├─ data/whitelist.json  # 官方赛事白名单
├─ eval/cases.json      # 评测用例
└─ docs/prompt-log/     # 开发过程对话截图（过程可复现材料）
```

## 开发进度

- [x] Day 0 · 项目骨架与工具链
- [x] Day 1 · SSE 假数据链路 + 看板动效
- [x] Day 2 · 接真模型 + 证据校验
- [ ] Day 3 · 风险核查 / 匹配评估 / 备赛规划
- [ ] Day 4 · 状态机与风险视觉
- [ ] Day 5 · 评测与故障注入
- [ ] Day 6 · 文档与演示视频

## 开发约定

1. 一个对话只干一件事，改完就 `commit`
2. 每个功能块独立提交，标签 `v0.x`
3. 演示资料（截图、录屏）存 `docs/prompt-log/`
4. `.env` 永不入库

---

## License

仅供参赛与学习使用。