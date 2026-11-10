# Prompt 链重建（三次核心迭代）

> **材料性质说明**
>
> 本文不是 AI 工具的原始导出。原始对话在开发过程中未被保留，这里依据 Git 提交历史、
> `process-log.md`、代码注释与测试文件**事后重建**了三次关键迭代的交互过程。
>
> 重建内容可被仓库证据交叉验证（提交哈希、文件变更、测试用例、评测记录），
> 但**不能替代原始截图或录屏**。提交参赛材料时，建议同时附上真实 AI 工具的对话截图；
> 若无法提供，请保留本文的「材料性质说明」，不要删除。

---

## 迭代一：SSE 一个事件都推不出来

### 目标

前端点了「开始分析」之后，后端应该逐节点推送事件，四个卡片依次点亮。当前现象：请求返回 200，前端状态栏一直停在 0/4。

### 我的 Prompt

> 前端点了开始分析，网络面板里 /api/analyze 返回 200 而且是 text/event-stream，但是页面一个节点都没动。后端日志显示四个 Agent 都跑完了。帮我看下为什么前端收不到事件。

### AI 的建议（要点）

1. 怀疑前端 `createSseParser` 的分包逻辑，建议先打印收到的原始 chunk；
2. 建议改用浏览器原生 `EventSource`，说「这样更标准」；
3. 提出可能是 Vite 代理把流缓冲了。

### 我的判断

第 2 条不采纳：我们用的是 POST 携带长文本，`EventSource` 只支持 GET，改它等于推翻接口设计。
第 3 条可以先验证：在 `vite.config.ts` 里加 `configure` 关掉缓冲，但更快的验证是直接用 curl 打 8787 端口绕开代理。

结果：curl 直连 8787 也是零事件，说明问题在后端，不在代理。**把范围缩小到后端是本轮最关键的动作。**

### 继续追问

> 直接 curl 8787 也没有任何 data 行，所以不是代理的问题。后端在 res.write 之前有没有可能已经认定客户端断开了？

### AI 的修正建议

指出 Node 16+ 的行为变化：`req.on('close')` 在**请求体读取完毕**后就会触发，不代表连接关闭。代码里用 `aborted` 标记并发起判断，导致每个正常请求都被判定为「客户端已断开」，于是所有 `res.write` 被跳过。

### 我的处理

改为监听 `res.on('close')`，并用 `res.writableEnded` 兜底：

```ts
res.on('close', () => {
  aborted = true
})
```

### 证据

| 项目 | 内容 |
|---|---|
| 影响文件 | `server/index.ts` |
| 验证方式 | `curl -N -X POST localhost:8787/api/analyze`，从 0 个事件变为 9 个事件，总耗时 6.96 秒 |
| 记录位置 | `process-log.md`「踩坑总表」 |

### 复盘

AI 第一反应给出的三个方向里，两个是错的（EventSource、代理）。真正有效的动作是我自己设计的**二分验证**（绕开代理直连后端）。这说明：**AI 擅长解释机制，不擅长定位现场**，定位要靠自己缩小范围。

---

## 迭代二：风险判红，匹配却说「可试」

### 目标

风险核查已经判 `red` 的赛事，右侧报告仍然显示「建议：可试」。这是逻辑矛盾，会让用户误以为可以报名。

### 我的 Prompt

> 现在有个矛盾：风险核查给了红牌，但匹配评估说可以试，报告里两个结论打架。我不想靠改 prompt 让模型自己协调，有没有办法在代码层面保证红牌一定覆盖推荐？

### AI 的建议（要点）

1. 在 matchmaker 的 prompt 里增加「如果上游风险为红，直接返回不建议」；
2. 或者在最终报告渲染时判断，如果 verdict 是 red 就把建议文案替换掉。

### 我的判断

第 1 条不可靠：模型不保证遵守，而且同一份输入可能给出不同结论，违反「判定归规则」的原则。
第 2 条是治标：数据层仍是矛盾状态，导出 Markdown 或将来接别的界面时会漏掉。

所以选择第三条路——**在编排层做硬覆盖**，让矛盾数据在进入前端之前就被修正：

