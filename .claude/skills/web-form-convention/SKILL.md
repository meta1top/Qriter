---
name: web-form-convention
description: "前端表单规范（web）— 共享 Zod Schema + Form/FormItem + useSchema 多语言 Use when files matching apps/web/**/* change, or when explicitly invoked."
---

# 前端表单规范

适用范围：`apps/web` 前端应用。

> **i18n 适用性**：本规则中涉及 i18n 的部分（第 2 步 `useSchema` 与第 4 步 `useTranslations`）**强制要求**。应用已接入 next-intl 翻译 JSON（zh / en），不可裸字符串。

---

## 标准写法

### 1. 校验 Schema 放在共享类型库

- **必须**把表单的 Zod Schema 放进 `@qriter/types`（`libs/types`），前后端复用同一份：

  | 场景 | Schema 包 |
  |---|---|
  | 账号（登录 / 注册） | `@qriter/types`（`account/`） |
  | 书籍 / 章节 | `@qriter/types`（`book/`） |
  | 其余跨域通用 | `@qriter/types`（`common/`） |

- 为「页面表单」和「API 请求体」**分开命名**：前者描述用户输入（如明文密码、可选字段），后者描述网络载荷（如强制字段）。
  例：`CreateBookSchema`（API/表单共用时直接复用）vs 单独的表单 Schema（如需额外的确认密码字段）。

- 校验文案使用**可作为 i18n 键的中文短句**（如 `"请输入书名"`），写在 `z.string().min(1, { message: "…" })` 等位置。`useSchema` 会对这些 `message` 做 `t(message)` 翻译。

```ts
// libs/types/src/book/book.schema.ts
import { z } from "zod";

export const CreateBookSchema = z.object({
  title: z.string().min(1, { message: "请输入书名" }).describe("书名"),
  description: z.string().optional().describe("简介，可选"),
});

export type CreateBookInput = z.infer<typeof CreateBookSchema>;
```

### 2. `useSchema` ——校验文案多语言（强制）

- 包路径：`@qriter/design/hooks`
- 用法：

  ```ts
  import { useSchema } from "@qriter/design/hooks";

  const translatedSchema = useSchema(CreateBookSchema);
  ```

- 必须把 `translatedSchema` 传给 `<Form schema={translatedSchema}>`，**禁止**直接把未经过 `useSchema` 的静态 Schema 喂给 `<Form>`，否则切换语言时校验文案不会跟着翻译。

### 3. `Form` / `FormItem` ——表单结构

- 包路径：`@qriter/design`（barrel 已导出 `Form` / `FormItem` 等表单组件与 `Input`）

  ```ts
  import { Form, FormItem, Input } from "@qriter/design";
  ```

- 标准结构：

  ```tsx
  const form = Form.useForm<CreateBookInput>();
  const translatedSchema = useSchema(CreateBookSchema);

  <Form
    form={form}
    schema={translatedSchema}
    defaultValues={{ title: "", description: "" }}
    onSubmit={handleSubmit}
  >
    <FormItem label={t("titleLabel")} name="title">
      <Input placeholder={t("titlePlaceholder")} />
    </FormItem>
  </Form>
  ```

- **每个 `<FormItem>` 必须只有一个子节点**：`FormItem` 内部通过 `cloneElement` 把 `react-hook-form` 的 `value` / `onChange` 注入到唯一子节点。如果需要"输入框 + 显隐按钮"等组合控件，**整块封装成一个自定义组件**（内部再放 `<Input>` + `<Button>`），并把 `field` / `ref` 透传到真正的输入元素上。

### 4. 页面文案与标签（强制 i18n）

- 页面可见字符串（标题、`label`、`placeholder`、按钮文字）使用 `useTranslations()` 的 `t("…")`，与 `useSchema` 共用同一套 i18n 资源（详见 `i18n-page` 技能）。

### 5. 提交与副作用

- `onSubmit` 接收已通过 Zod 校验的强类型数据。
- 需要转换字段后再调 `rest` 时，在 `mutationFn` 或 `onSubmit` 里完成转换。

```ts
const handleSubmit = async (data: CreateBookInput) => {
  const res = await createBook({
    title: data.title,
    description: data.description || undefined,
  });
  if (res.data) onCreated(res.data.id);
};
```

### 6. `createI18nZodDto` 后端 DTO

- 后端 DTO 类由 `@qriter/shared` 提供的 `createI18nZodDto` 生成，前后端复用同一份 Zod Schema：

  ```ts
  import { createI18nZodDto } from "@qriter/shared";
  import { CreateBookSchema } from "@qriter/types";

  export class CreateBookDto extends createI18nZodDto(CreateBookSchema) {}
  ```

---

## 反模式（代码评审会被打回）

- ❌ 手写 `<form onSubmit>` + 多个 `useState` 管理字段 + 手动校验、手动错误展示，不使用 `Form` / `FormItem` / Zod
- ❌ 在页面文件里手写一份和 `@qriter/types` 不一致的 Zod 对象作为唯一来源——Schema 必须放在共享类型库，让前后端复用同一份
- ❌ `<FormItem>` 下放多个兄弟节点（如 `<Input>` 与 `<button>` 并列），导致 `control` 注入失败
- ❌ 跳过 `useSchema` 直接把静态 Schema 传给 `<Form>`——切换语言时校验文案不会翻译

---

## `Form.useForm()` 的注意事项

- `Form.useForm()` 返回的实例在子组件 `<Form>` 挂载并合并 `react-hook-form` 之前，**没有**完整的 `reset` / `handleSubmit` 等方法
- 在对话框未打开或子树未挂载时调用 `form.reset()` 会报错，应使用可选链 **`form.reset?.()`**
- 需要"每次打开都是空表"时，对 `<Form>` 使用递增 **`key`** 强制重挂载
