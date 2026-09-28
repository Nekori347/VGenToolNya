# ARCHITECTURE — 目标架构

仅记录当前采用的目标架构。

## Core（公共层）

- **Router / Lifecycle**：route + overlay/modal 生命周期，统一 mount/unmount/dispose；统一 mutation 调度 + 分区观察。
- **Module Manager**：模块注册/启用/卸载。
- **Config Store**：统一 `vgen-nya.*` 读写 + 旧键兼容读取。
- **Cache**：profile / review / 去重缓存。
- **Preset Engine**：通用文本预设（新建/编辑/删除/排序/插入/导入导出），供 Title/Description/Final Delivery/Private Note/Chat Quick Reply 共享；数据空间隔离。
- **VGen Adapter**：React Fiber/Redux（上传）、Stream Chat（聊天）、订单侧栏 DOM（订单/评价）适配入口。
- **Clipboard**、**Diagnostics**（激活才安装，停止恢复原生）。

## 功能模块

Upload Assistant / Order Assistant / Chat Assistant / Review Assistant / Frequent Clients / Developer。

## Build / Release 层

```
审核后的公开源码
  → 可复现 build
  → dist/VGenToolNya.user.js
  → dist/VGenToolNya.meta.js
  → Release Gate
  → Git tag + GitHub stable Release assets
  → Tampermonkey @updateURL / @downloadURL
```

- `dist/` 是生成物，不是手工维护的源码；只在通过 Gate 的候选提交/tag 中跟踪。metadata 字段来自 `release/release.config.json`，APP_VERSION 唯一来自 `package.json.version`。
- 正式自动更新 URL 指向 GitHub Release assets 的 `releases/latest/download` 稳定入口，不指向 main 的滚动构建。
- `VGenToolNya.meta.js` 只包含 Tampermonkey 更新检查所需 header；`VGenToolNya.user.js` 包含相同 `@version` 与完整脚本。
- `APP_VERSION` 使用发布版本规则；配置 schema 按 `vgen-nya.<domain>.vN` 独立演进。应用升级先读取当前 schema，再执行显式、幂等、写后校验的迁移。
- Release artifact 不包含 `Research/`、`evidence/`、`staging/`、附件或内部 ProjectDocs。公开仓库只纳入审核 allowlist；内部材料若需公开，必须先转写成独立、脱敏的公开文档。
- 正式仓库为 `https://github.com/Nekori347/VGenToolNya`。First Stable Release 前，本地 build 仍不生成 `@updateURL` / `@downloadURL`；正式 publish check 要求二者成对存在并匹配稳定 Release asset。

## Legacy Migration Deployment 边界

- Config Store 只能把当前存储驱动可见的旧键迁到新键；不得假定不同 userscript 的 GM storage 共享。
- 不使用 Tampermonkey 私有数据库路径、浏览器扩展内部数据库或其他未公开 hack。
- 跨旧 userscript 数据迁移必须通过经验证的 Bridge 或显式 Export/Import；写入新键后校验，旧脚本存储仍保留。
- Bridge 与 Importer 的公开发布边界见 `ProjectDocs/development/RELEASE.md`。

## Upload Assistant Runtime

- body 仅观察直属 portal 增删，不使用 subtree；ReactModal 尚未填充时允许有停止条件的局部短期 probe。
- Modal session 负责自己的 observer、listener、临时引用与订阅；Modal 离开即 unmount。
- VGen Adapter 从已识别 DOM 控件向父 Fiber 有界查找；正常运行不得遍历 Fiber child/sibling 子树。
- 日常 Upload preset 导入导出与 Legacy Migration envelope 是两个独立协议。

## Chat Runtime / UI 边界

- Chat session 只装饰已确认的当前 `.str-chat__channel`；稳定 Modal 内 channel root 替换时刷新同一 session，Overlay 离开时清理 observer、listener 与临时 UI。
- Read Control 必需的最小 fetch interception 与按需 Diagnostics hook 分离；Diagnostics 停止必须恢复其 WebSocket、EventSource、XHR 与 fetch 包装，不得关闭仍被 Read Control 使用的 hook。
- `●/✓`、Bubble 内状态长条、seen 与 timestamp 是相互独立的展示层；状态长条参与 Bubble 正常布局流，以适应翻译扩展造成的动态高度。
- 各功能 Iteration Merge Gate 只要求 `UI_INTEGRATION_SAFE`：不遮挡、不破坏交互/结构、无严重重叠且基本可读。跨模块最终视觉由 Stable Release 前的 `UI-FINAL-POLISH-01` 收口并交由用户人工验收，Architecture 不固化具体像素值。

## Chat Full-text Search 边界

