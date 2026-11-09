# 独立源码审查入口

公开仓库：https://github.com/Nekori347/VGenToolNya ，默认分支 main。功能来源为安全根 1f604fa3987114574bf4729d0ee7cb55e1c63719 的文件树；公开根提交不继承旧历史。

先读 CURRENT.md 的用户反馈，再对照完整原始脚本 reference/toolkit.user.js 和 reference/tags.user.js。源码在 src/、entrypoints/；WXT/TS 配置、依赖锁和测试均保留。安装与构建见 README.md。旧开发文档仅作为历史自评，不作为已验收的证据。

## 关键模块

| 功能 | 实际入口与用途 |
|---|---|
| 本地汉化 | `src/localize.ts`：节点处理、原文状态、模式切换和增量处理 |
| 词典与未命中采集 | `src/locale/catalog.ts`、`context.ts`、`sources.ts`、`reports.ts`；`src/dictionary.ts` 与 `src/locale/source-catalog.json` |
| 双语 UI 与布局 | `src/localize.ts` 内 `bilingualCSS`；`src/locale/select.ts` 下拉适配；`src/locale/appearance.ts` 副文本样式 |
| UI 组件、样式与图标 | `src/ui.ts`、`style.ts`、`extra-style.ts`、`legacy-ui.ts`、`icons.ts`、`preset-strip.ts` |
| 常用客户 | `src/clients.ts`：侧栏、管理和公开资料读取 |
| 作品上传预设 | `src/preset-ui.ts`、`src/upload-adapter.js`：预设管理及原生上传状态适配 |
| 聊天已读控制 | `src/read-gate.js`、`network-hooks.js`、`stream-chat-adapter.js` |
| AI 翻译编辑器与 API | `src/editor.ts`、`src/core.ts`、`entrypoints/background.ts` |
| 订单客户增强 | `src/client-review-adapter.js`、`src/native-runtime.ts`、`entrypoints/content.ts` |
| 评价生成 | `src/editor.ts`、`src/review-tags.ts`、`src/native-fields.ts` |
| 设置中心 | `src/ui.ts` 的 `settings`；`entrypoints/options/main.ts` |
| 页面桥接与旧数据迁移 | `entrypoints/native.content.ts`、`src/native-runtime.ts`；`src/migration.ts`、`Migration/` |
| 测试源码 | `tests/`、`scripts/integration-check.mjs`；测试结论不等于真实视觉验收 |

