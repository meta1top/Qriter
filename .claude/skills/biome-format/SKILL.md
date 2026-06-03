---
name: biome-format
description: "每次代码变更后自动执行 Biome 格式化和 lint 修复 Apply to all relevant work in this repo."
---

# Biome 自动格式化与 Lint 修复

## 规则

每次修改、创建或重构代码文件后，必须执行以下命令：

```bash
biome check --write .
```

或针对特定文件：

```bash
npx biome check --write <文件路径>
```

## 说明

- `biome check --write .` 会同时执行格式化、lint 修复和 import 排序（仓库脚本入口为 `pnpm check:format`）
- 如果 biome 报告无法自动修复的错误，手动修复后再重新运行
- 不要跳过此步骤，确保代码风格一致
- 缩进 2 空格、双引号（Biome 默认）；禁止在 `if` 前一行放置注释（格式化会破坏结构）
- 执行前确保已安装依赖（`pnpm install`）
