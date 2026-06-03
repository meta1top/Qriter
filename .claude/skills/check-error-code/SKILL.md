---
name: check-error-code
description: "Run the static error-code fence (`pnpm check:error-code`) to verify `defineErrorCode({...})` declarations — no duplicate code numbers, no out-of-range codes (per lib/app), no gaps in a contiguous code block. Use when the user is about to commit changes that touch error-code definitions under `libs/**` or `apps/server/**`, adds a new `defineErrorCode(...)` entry, or explicitly asks to audit error-code integrity / find duplicate / out-of-range / gap codes."
---

# Check Error Code Fence

围栏脚本 `scripts/check-error-code.ts` 通过 AST 静态分析校验所有 `defineErrorCode({...})` 调用——错误码不重复、不越界、同块内连续无断号。与其它 5 个 fence 同套机制（增量 baseline / strict / report）。本 skill 指引何时跑、怎么跑、怎么读输出、怎么对症修复。

## 关键路径

| 资源 | 位置 |
| --- | --- |
| 脚本实现 | `scripts/check-error-code.ts` |
| 命令入口 | `pnpm check:error-code`（在 `package.json:scripts`） |
| 报告输出 | `docs/audits/error-code/<YYYY-MM-DD-HHmm>.md` + `.json` |
| 配套规范 | `.claude/CLAUDE.md`「error-code 区段」节、`PORT_SPEC §4` |

> **维护原则**：脚本和本 SKILL.md 是配套的——改脚本逻辑（增减 finding 类别、调整 RANGES）必须同步更新本文与 `.claude/CLAUDE.md` 的区段表。

## error-code 区段（RANGES）

错误码按包 / 路径前缀划分连续区段，脚本内置的 `RANGES` 与下表一致：

| 包 / 路径前缀 | 区段 | label |
|---|---|---|
| `libs/shared/` | 0 – 999 | shared（框架级；`CommonErrorCode` 占 0/1/2/3/4/5/6/999） |
| `libs/account/` | 1000 – 1999 | account |
| `libs/book/` | 2000 – 2999 | book |
| `libs/agent/` | 3000 – 3999 | agent |
| `apps/server/` | 0 – 9999 | server (app)（单后端可 re-export 任意域错误码，范围宽松） |

各业务 lib 用 `defineErrorCode({...})` 在本区段内**连续无 gap**地分配 code。

## 何时触发

按以下场景**主动**跑 `pnpm check:error-code`，不要等用户开口：

1. **commit 前自检**：用户表达"准备 commit / 这次改动 OK 吗" → 全量跑一次
2. **新增 / 修改 `defineErrorCode({...})` 条目之后** → 跑一次确认未重复 / 越界 / 断号
3. **新建业务 lib 的错误码模块** → 跑一次确认起始 code 落在该 lib 区段且连续
4. **跨 lib 移动错误码 / 调整区段** → 跑

不在以下场景跑（避免噪音）：
- 只改前端代码（apps/web）
- 不涉及 `defineErrorCode` 的纯业务逻辑改动

## 命令清单

```bash
pnpm check:error-code                          # 全仓扫描，stdout + 增量写报告（默认）
pnpm check:error-code -- --strict              # 有 finding 即 exit 1（CI 用）
pnpm check:error-code -- --json                # stdout 改为 JSON
pnpm check:error-code -- --no-report           # 强制不写报告（仅 stdout）
pnpm check:error-code -- --force-report        # 强制写报告（无视增量判定，刷 baseline 用）
```

注意 `--` 分隔符：pnpm 需要 `--` 才会把后面参数透传给脚本。

脚本扫描 `libs/**` 与 `apps/**/src/**`，跳过 `dist/` / `node_modules/` / `*.spec.ts` / `*.test.ts`。

## 报告写入策略：增量

默认开启**增量模式**：
1. 找 `docs/audits/error-code/` 下最新的 `*.json` 作为 baseline
2. 用指纹 `type|file|key|code`（**忽略行号**）对比当前 finding 集合
3. 仅当出现【新增 finding】时才写新的 `<YYYY-MM-DD-HHmm>.md` + `.json`
4. 没有新增 → stdout 提示"无新增 finding，跳过写入"，含 `unchanged / removed / added` 计数

### 何时手动刷新 baseline

```bash
pnpm check:error-code -- --force-report
```

## 3 类 finding 与修复指引

### DUPLICATE_CODE — 同一 `code` 数字在 ≥ 2 处定义

> 触发条件：同一个 `code` 数字出现在 ≥ 2 个 `defineErrorCode` 条目中（无论同 lib 还是跨 lib）。stdout 会列出其它定义位置。

