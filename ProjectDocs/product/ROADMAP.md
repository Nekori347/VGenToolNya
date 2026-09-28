# ROADMAP — 开发阶段（已确认、按依赖排序）

> 存在某需求 ≠ 当前允许实施。禁止 Codex 一次实现全部。

## Iteration 1 — Core + 设置壳 + 旧数据兼容
- Goal：统一 Core（Lifecycle/Module Manager/Config Store/Clipboard）+ 设置壳（左侧导航+顶部 Tab+折叠）+ 旧键兼容读取迁移到 `vgen-nya.*`
- Modules：Core、Config Store、设置壳
- Non-goals：不改功能行为、不合并 Tag、不写新功能
- Dependencies：无
- Acceptance：旧 7 个 storage key 可读取并转换到新键；设置壳可打开
- L1：迁移一致性；L2：旧数据不丢
- Browser 验证：设置页打开
- STOP：旧键迁移失败或破坏读
- 模型强度：Medium（迁移属高风险 → 关键节点 High）

## Release Foundation — GitHub / Build / Stable Update 基础（位于 I1 与 I2 之间）

- Status：**REMOTE GATE**；公开仓库 `Nekori347/VGenToolNya` 与公开内容边界已建立，First Stable Release 尚未执行。
- Goal：建立正式 GitHub 源码与稳定 Release 基础，使后续大规模功能合并从第一天就有可复现构建、受控版本与安全更新路径。
- Timing：必须在 Iteration 1 Deployment Gate 通过后、现有 Iteration 2 大规模功能合并前完成；不改变后续 Iteration 编号。
- Deliverables：
  - 已审核并建立正式 Public GitHub 仓库；源码 push 与 Stable Release 保持分离。
  - 定义公开内容 allowlist；默认排除 `Research/`、`evidence/`、`staging/`、`附件/` 与未审核的 `ProjectDocs/`。
  - 建立 `.gitignore` 与首次提交 staged-files 审核；`.gitignore` 不能替代对已跟踪文件的审核。
  - 建立可复现 build，输出 `dist/VGenToolNya.user.js` 与优先的 `dist/VGenToolNya.meta.js`。
  - 定义 `APP_VERSION`、各配置域 `SCHEMA_VERSION`、Git tag、Release 名称与 artifact 内 `@version` 的一致性规则。
  - 规划稳定 Release asset URL 作为 `@updateURL` / `@downloadURL`；main 构建不得作为正式自动更新源。
  - 建立 Release Gate：完整测试、迁移/回滚、性能、artifact 内容、metadata URL、版本一致性与公开文件边界检查。
- Non-goals：本阶段不实现 Iteration 2 功能，不发布首次公开 Release，不把开发快照推送给正式用户。
- Dependencies：Iteration 1 Deployment Gate。
- Acceptance：从干净 checkout 可确定性生成两个 dist artifact；候选版本只有通过 Gate 才能成为 stable Release；更新测试证明用户配置不丢。
- STOP：artifact 引用 main/未审查 URL、版本不一致、迁移回归、私有研究或证据文件进入公开 staging。

## Iteration 2 — 快速 Tag 并入 Upload Assistant + 性能回归
- Status：**MERGED / COMPLETE**（`UPLOAD-LIVE-01`、自动化回归与 release check 已通过；PR #1 已以 merge commit `a167a50` 合并到 `main`）
- Goal：把快速 Tag 功能迁入 Upload Assistant，用 scoped observer + 生命周期替换整页扫描
- Modules：Upload Assistant（组合/标题/描述/发现/搜索/界面）
- Non-goals：不改数据语义
- Dependencies：I1 + Release Foundation
- Acceptance：上传页五类预设可用；性能回归通过（对照 PERF 登记表）
- L1：五类预设；L2：设置页；L3：性能
- Browser 验证：真实上传弹窗
- STOP：出现整页 MutationObserver 风暴
- 模型强度：Medium，性能回归 High

## Iteration 3 — 聊天现有功能修复 + 常用访问 Quick Chat
- Status：**MERGED / COMPLETE**（PR #2 已以 merge commit `1f2be4c` 合并到 `main`；Chat Core / Read Core / Quick Chat / UI integration、自动化与 release check 通过；Reply Boundary 保持非阻塞自然回归）
- Goal：迁移小工具 read/seen/timestamp/reaction + Frequent Clients；重写 `Chat.openUser`
- Modules：Chat Assistant、Frequent Clients
- Non-goals：不做全文搜索、不做评价
- Dependencies：I1
- Acceptance：read control 行为一致；Quick Chat 用统一入口打开现有会话
- L1：read/seen/timestamp/reaction；L2：常用访问、Quick Chat
- Browser 验证：真实聊天（只读观察）
- UI Gate：历史 `CHAT-UI-PARITY-01` 证据按 `UI_INTEGRATION_SAFE` 解释；Chat 最终视觉债务统一进入 `UI-FINAL-POLISH-01`
- STOP：破坏真实已读状态
- 模型强度：High（回归敏感）

