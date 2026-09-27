# VGenToolNya

VGenToolNya 是面向 VGen 创作者的统一 userscript 工具箱。当前代码完成了 Core、Settings Shell、旧配置兼容与本地 Release Foundation；后续功能按 Roadmap 分阶段进入。

Source repository: <https://github.com/Nekori347/VGenToolNya>

## 安装与更新

正式安装链接将在首个 GitHub Stable Release 建立后提供。不要把开发分支中的构建当作正式更新源。

正式版本通过 Tampermonkey 原生更新机制工作：轻量 `VGenToolNya.meta.js` 提供版本信息，Tampermonkey 检测到新版本后下载 `VGenToolNya.user.js`。两个 URL 只指向通过 Release Gate 的 GitHub Release assets。

## Legacy Migration

旧版 `VGen 快速标签` 与 `VGen小工具` 的配置位于彼此隔离的 userscript storage。迁移使用两个只读 Legacy Export Bridge 导出本地 JSON，再由 VGenToolNya Importer 预览、确认并写入新结构。旧 storage 不会自动删除，旧脚本也不会被自动卸载。

## 隐私与本地数据

- 配置、Preset、缓存和迁移文件默认只留在本地。
- Migration Bridge 不通过网页消息、浏览器 localStorage 或远端服务器传输配置。
- Release artifact 不包含内部 Research、证据、附件或浏览器测试 Profile。

## 开发与构建

```text
npm install
npm test
npm run build
npm run release:check
```

`npm run build` 生成：

- `dist/VGenToolNya.user.js`
- `dist/VGenToolNya.meta.js`

应用版本只来自 `package.json.version`。发布流程见 `ProjectDocs/development/RELEASE.md`。

## License

[MIT](LICENSE)
