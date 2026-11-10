# 开发过程日志

> 记录「赛博赛事雷达 / CampusRace Radar」从空目录到可运行产品的完整过程。
> 用途：作为「过程可复现」的文字佐证，与 `docs/prompt-log/` 下的录屏、截图互相印证。

- 项目：传智杯 AI 创新应用挑战赛 · Vibe Coding 赛道
- 仓库：https://github.com/ppppppig-ggg/xiaotian
- 开发方式：与 AI 结对编程（AI 写，我 review、提需求、纠错、验收）
- 环境：Windows 11 / Node v26.13.0 / npm 11.20.0 / Git 2.56.0 / Vite 8 + React 19 + TS 7 + Tailwind 4

---

## 时间线总览

| 阶段 | 时间 | 产出 | 提交 |
|---|---|---|---|
| Day 0 | 11-09 晚 | 项目骨架、工具链、目录规范、README | `a97c7a7` `49ba26e` |
| Day 1 | 11-09 夜 | SSE 假数据链路 + 三栏看板 + 状态机 | `c56422a` `87d52f1` `c609013` `4157101` |
| Day 2 | 11-10 早 | 模型调用层 + 证据校验 + 真实信息提取 | `475ecf7` |
| 素材 | 11-10 上午 | 产品演示动图 | `beb5910` |

---

## Day 0 · 从空目录到能跑

### 起点

目标不是「先想清楚再做」，而是「先让骨架能跑起来」，避免前两天在架构上空转。

### 提给 AI 的需求（原话要点）

> 用 Vite + React + TS + Tailwind 起一个项目，目录按前后端分离预留，后端用 Express 单独跑一个端口。

### AI 产出

- `package.json`：`vite` / `react` / `typescript` / `tailwindcss`
- 目录：`src/`（前端）、`server/`（后端）、`data/`（mock 数据）、`docs/prompt-log/`（过程材料）、`eval/`（评测用例）
- `.gitignore`：`.env`、`node_modules`、`dist`
- `.env.example`：`LLM_PROVIDER` / `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `USE_MOCK` / `SERVER_PORT`

### 踩的坑

| 现象 | 原因 | 解决 |
|---|---|---|
| `npm.ps1 无法加载，禁止运行脚本` | PowerShell 执行策略是 Restricted | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force` |
| 新开的终端里找不到 `git` | 装 Git 时没写进系统 PATH | 每次命令前从注册表重新拼 `$env:Path` |
| `git push` 报 `C:/Program: No such file` | 凭据助手路径含空格（`Program Files`） | 改用 8.3 短路径 `C:/PROGRA~1/Git/...` |

> 这三条看起来是环境琐事，但都真实卡住过进度，记下来是为了别人复现时不再踩。

### 验证

```bash
npm run build   # ✓ built in 140ms，20 个模块
```

---

## Day 1 · SSE 假数据链路与看板

### 需求

先不接模型，用手写数据把「四个节点依次点亮 → 出报告」这条动画链路跑通。理由是：**先把管道建好，模型接进来只是换个数据源**。

### 设计决策

1. **用 SSE 不用 WebSocket**：单向推送、比 WS 轻、原生支持断线重连语义，浏览器 `fetch` 就能读流。
2. **事件契约固定**：`{node, status, payload?, message?}`，`node: 'all'` 表示整体结束。前端只认这个契约，后端换实现不影响前端。
3. **默认 mock**：`USE_MOCK` 默认 `true`，显式设 `false` 才调模型。防止演示、断网时误烧额度。

### 踩的坑（本次最重要的一次）

**现象**：后端起来了、健康检查正常，但 SSE **一条事件都推不出来**，`curl` 直接挂住。

**定位过程**：
1. 先确认响应头对（`text/event-stream` + `no-cache` + `flushHeaders`）——没问题
2. 再确认定时器有没有跑——发现第一个事件就没发出
3. 怀疑「客户端断开」判断误触发，去看清理逻辑

**根因**：清理逻辑写的是 `req.on('close', ...)`。但 **Node 16+ 在请求体读取完成后就会触发 `req` 的 `close`**，于是每个正常请求都被判定成「客户端已断开」，定时器被立刻清空。

**修复**：改用 `res.on('close', ...)`，并加 `res.writableEnded` 兜底。