- 复用 Iteration 3 的 Chat lifecycle / active channel detection（`StreamChatAdapter.findChannel()`），不建立第二套 Chat detector。
- `ChatHistoryAdapter` 只做只读历史读取：优先 `channel.query({messages:{limit,id_lt}})` 分页与 `channel.search`/`client.search` 服务端搜索（若暴露），fallback 为 `channel.state.messages`（已加载）+ 当前 session 内 scoped DOM 搜索；绝不调用 send/markRead/reaction/update。
- `ChatSearchEngine` 是唯一触发历史读取的入口（用户显式搜索才 fetch，打开会话不预取）；operation token 保证 stale 结果不回写；`ChatSearchCache` 为有界（max channels / max messages）per-channel LRU，不维护跨会话数据库。
- `ChatSearchLocator` 只在当前 session message list 内定位（`data-message-id`），优先原生 `scrollIntoView` + 短暂高亮，缺失时经 `channel.state.loadMore` 有界加载；不伪造消息 DOM、不改 Bubble 数据。
- 搜索 UI 挂载于 Chat session，不遮挡 composer / Jump to present；无 polling / sustained RAF / body subtree observer / documentElement observer；无搜索时近乎零额外网络开销。

## Order Detail / Client Background 边界

- Client Background / Client Review Context 随任何可打开的 Order / Commission Detail Panel mount/unmount，不按 pending 或其他订单状态分叉挂载。
- Iteration 5 的数据边界保持为公开 client identity/profile、公开评价与合理缓存；架构命名不授权额外抓取范围。
- Order Detail detector 只观察 body 直属 child；异步 portal 使用有数量与时限的局部 probe，确认 panel 后只保留当前 panel scoped observer。client identity 或 mount target 改变时替换单一 session。
- public identity 使用 `@handle`，profile URL 由 verified handle 构造 canonical VGen URL；内部 UUID 不冒充 Copy Client ID。
- Review adapter 只允许 GET，并区分 `SUCCESS / EMPTY / ERROR / UNAVAILABLE`。Cache 按稳定 public identity 去重并对错误使用短 TTL；失败不得显示为无低星评价。
- Review body 保持普通可选 DOM 文本并允许翻译；工具 controls 单独排除翻译，不在正文根使用全局 `notranslate`。
- Live 调查仅允许只读打开详情。不得 Accept、Decline、改状态、发消息、保存 Private Note 或执行 Delivery。

## Review Assistant Runtime / UI 边界

- Review Assistant 通过 `ReviewProviderAdapter`（config → request → parse → normalize → ReviewCandidate）生成，UI 不直接 fetch；Provider 请求只发送 keywords / length / star degree / system prompt，默认最小 context，不发送订单 ID、内部 UUID、消息历史或 Private Note。
- 网络层经统一 `ProviderTransport`：userscript 优先 `GM_xmlhttpRequest`（`@connect *` 仅用于用户配置的 Provider Base URL，绕过 CORS），无 GM 时回退 browser fetch；请求目标只能来自用户配置的 Base URL，Base URL 仅接受 `https://`（本机 `http://localhost`/`127.0.0.1` 除外）并剥离 query/hash。
- `ReviewSession` 是每次真实 Review UI 打开时的会话状态机（idle / generating / ready / error + generation lock），每 session 最多自动生成一次；关闭 abort 在途请求，dispose 后旧 response 不得回写。
- `ReviewEditorAdapter` 只负责 detect / read / fill，复用 `NativeTextTarget`；不含 submit。非空输入要求明确替换确认。
- 在 `REVIEW-LIVE-01` 验证真实 Review Surface 前，Review runtime 不安装 body/全局 observer、不轮询，仅保留 `openSurface` 入口供 synthetic fixture 与未来 live 使用；Review surface 不存在时 runtime 近乎零成本。
- API Key 仅存于 `vgen-nya.review-provider.v1`，不硬编码、不进日志/诊断/artifact；UI 以 password 字段 + 掩码显示。recent hash 历史为有界内存结构，不持久化。

## Text Preset Engine

- Engine 统一 collection、CRUD、排序、选择、preview 与带确认/回滚的 context export/import；五个 Context 使用独立 adapter 的 `serialize / deserialize / preview / validate / fill` contract。
- Upload Title / Description 继续直接使用既有 `vgen-nya.title-presets.v1` 与 `vgen-nya.description-presets.v1`，不建立复制 schema；Description adapter 校验 Slate，但存储与填入均保留原始 JSON 字符串。
- Chat Quick Reply、Private Note 与 Final Delivery 各使用独立 `vgen-nya.text-presets.*.v1` key。Context 间不得共享数组或把 Combination 摊平。损坏或非数组 collection 必须保持原值并拒绝后续 CRUD/import 覆盖。
- Chat Quick Reply 复用 Chat session/composer lifecycle；Order Note 实现只使用 body 直属 child observer 与精确 Note target，但在 `PRIVATE-NOTE-LIVE-01` 确认 autosave 安全前不得从正式 userscript entry 激活。Final Delivery 未验证 selector 不进入正常 runtime detector。
- Engine 与 Context Adapter 只提供 resolve + fill；API 不包含 send、save、deliver 或 submit。

## 关键约束

- Discovery/Search Tags 保持独立语义，不塞入文本预设模型。
- 组合预设不摊平成单项。
- Diagnostics 严禁常驻全局替换 XHR/WebSocket/fetch（PERF-07）。
- 聊天按 Stream Chat（`str-chat`）处理，不依赖 `/messages` route。
- 正式更新不得绕过 Release Gate，也不得以 main artifact 替代稳定通道。