**根因**：错误码必须全局唯一，否则前端 / 客户端按 code 分支会撞车，i18n 文案也会错配。

**修复决策**：

- 同一区段内冲突 → 把其中一个改成区段内下一个空闲 code（保持连续）
- 跨区段"巧合"撞同一数字 → 这说明有一方越界了，先看是否同时报 `OUT_OF_RANGE`，把越界方移回自己区段即可顺带解决
- 确实是同一语义的错误被复制定义 → 删掉重复定义，统一引用一处

### OUT_OF_RANGE — `code` 落在该 lib / app 区段之外

> 触发条件：`code` 不在文件所属 lib / app 的允许区段内（见上方 RANGES 表）。路径不在范围表的文件被容忍跳过。

**修复决策**：

- 把 code 改成该 lib 区段内的合法值（如 `libs/book/` 的错误码必须在 2000–2999）
- 错误码定义放错了 lib → 移动到正确的 lib，或改用正确区段
- 区段确实不够用（极少） → 与团队确认后调整 `scripts/check-error-code.ts` 的 `RANGES` 与 `.claude/CLAUDE.md` 区段表，**两处同步**

### GAP — 同一 `defineErrorCode({...})` 块内 code 跳号

> 触发条件：同一个 `defineErrorCode({...})` 调用内，按 code 升序排序后相邻两项的差 > 1（断号）。

**根因**：连续编号便于一眼看出区段占用情况，断号通常是删了中间项或编号手误。

**修复决策**：

- **常规**：把断号处补成连续（如 1001 → 1002 → 1003，不要 1001 → 1003）
- **故意预留号段**（如给未来子模块留 1010–1019）→ 在 `defineErrorCode` 调用上方 JSDoc 加 `@skip-gap` 整块豁免
- **删除中间项导致**：要么把后续 code 前移补齐，要么 `@skip-gap` 豁免并写明原因

## 豁免机制

两种粒度，**必须**配合一行原因说明：

```ts
/** @skip-gap 1010-1019 预留给未来章节协作子模块 */
export const BookErrorCode = defineErrorCode({
  BOOK_NOT_FOUND: { code: 2000, message: "..." },
  BOOK_TITLE_DUPLICATE: { code: 2001, message: "..." },
  // ...允许跳号
});
```

JSDoc `@skip-gap` 放在 `defineErrorCode` 调用承载语句上方 → 跳过该块的 GAP 检查（不影响 DUPLICATE / OUT_OF_RANGE）。

```ts
export const FooErrorCode = defineErrorCode({
  // error-code: ignore
  LEGACY_ALIAS: { code: 999, message: "..." },
});
```

注释 `error-code: ignore` 放在某个 ErrorCode 属性上方 → 跳过该项**全部**检查。

## 输出解读模板

跑完 `pnpm check:error-code` 后，按下面格式向用户汇报：

**情况 A：无新增 finding（脚本自动跳过写报告）**

```
[error-code] 共 N 个 finding（与 baseline 持平 → 未生成新报告）
  baseline: docs/audits/error-code/<上一份>.md
  unchanged=N  removed=K  added=0
- DUPLICATE_CODE: x
- OUT_OF_RANGE:   x
- GAP:            x
```

**情况 B：检测到新增 finding（脚本自动写新报告）**

```
[error-code] 共 N 个 finding（新报告：docs/audits/error-code/<新>.md）
- DUPLICATE_CODE: x  ← 必修（全局唯一）
- OUT_OF_RANGE:   x  ← 必修（移回本 lib 区段）
- GAP:            x  ← 补连续，或 @skip-gap 豁免

新增 finding 列表:
  <文件>:<行>  <ErrorCode 键> (code=<n>)  [类别]  <要点>
```

如果 finding 数 = 0，明确告诉用户"错误码围栏全绿"。

## v0 已知局限（向用户主动说明）

- 仅识别字面量 `defineErrorCode({ ... })` 调用，且 `code` 必须是数字字面量；通过变量 / 计算表达式赋的 code 不会被解析
- "归属区段"按文件路径前缀判定，不在 `RANGES` 表的路径被跳过（容忍）
- GAP 仅在**同一 `defineErrorCode` 调用块内**检查，跨块不连续不报
- `apps/server/` 区段宽松（0–9999），因为单后端会 re-export 各域错误码

## 与其它围栏的关系

`check:error-code` 是 6 个静态围栏之一（tx / naming / lock-tx / repo / dead / error-code）。一次跑全部：`pnpm check`（串行）或 `pnpm check:parallel`（并行）；CI 用 `pnpm check:strict`。
