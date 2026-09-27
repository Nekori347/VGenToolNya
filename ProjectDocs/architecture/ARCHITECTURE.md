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

## 关键约束

- Discovery/Search Tags 保持独立语义，不塞入文本预设模型。
- 组合预设不摊平成单项。
- Diagnostics 严禁常驻全局替换 XHR/WebSocket/fetch（PERF-07）。
- 聊天按 Stream Chat（`str-chat`）处理，不依赖 `/messages` route。
- 正式更新不得绕过 Release Gate，也不得以 main artifact 替代稳定通道。