```ts
if (risk.verdict === 'red' && matchResult.recommendation !== '不建议') {
  matchResult.recommendation = '不建议'
  matchResult.hard_blockers = [
    `风险核查未通过（权威度 ${risk.authority_score}），不建议投入时间`,
  ]
}
```

### 证据

| 项目 | 内容 |
|---|---|
| 影响文件 | `server/index.ts` |
| 验证方式 | 诈骗用例：`verdict: "red"`、`authority_score: 0`、6 条风险标签，`recommendation` 被改写为「不建议」并附带硬性阻断理由 |
| 记录位置 | `eval/cases.json` 的 `scam-notice` 用例断言 `recommendation === "不建议"` |

### 复盘

这一类问题的本质是**多个模型输出之间没有仲裁者**。给 AI 加一句 prompt 是「请求它配合」，在编排层写死是「保证它配合」。凡是业务红线，都应该选后者。

这条经验后来沉淀成项目的设计原则：**判定归规则，解释归模型**。

---

## 迭代三：防幻觉的置空打在了错误路径上

### 目标

`validate.ts` 负责把「evidence 在原文里找不到」的字段置空。功能上线后一切正常，评测也是 12/12。

### 我的 Prompt

> 我怀疑 evidence 校验没真正生效。帮我检查 validate.ts 里 setPath 的字段名和实际数据结构是否对得上，特别是 registration.deadline 这种带点的路径。

### AI 的建议（要点）

AI 起初回复「setPath 会按点号分段创建嵌套对象，逻辑正确」。

### 我的判断

这个回答只验证了函数本身，没有验证**路径是否存在于数据结构里**。我继续追问：

> 那如果 data 里根本没有 data.registration 这一层，只有 data.event.registration，setPath 会发生什么？

### AI 的修正

承认这时会**新建一个顶层 `registration` 对象**，把 null 写进去，而 `event.registration.deadline` 保持原值——校验器以为自己处理了，实际防线空转。

### 我的处理

加一层路径解析，先按原字段名找，找不到再按 `event.` 前缀找：

```ts
function resolveFieldPath(data: any, field: string): string {
  const candidates = [field, `event.${field}`]
  for (const candidate of candidates) {
    if (getPath(data, candidate) !== undefined) return candidate
  }
  return `event.${field}`
}
```

同时补单元测试，其中第 2 条断言专门检查这个 bug：

```ts
check('event.registration.deadline 被置空', result.data.event.registration.deadline === null)
check('没有在错误路径上创建多余字段', result.data.registration === undefined)
```

### 证据

| 项目 | 内容 |
|---|---|
| 影响文件 | `server/validate.ts`、`eval/validate.test.ts` |
| 提交 | `ecac6bb` |
| 验证方式 | `npm run test:validate` → 12 项断言全部通过 |
| 记录位置 | `process-log.md`「Day 6 · 自查」 |

### 复盘

这个 bug **端到端跑不出来**：接口 200、页面正常、评测全绿，只是防线空转。

它暴露了一类 AI 协作的典型陷阱：**AI 会验证「代码逻辑是否自洽」，但不会验证「这个逻辑作用的对象是否存在」**。凡是「我以为它在生效」的关键路径，都必须有一条能证明它真的生效的断言。

---

## 迭代模式总结

三次迭代呈现出同一个模式：

| 阶段 | AI 擅长 | 人必须做 |
|---|---|---|
| 定位 | 解释机制、列举可能原因 | 设计二分验证，缩小范围 |
| 决策 | 给出多条方案 | 判断哪条符合业务红线 |
| 验证 | 写测试代码 | 决定「什么算真的通过」 |

一句话：**AI 提供选项，人负责收敛。**

---

## 附：如何补充原始材料

如果需要把本文升级为符合大赛要求的原始材料：

1. 在你的 AI 工具里找到这三次对话（关键词：`SSE`、`红牌`、`setPath`）；
2. 截图时**同时包含你的提问和 AI 的完整回答**，不要只截结论；
3. 按 `iteration-1-sse.png`、`iteration-2-risk.png`、`iteration-3-validate.png` 命名，放入本目录；
4. 在本文各节的「证据」表格里补一行截图文件名。