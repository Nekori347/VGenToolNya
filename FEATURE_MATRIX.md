# 第一轮功能迁移与验证矩阵 · 2026-11-08

上次提前交付已撤销。以下状态对应本轮补齐后的源码；源码实现、公开网页验证、模拟原生状态验证和真实账户写入验收分别记录。

| 来源 | 用户能力 | 代码入口 | 当前证据与边界 |
|---|---|---|---|
| 小工具 0.6.0 | 常用客户新增/编辑/删除/备注/当前主页填入/拖拽与按钮排序 | src/clients.ts | 代码完整；资料/缓存/排序单元验证，侧栏集成验证 |
| 小工具 0.6.0 | 头像/横幅/显示名/真实 ID/公告/服务及作品更新时间/6h 缓存/失败15分钟重试 | src/clients.ts | 公开 GET 逻辑、缓存与数据保留验证；客户公开数据源与真实订单名片已只读验证 |
| 小工具 0.6.0 | 侧栏锚点/折叠/面板高度/行高度/快捷聊天/资料刷新 | src/clients.ts; src/native-runtime.ts | 真实侧栏/订单名片已只读验证；快捷聊天不在真实账户触发 |
| 小工具 0.6.0 | 保持未读/手动释放/回复边界/表态后已读开关 | src/read-gate.js; src/network-hooks.js | 模拟拦截和手动释放验证；真实读回执未发送 |
| 小工具 0.6.0 | 入站/出站已读状态、时间戳、状态条、紧凑 Emoji、Jump to present | src/stream-chat-adapter.js; entrypoints/content.ts | 本地 channel/Fiber 界面运行；原生回调接入，真实聊天未打开 |
| 小工具 0.6.0 | 统一聊天设置/诊断 start-stop-snapshot/HTTP-WS-SSE 观察/滚动输入事件/刷新恢复/monitor/报告导出 | src/native-runtime.ts; src/ui.ts | 代码完整；诊断不保存正文、URL、ID、凭据；未重放认证请求 |
| 快速标签 0.9.12 | 全局、标题、富文本描述、发现标签、搜索标签各自预设 | src/upload-adapter.js; src/preset-ui.ts | 模拟 Redux/Slate/Fiber 整链通过；真实标题/标签/发现表单及布局只读通过 |
| 快速标签 0.9.12 | 分类 chip 单项切换/标签备注/批量增删/清空/长度数量限制 | src/preset-ui.ts; src/upload-adapter.js | 原生回调集成通过；注释不混入标签值 |
| 快速标签 0.9.12 | 保存当前/组合源预设选取/编辑/删除/排序/原生选项表单/schema 保留 | src/preset-ui.ts | 代码完整；Discovery 原生多选、全局组合与 JSON 迁移通过 |
| 快速标签 0.9.12 | 独立模块开关/分组折叠/自动收起发现选项/深浅主题/内容匹配选择同步 | src/preset-ui.ts; src/native-runtime.ts | 代码完整；深浅主题、字段重建无重复集成通过 |
| 两份旧脚本 | 旧 v9 导出、GM 数据迁移桥、新配置导入导出、旧设置生效 | src/core.ts; src/migration.ts; Migration/ | 数据/schema/开关/备注保留测试；校验失败不写当前数据；未修改已有油猴脚本 |
| 新增 | 主要画师导航/作品/橱窗/订单/聊天/设置/弹窗本地词典 | src/locale/*; src/localize.ts | 中文/英文/上下双语，共用词典；公开源码文案发现、上下文分类、去重及漏翻导出；主要画师路由三模式与动态原生模拟验证，详见 UI_REMEDIATION.md |
| 新增 | 原位预设/独立备注/翻译/润色/独立回译/版本一步撤回复原 | src/editor.ts | 代码完整；两次 API 调用分离，历史和浏览器交互验证 |
| 新增 | 用户点击才插入/原生确认/保存原值与富文本恢复 | src/editor.ts; src/native-fields.ts | React、Slate、Redux 模拟验证；写入完成前禁用冲突操作 |
| 新增 | 聊天、订单、私人备注、最终交付、作品、橱窗字段独立预设 | src/native-runtime.ts; src/core.ts | 已接入原生目标探测；私人备注与聊天/作品/评价模拟验证 |
| 新增 | OpenAI/xAI/DeepSeek/Qwen/自定义、分服务商配置与 Key、分任务模型、测试与报错 | entrypoints/background.ts; src/core.ts; src/ui.ts | service worker 真实 HTTP → 本地合成兼容服务通过；模型/Key/429 路径通过；未使用真实服务商凭据 |
| 新增 | 客户选中文字按需汉化 | entrypoints/content.ts | 用户确认后发送所选文字；无自动聊天记录/订单上传 |
| 新增 | 随机评价/确认的10个原生标签/自定义多标签/意图语气预设/再生成/编辑/回译/插入 | src/review-tags.ts; src/editor.ts; src/native-fields.ts | 2026-11-08 真实公开前端源码确认标签与 action；集成验证；不提交评价 |
| 新增 | 订单客户主页/真实 ID/好评率异常/无文字差评/明细不可用/卡片复用刷新 | src/native-runtime.ts; src/client-review-adapter.js; entrypoints/content.ts | 真实来源 user.userID + clientReviewStats.percentagePositive/totalNegativeReviews；模拟数据通过，不误用准时率或星级 |
| 扩展基础 | 单一设置中心/共享主题与存储/单一页面观察器/SPA与弹窗重建 | entrypoints/content.ts; src/ui.ts | WXT MV3；重建、无重复、深浅 UI 集成通过；公共真实页面入口通过 |

## 真实环境限制与替代验证

原登录态访问阻断已由用户登录解除。真实画师侧栏、空白作品弹窗与订单名片/备注区域已只读验证，详见 evidence/authenticated-readonly-check.json。已确认真实标题 onChange、Showcase Redux Store、搜索标签回调（20个上限）、发现标签回调与 schema。

本次现场发现并修复：全局预设条挂到外层全宽容器、真实导航词典遗漏、禁用/只读订单字段误挂工具。全局条已在三种宽度验证，原生禁用字段已验证不再挂载。浏览器验证使用临时网络写入拦截；没有操作聊天、上传文件或调用真实写入来验收。Slate 描述和原生评价写入仍以现有源码及模拟证据为准，不能声明为真实写入通过。

API 实链测试使用临时扩展副本预授予 localhost，仅连接本地人工编写的非敏感兼容服务。正式 Demo 仍按用户点击授予实际接口域名；没有宣称已调用用户付费服务商。

完整原始函数索引见 evidence/source-audit.json；端到端结果见 evidence/integration-check.json；机器检查见 evidence/tests.txt 和 evidence/typecheck.txt。

## 同一轮 UI 与汉化整改

- 常用访问面板使用原始 vgt 结构、尺寸、图标和行布局，空列表自动收缩；管理入口进入同一设置中心。
- 上传原位使用原始 vtq 预设条与标签分类操作形式，选取即应用；后台匹配只更新选中状态，不触发写入。
- 移除右下角文字浮动入口。设置、语言和按需客户翻译入口整合到原生侧栏/导航区域。
- 本地词典按页面、组件、字段处理；动态资源从本站及官方静态 CDN 发现。无法确认来源的正文不记录。
- 新增真实主要路由三模式、原生窗口和缩放矩阵、SPA 原生侧栏导航、空白上传弹窗与视觉截图。现场验证仍无真实账户写入。
- 业务字段识别读取原生 React 的语义属性，避免依赖已汉化的占位文字；原生值不进入汉化报告。

原功能保留。最终安装与截图入口、分类样本覆盖和未实测边界见 UI_REMEDIATION.md 与 Demo/体验与验收.html。
