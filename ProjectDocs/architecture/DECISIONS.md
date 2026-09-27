# DECISIONS — 长期决定

已冻结的决定，后续直接复用，不重新讨论。

## 已确认决定

1. **附件源码为只读基线。** 未经用户明确授权，不得修改、覆盖、移动、删除 `附件` 下任何文件。
2. **不粗暴合并。** 快速 Tag 与工具箱不通过简单拼接合并。
3. **统一工具箱模块化结构。** 采用 Core + 功能模块结构。
4. **项目文档按需读取。** 不每轮全量注入整个文档库。
5. **统一存储命名空间 `vgen-nya.<domain>.v1`。** 新版只写新键；旧键保留兼容读取；不删除旧键。
6. **组合预设与单项预设数据独立。** 不把 global 预设摊平成四份，也不合成一个大 JSON。
7. **富文本（description）保持 Slate JSON 原文。** 只在展示层做 plain-text 互转。
8. **性能为硬约束。** 禁止 documentElement 级 MutationObserver + 整页 querySelectorAll 作为默认架构；禁止常驻全局网络钩子。
9. **聊天统一入口 `Chat.openUser(...)`。** 不依赖旧 `chat:open` 的原生模块硬编码；不同页面共用同一入口。
10. **VGen 聊天按 Stream Chat 处理。** channel cid `messaging:!members-<hash>`；不依赖 `/messages` route。
11. **所有预设只填入，不自动提交/发送/交付/改状态。**
12. **GitHub 是正式源码与 Release 发布源。** 正式公开仓库为 `Nekori347/VGenToolNya`；源码发布与 Stable Release 是两个独立 Gate。
13. **稳定 artifact 与开发 main 分离。** 正式用户只跟随通过 Release Gate 的 `dist/VGenToolNya.user.js`；优先同时发布 `dist/VGenToolNya.meta.js`，main 的开发产物不得成为正式更新源。
14. **Tampermonkey 原生更新优先。** 正式 metadata 使用 `@version`、`@updateURL`、`@downloadURL`；只有通过 Release Gate 才提升正式 `@version`。
15. **APP_VERSION 与 SCHEMA_VERSION 独立。** 应用版本用于发布和更新比较；配置 schema 由各 `vgen-nya.<domain>.vN` 独立表达，任何 schema 迁移均须幂等、写后校验并保留可恢复旧数据。
16. **公开内容默认拒绝、审核后放行。** `Research/`、`evidence/`、`staging/`、附件与内部 ProjectDocs 默认不公开；首次提交与每次 Release 均检查 allowlist，不能只依赖 `.gitignore`。
17. **不通过私有存储 hack 迁移。** 不直接操作 Tampermonkey 或浏览器扩展内部数据库；跨 userscript GM storage 只能使用公开支持且经过运行验证的 Bridge，或显式 Export/Import。
18. **APP_VERSION 单一来源为 `package.json.version`。** metadata 与运行时代码只允许在 build 时注入该值；禁止另设人工同步的版本常量。
19. **Stable 使用 GitHub Release assets。** `releases/latest/download/VGenToolNya.meta.js` 与 `.user.js` 是正式 Tampermonkey 通道；不采用 stable branch raw artifact，避免普通 push 改变用户更新内容。
20. **dist 只随 Gate 候选提交/tag 更新。** dist 纳入公开仓库与 Release 审核，但禁止手工编辑或随 main 每次 push 自动发布。
21. **MIT License。** 两个旧基线 metadata 均声明 MIT；VGenToolNya 延续 MIT，并在根目录保留完整 LICENSE。
22. **Remote Gate 不等于 Stable Release。** 首次源码 push 不创建 tag、Release 或 Tampermonkey update URL；Stable 通道只能在后续 First Release Gate 启用。
23. **Upload portal 采用两级作用域生命周期。** body 只观察直属 portal 增删，Modal 内部重绘由单 session 局部观察；不恢复 documentElement/body subtree 扫描。
24. **日常 preset 文件与迁移文件分离。** `vgen-nya.upload-presets` / 旧 `vgen-quick-presets` 仅用于用户日常 Upload preset；`vgen-nya.legacy-export` 只用于跨旧 userscript Migration。
