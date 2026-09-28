# SPEC — 稳定产品方向

仅记录已经正式确认的产品需求，不自行扩展。

## 已确认方向

- 项目最终目标：统一 VGen 工具箱（VGenToolNya），不是简单拼接两个 userscript。
- 设置 UI 采用三级结构：左侧大功能 → 顶部 Tab → 折叠 section。
- 大功能：基础 / 上传助手 / 订单助手 / 聊天助手 / 评价助手 / 常用访问 / 开发者。
- 预设语义：组合预设（Combination）与单项预设（Title/Description/Discovery/Search Tags）**保持分离**。
- Text Preset Engine 共享：Title、Description、Final Delivery、Private Note、Chat Quick Reply；Discovery/Search Tags 保持独立语义。
- 所有预设默认行为：只填入，不自动发送/提交/交付。
- 订单助手：Copy ID、Copy Profile URL、低星提醒（rating<5）。
- 评价助手：OpenAI Compatible，英文+中文对照，可复制/填入，不自动提交，防重复生成。
- 聊天助手：保留 read/seen/timestamp/reaction，统一 `Chat.openUser(...)` 入口，未来全文搜索。
- 模块完成采用双状态：业务行为 `FUNCTIONAL` 与交付视觉 `UI_POLISHED`；功能可先以 Demo UI 开发，但 Merge Gate 前必须完成对应 UI parity。
- Chat read 状态同时支持独立的 Bubble 内状态长条视觉层；该开关不得改变 `●/✓`、seen、timestamp 或 server read 逻辑，并必须兼容双语内容造成的动态高度。
- 性能是硬性产品要求：禁止整页 MutationObserver + 整页 querySelectorAll 作为默认架构。
- 飞书属于 Future Adapter，当前不实现。
- 第一次 Stable Release 前必须执行 `UI-FINAL-POLISH-01`，统一 Upload、Chat、Frequent Clients、Order、Review 与 Settings 的圆角、间距、层级、状态色和深浅主题；优先作为 VGen 原生视觉增强。

## 发布与更新（正式产品需求）

- VGenToolNya 必须建立正式 GitHub 仓库；GitHub 是正式源码与 Release 发布源。
- 正式构建必须生成可直接安装的 `dist/VGenToolNya.user.js`。
- Tampermonkey 更新优先使用原生机制；发布元数据必须规划 `@version`、`@updateURL`、`@downloadURL`。
- 优先生成独立的 `dist/VGenToolNya.meta.js`，供 Tampermonkey 轻量检查版本。
- 正式用户只跟随通过 Release Gate 的稳定 Release artifact，不直接跟随开发中的 main artifact。
- 只有 Release Gate 通过后才提升正式 `@version` 并发布相同版本的稳定 artifact。
- 脚本升级必须保留用户设置、Preset 与缓存；升级不得隐式删除旧键或旧 schema。
- `APP_VERSION` 与配置 `SCHEMA_VERSION` 是独立概念：应用发布不必导致 schema 升级，schema 迁移也不得伪装成应用版本判断。
- 设置中的“关于 / 更新”未来可显示当前版本、检查更新、GitHub 与更新日志；实际安装更新仍优先交给 Tampermonkey 原生机制。

## 安全边界（长期）

- VGen 默认只读；所有写入类操作（发消息/评价/交付/改状态/关注）不得自动执行。
- API Key 仅本地存储，不硬编码、不写文档、不进诊断报告。
- 公开仓库默认只包含经审核的源码、测试、构建配置与公开文档。`Research/`、`evidence/`、`staging/`、只读附件和内部项目记录不得未经审核直接公开。
