# RELEASE — Stable GitHub / Tampermonkey 发布流程

## 1. 发布边界

- 正式 Public 仓库：`https://github.com/Nekori347/VGenToolNya`。
- 开发源码位于 Git `main`；main 的任意 commit 都不是正式用户更新源。
- 正式更新只使用通过 Release Gate 后上传到 GitHub Stable Release 的两个 asset：
  - `VGenToolNya.meta.js`
  - `VGenToolNya.user.js`
- `dist/` 是 build 生成物。它在经过 Release Gate 的候选提交/tag 中纳入版本控制，禁止手工编辑。
- 内部目录 `Research/`、`evidence/`、`staging/`、`附件/` 与未列入公开 allowlist 的 ProjectDocs 不进入公开仓库。

## 2. 版本单一来源

- `APP_VERSION`：唯一来源为 `package.json.version`。Build 将该值注入两个 artifact 的 `@version` 与运行时代码。
- `SCHEMA_VERSION`：由 `vgen-nya.<domain>.vN` 配置键及相应 migration/validator 管理；它不从 APP_VERSION 推导。
- `LEGACY_EXPORT_SCHEMA_VERSION`：`src/migration/legacy-export-schema.js` 独立维护，用于 Bridge JSON envelope；它不从 APP_VERSION 或配置 schema 推导。
- 修改 APP_VERSION 不会自动迁移配置；修改配置 schema 必须新增显式、幂等、写后校验且可恢复的 migration。

## 3. 自动更新通道

选择 **GitHub Release assets**，不选择 stable branch raw artifact：

- Release assets 只能在 Gate 后由明确发布动作产生，避免 main 或 stable branch 的普通 push 意外成为用户更新。
- 冻结的未来稳定入口为：`https://github.com/Nekori347/VGenToolNya/releases/latest/download`。
- Build 时通过 `VGEN_NYA_RELEASE_BASE_URL` 提供已冻结的真实 base URL；未配置时本地 artifact 故意省略 `@updateURL` / `@downloadURL`，不写虚构地址。
- Tampermonkey 流程：`@updateURL` → `VGenToolNya.meta.js` → 比较 `@version` → `@downloadURL` → `VGenToolNya.user.js`。
- 不实现定时下载、`eval` 或脚本自覆盖。

## 4. 首次及后续 Stable Release

1. 确认 GitHub owner、repository name、Public/Private，并建立 remote。
2. 完成功能 Gate；运行 L1/L2/Deployment/性能回归。
   - 每个功能 Iteration 的 Merge Gate 要求 `FUNCTIONAL = PASS` 与 `UI_INTEGRATION_SAFE = PASS`。
   - First Stable Release 另要求 `UI-FINAL-POLISH-01 = PASS`，且必须包含用户人工视觉验收；自动化结果不能代替。
3. 更新 `CHANGELOG.md`，将候选内容从 Unreleased 整理到目标版本。
4. 只修改 `package.json.version` 提升 APP_VERSION；同步 lockfile。
5. 配置真实 stable base URL 后运行 `npm run release:check:publish`。
6. 审核 `git status`、公开文件 allowlist、`dist/` diff 与 metadata URL。
7. 创建带注释 Git tag `v<APP_VERSION>`，推送审核后的提交和 tag。
8. 创建非 draft、非 prerelease 的 GitHub Release，上传两个 dist asset。
9. 从 Release 页面重新下载两个 asset，复核 SHA-256、metadata、安装和更新路径。
10. 仅在上述检查通过后将该 Release 作为 Stable；Tampermonkey 不读取 main artifact。

发布前禁止静默重写已存在的 tag 或 Release asset。同一版本 artifact 若内容变化，必须提升 APP_VERSION。

## 5. Release Gate 命令

```text
npm test
npm run test:l1
npm run test:l2
npm run test:deployment-l2
npm run build
npm run build:migration
npm run release:check
```

正式发布候选还必须设置 `VGEN_NYA_RELEASE_BASE_URL` 并运行：

```text
npm run release:check:publish
```

`release:check` 验证双次构建一致、APP_VERSION、metadata、grant、JavaScript 可解析、敏感信息、本机路径、内部材料、公开 allowlist、Bridge 隔离及 stable URL 规则。

## 6. Legacy Bridge 发布关系

- `VGen 快速标签` Bridge `0.9.13`、`VGen小工具` Bridge `0.6.1` 与 VGenToolNya 是三个不同 identity / artifact，不得合并成一个 userscript。
- Bridge 应在首个支持旧配置导入的 VGenToolNya Stable Release 之前或同时提供，作为旧脚本的过渡更新。
- Bridge 至少维护一个稳定迁移窗口；迁移说明、Importer 和本地 export JSON 回滚路径在窗口内持续可用。
- 用户只有在两个来源都成功导出、Importer 确认完成、且本地保留 JSON 后，才可自行禁用旧脚本。
- VGenToolNya 永不自动卸载旧脚本，也永不删除其 GM storage。

## 7. GitHub Remote Gate

- Owner：`Nekori347`
- Repository：`VGenToolNya`
- Visibility：Public
- Remote：`origin = https://github.com/Nekori347/VGenToolNya.git`
- Remote Gate 只发布审核后的初始源码；不创建 tag、GitHub Release、Stable asset 或正式 update URL。