## Iteration 4 — Text Preset Engine + Delivery/Note/Quick Reply
- Status：**MERGED / COMPLETE**（PR #3 已以 merge commit `b614266c` 合并到 `main`；`PRESET-LIVE-01 = PASS_CORE`、`UI_INTEGRATION_SAFE = PASS`）
- Goal：统一 Text Preset Engine，接入 Final Delivery、Private Note、Chat Quick Reply
- Modules：Preset Engine、Upload（Title/Description 复用）、Chat、Order
- Non-goals：不自动提交/发送/交付
- Dependencies：I2、I3
- Acceptance：五个 Context（Title、Description、Final Delivery、Private Note、Chat Quick Reply）共享 Engine contract、数据空间隔离、只填入不提交
- L1：Private Note / Chat Quick Reply；L2：Title/Description 回归
- Browser 验证：Private Note 输入区、聊天 composer
- STOP：Final Delivery 需改变订单状态才能验证 → 记录 DELIVERY-LIVE-01
- Live：`PRESET-LIVE-01 = PASS_CORE`、`TEXT-PRESET-UI-01 = PASS_INTEGRATION`；Private Note 为 `BLOCKED_AUTOSAVE_SAFETY`，Final Delivery 为 `BLOCKED_NEEDS_SAFE_ORDER_STATE`，两者均不得以真实客户写入换取验证
- 模型强度：Medium

## Iteration 5 — Order Assistant（Copy ID / URL / Client Background）
- Status：**AUTOMATION GATE PASS / LIVE PENDING**（`npm test` 95/95、L1 63/63、L2 73/73、`release:check` 26/26；尚未启动 Chrome）
- Goal：所有可打开的 Order / Commission Detail Panel 挂 Copy Client ID / Profile URL 与公开低星评价提醒（缓存）
- Modules：Order Assistant、Client Background / Client Review Context
- Non-goals：不改订单状态、不接飞书
- Dependencies：I1、I3
- Acceptance：不受订单状态限制，详情 client 区块可复制；rating<5 显示风险提醒并可查看相关公开评价内容
- L1：Copy Client ID / Profile URL；L2：公开评价提醒+合理缓存
- Browser 验证：`ORDER-BACKGROUND-LIVE-01 = SAFE_TEST_SURFACE_AVAILABLE`；只读使用当前待接收订单详情，不 Accept/Decline、不改状态、不发消息、不保存 Note、不 Delivery
- STOP：任何订单写操作
- 模型强度：Medium

## Iteration 6 — AI Review Assistant
- Goal：OpenAI Compatible 评价生成（英文+中文、复制/填入、防重复）
- Modules：Review Assistant
- Non-goals：不自动提交
- Dependencies：I1（Provider 配置区）
- Acceptance：生成/复制/填入可用；每 session 最多一次；API Key 本地安全
- L1：生成与防重复；L2：Provider 配置隔离
- Browser 验证：真实 Review UI（受 REVIEW-LIVE-01 限制）
- STOP：无真实 Review UI 时只做组件，不伪造
- 模型强度：Medium

## Iteration 7 — Chat Full-text Search
- Goal：关键词→消息→定位；先确认消息分页 API
- Modules：Chat Assistant
- Non-goals：不持续扫描整个聊天 DOM
- Dependencies：I3、消息分页 API 确认（BLOCKED_NEEDS_SAFE_CONVERSATION-01）
- Acceptance：搜索返回 conversation/message 并定位
- L1：分页拉取；L2：本地索引/搜索；L3：性能
- Browser 验证：已读历史会话观察分页请求
- STOP：无法取得分页 API → 仅实现已加载 DOM 搜索
- 模型强度：Medium（API 确认后）

## Iteration 8 — Export Adapter（不实现飞书）
- Goal：NormalizedOrder → ExportAdapter（预留 FeishuExporter）
- Modules：Order Assistant
- Non-goals：不接飞书账户、不写 Feishu integration
- Dependencies：I5
- Acceptance：订单可导出为结构化数据
- L1：导出字段完整；L2：adapter 接口
- Browser 验证：—
- STOP：—（不接飞书）
- 模型强度：Low/Medium

## 后续 UI Parity / Stable Polish Gates

- 各功能 Iteration Merge 前只要求 `FUNCTIONAL = PASS` 与 `UI_INTEGRATION_SAFE = PASS`；像素精修、最终图标和跨模块统一视觉不在每轮重复完成。
- `UPLOAD-UI-PARITY-01`：并入最终 Polish，定向核对旧 Quick Tag 的高亮、折叠/进度、剩余数量、点击区、主题、排序、刷新、黑名单与翻译兼容；不回溯重开 Iteration 2。
- `UI-FINAL-POLISH-01`：所有功能 Iteration 后、First Stable Release 前，重新定向审计两个只读附件的 CSS/DOM/布局/状态交互，统一 Design Tokens、Icons、Bubble/Read Status/Reaction、Frequent Clients、Upload、Order、Review、Settings、responsive/overflow、light/dark 与 Immersive Translate。必须通过用户人工视觉验收，否则不得发布 Stable。
