# SPEC — 稳定产品方向

仅记录已经正式确认的产品需求，不自行扩展。

## 已确认方向

- 项目最终目标：统一 VGen 工具箱（VGenToolNya），不是简单拼接两个 userscript。
- 设置 UI 采用三级结构：左侧大功能 → 顶部 Tab → 折叠 section。
- 大功能：基础 / 上传助手 / 订单助手 / 聊天助手 / 评价助手 / 常用访问 / 开发者。
- 预设语义：组合预设（Combination）与单项预设（Title/Description/Discovery/Search Tags）**保持分离**。
- Text Preset Engine 共享：Title、Description、Final Delivery、Private Note、Chat Quick Reply；Discovery/Search Tags 保持独立语义。
- 所有预设默认行为：只填入，不自动发送/提交/交付。
- 订单助手：保留 VGen 原生客户名片；在名片右上稳定 action column 内联 Copy ID / Copy Homepage 两个小 SVG 图标（不显示动作文字，Hover tooltip 为「复制 ID」「复制主页链接」），与原生私信按钮共存，绝不移动/复制/重新实现它。
- 评价助手：OpenAI Compatible，英文+中文对照，可复制/填入，不自动提交，防重复生成。
- 聊天助手：保留 read/seen/timestamp/reaction，统一 `Chat.openUser(...)` 入口；全文搜索为**全局搜索**（位于私信会话列表搜索区，magnifier-only 输入框，搜索所有聊天记录，结果含头像/显示名/@ID/snippet/时间，点击打开会话并尽力定位）。
- 功能 Iteration Merge Gate 采用双状态：业务行为 `FUNCTIONAL = PASS` 与集成安全 `UI_INTEGRATION_SAFE = PASS`。后者只要求不遮挡关键原生控件、不破坏点击/页面结构、无严重重叠，并在 light/dark 下基本可读；不代表最终视觉完成。
- Chat read 状态使用「状态线 + `●/✓` marker 同一条视觉水平轴」的 flow overlay row：状态线是接近消息内容宽度的 1–2px 细线（read 绿 / unread 红 / pending 粉），marker 在线右端、与线垂直居中，二者位于同一布局行（normal flow + overlay row），跟随双语翻译造成的 Bubble 高度变化；禁止 marker absolute 到 Bubble 固定 corner。该层不得改变 server read 逻辑。Reaction 位于 Bubble 下方（incoming 左对齐 / outgoing 右对齐，item ~18px、emoji ~12px）；Seen/Timestamp 为独立 full-width meta row（seen 左、时间右）。
- 性能是硬性产品要求：禁止整页 MutationObserver + 整页 querySelectorAll 作为默认架构。
- 飞书属于 Future Adapter，当前不实现。
- 第一次 Stable Release 前必须执行并由用户人工验收 `UI-FINAL-POLISH-01`，统一 Upload、Chat、Frequent Clients、Order、Review 与 Settings 的 radius、spacing、typography、按钮/图标、hover/active/disabled、状态色、背景层级和深浅主题；优先作为 VGen 原生视觉增强。无 overflow、单实例或自动化通过不能替代该视觉验收。
- 最终功能图标必须统一使用 SVG、CSS icon 或统一 icon component；Emoji / Unicode 仅允许作为开发阶段占位。
- `UI-FINAL-POLISH-01` 必须定向审计两个只读附件中的成熟 UX 细节，再形成统一 VGenToolNya Design System；旧 CSS 是参考基线，不要求 1:1 复制。
- Client Background 为 Client 名片下方**常驻细长状态条**（不做大 Card、不做「查看公开评价」按钮）。三级状态优先级 RED > YELLOW > GREEN：RED = 存在 `wouldRecommend === false` 或 legacy `rating <= 3`；YELLOW = 存在 4 星但无 RED 条件；GREEN = 全部 5 星 / Recommend；无记录 / 不可用 / 失败用 muted 中性色。Hover/Focus 状态条显示详情浮层，只列出需要关注的记录（4 星 / ≤3 星 / 不推荐，绝不列出五星正常评价），每条显示状态、日期、正文与复制 SVG；正文可选中、允许 Immersive Translate 翻译；浮层可停留，hover/focus 打开，Escape/blur/离开 hover region 关闭。
- Frequent Clients 与 Upload Assistant 以两个旧插件为 UI 母版：常用访问恢复 1px 蓝→绿 accent、20px 极薄 header、~52px 行、Banner 可读性渐变、29×29 avatar（radius 8px）+ 16×16 chat badge、18×18 icon button（11×11 SVG）；Upload 恢复 Quick Tag 的 copy-strip（2px 蓝→绿顶线）、搜索标签分组（chevron + X/N + 2px 蓝→绿 progress + 折叠 mini +/- + tag pill 状态 normal/hover/running/selected/removing/failed）。面板主题由真实侧栏表面明暗检测决定，而非仅 `prefers-color-scheme`。

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