```ts
// 错误写法：请求体读完就触发，正常请求被误判为断开
req.on('close', () => { closed = true; timers.clear() })

// 正确写法：只监听响应关闭
res.on('close', () => { closed = true })
```

**验证**（改完实测，逐条到达时间）：

```
+  58ms  extractor running
+ 958ms  extractor done
+1865ms  fact_checker running
+2758ms  fact_checker done
...
+6963ms  all done
共 9 条事件，总耗时 6964 ms
```

> 这个坑值得写进文档：它是「AI 写的代码看起来对，但语义错」的典型——语法、类型、lint 全过，只有真正跑起来才暴露。**说明必须逐项验证，不能信「应该没问题」。**

### 前端实现

- `useReducer` 管理 `statuses` 与 `payloads` 两张表，节点状态只增不改
- `AbortController` 控制重跑与卸载中断
- 手写 SSE 解析器：按 `\n\n` 切块、剥 `data:` 前缀、`JSON.parse` 加 try/catch（不依赖 `EventSource`，因为要用 POST）

### 验证方式（不只靠肉眼）

用无头 Edge + puppeteer 真实点击，断言页面内容：

```json
{
  "hasReport": true,
  "hasVerdict": true,
  "hasFit": true,
  "hasWeeks": true,
  "errors": []          // 零 console.error、零 pageerror
}
```

> 选择「机器断言」而不是「看一眼截图」：截图只能证明画出来了，不能证明点下去没报错。

---

## Day 2 · 接真模型 + 证据校验

### 需求

接 DeepSeek，但**不能让模型编数据**。做法是把「校验」当硬约束，而不是靠 prompt 求它别编。

### 三层防幻觉

| 层 | 手段 | 效果 |
|---|---|---|
| Prompt 层 | 明确「没写就填 null，写进 missing_fields」 | 降低编造倾向 |
| 校验层 | **evidence 必须能在原文里逐字找到**，找不到就把字段置 null | 编造的字段当场作废 |
| 流程层 | 校验不过 → 带着错误列表重试一次 → 仍不过就抛错，不返回给前端 | 保证前端看到的数据都过检 |

核心代码（`server/validate.ts`）：

```ts
for (const [field, quote] of Object.entries(evidence)) {
  if (!normalize(sourceText).includes(normalize(quote))) {
    setPath(data, field, null)   // 原文里没有 → 判定为编造
  }
}
```

### 实测

| 用例 | 输入 | 结果 | 耗时 |
|---|---|---|---|
| 完整通知 | 传智杯推文（含时间、官网、赛道） | 结构化 JSON，6 个字段全部带 evidence | 3.0s |
| 无效内容 | 「食堂红烧肉涨价」 | `is_event: false`，不硬编赛事 | 1.6s |
| 群聊模糊 | 「下周三截止」无主办方 | `deadline` 留 null，原文进 `raw_time_text`，警告 `relative_time_unresolved` | 2.4s |

第三例最能说明问题：模型**没有**把「下周三」猜成具体日期，而是保留原文并打警告。

### 顺手发现的现象

前端示例文本里没写主办方，于是卡片显示「主办方：未知 · 置信度 50%」——**这不是 bug，是正确行为**。如果它填了个「传智教育」出来，反而说明在编。

---

## Day 3 · 三个节点接真模型

### 核心设计决策：判定归规则，解释归模型

风险核查有两种做法：

- **让模型判**：「你觉得这个赛事靠谱吗」→ 每次结论可能不同，评委会问「凭什么」，答不上来
- **规则判、模型解释**：本地白名单 + 6 类风险信号算分，模型只把结论翻译成可执行动作

选了后者。好处是**同样的输入永远得到同样的分数**，可复现、可解释、可测试。

规则层（`server/rules/risk.ts`）的加减分：

| 信号 | 分值 |
|---|---|
| 白名单赛事名命中 | +30 |
| 原文出现官方域名 | +15 |
| 来源是群聊/社交平台 | −15 |
| 缺官方报名地址 | −10 |
| 缺主办方 | −10 |
| 命中「保过/包过/无需考试」等话术 | −30 |
| 已过截止时间 | −25 |

最终分数映射：≥80 低风险 / 60–79 待核实 / <60 高风险。

### 实测：一条诈骗话术

输入「无需考试、交钱即可拿证、保过保就业、保研必备、加微信」：

```
风险结论: { verdict: "red", score: 0, flags: [
  not_in_whitelist, unofficial_channel, no_official_url,
  no_deadline, no_organizer, scam_keyword ] }
```

### 发现并修复的逻辑冲突

第一次跑，这条诈骗赛事风险判了 **red**，但匹配节点仍给出「可试 62 分」——两个节点的结论自相矛盾。

原因：匹配只看「契合度」，不知道风险结论。

修复：在编排层加一条硬规则——**风险优先于匹配**，核查判红的赛事无论契合度多高都改判「不建议」，并把原因写进硬门槛。

```ts
if (risk.verdict === 'red' && matchResult.recommendation !== '不建议') {
  matchResult.recommendation = '不建议'
  matchResult.hard_blockers = [`风险核查未通过（权威度 ${risk.authority_score}），不建议投入时间`]
}
```

> 这条规则写在编排层而不是 prompt 里，因为它是**产品策略**，不该由模型决定。

### 全链路实测

四个节点串起来，一条完整推文跑完 **14.7 秒**：

```
+   16ms  extractor running
+ 2947ms  extractor done        → 结构化参赛信息
+ 6214ms  fact_checker done     → 低风险 95 分，白名单命中
+ 9763ms  matchmaker done       → 78 分，优先冲
+14728ms  planner done          → 5 周计划，5 个阶段
```

### 前端配套

- 新增个人画像表单（专业/年级/技能栈/目标/每周小时），存 `localStorage`，刷新不丢
- 报告面板扩展：风险标签、四维打分条、核验清单、分阶段计划
- 新增「可疑赛事」示例按钮，一键复现风险判定

## 踩坑总表

| # | 现象 | 根因 | 修复 | 证据 |
|---|---|---|---|---|
| 1 | npm 命令被拒 | PowerShell 执行策略 | 改 `RemoteSigned` | — |
| 2 | 找不到 git | 未写入 PATH | 运行时拼接 PATH | — |
| 3 | push 报 `C:/Program` | 凭据助手路径含空格 | 8.3 短路径 | `git credential fill` 通过 |
| 4 | SSE 零事件 | `req.on('close')` 语义变化 | 改 `res.on('close')` | 9 条事件 / 6.96s |
| 5 | tsx 热重载崩溃 | 依赖未装完就重载 | 重启 dev 服务 | `npm run dev` 正常 |
| 6 | 推送超时 | GitHub 网络不稳定 | 循环重试 | 最终 `main` 同步 |

---

## 可复现验证命令

```bash
# 1. 安装与构建
npm install
npm run build          # 期望：✓ built，0 error
npm run lint           # 期望：0 warning 0 error

# 2. 启动（前端 5173 / 后端 8787）
npm run dev

# 3. 验证 SSE 是真流式（看时间戳是否均匀递增）
curl -N -X POST http://localhost:8787/api/analyze \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"传智杯报名截止 2026-11-20\"}"

# 4. 切换真假数据
#    .env 里 USE_MOCK=true  → 本地假数据，不消耗额度
#    .env 里 USE_MOCK=false → 调用真实模型
```

---

## 材料清单

| 材料 | 位置 | 说明 |
|---|---|---|
| 产品演示动图 | `docs/prompt-log/demo.gif` | 真模型模式录制，含四节点依次点亮 |
| 本过程日志 | `docs/prompt-log/process-log.md` | 文字佐证 |
| 录屏（待补） | `docs/prompt-log/*.mp4` | 与 AI 协作的过程录像 |
| 代码演进 | GitHub 提交历史 | 8 次提交，按功能粒度拆分 |

---

## 复盘：AI 结对编程里什么最重要

1. **断言式验收**：不看「AI 说完成了」，看「跑出来的输出对不对」。上面第 4 个坑就是靠实测才发现的。
2. **契约先行**：先定 SSE 事件格式，再让 AI 分别写前后端，两边能独立替换。
3. **把「不许编」写成代码**：写在 prompt 里的约束会被模型遗忘，写在 `validate.ts` 里的不会。
4. **保留失败记录**：本文件刻意保留了踩坑过程。全是「一次通过」的项目，反而不可信。