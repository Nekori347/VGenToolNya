# 模块与数据流

- native.content.ts → native-runtime.ts：MAIN world 负责 Fiber、Redux、Slate、公开客户 GET、已读拦截和受控诊断；不接触 API Key。原生写入命令仅来自显式用户操作。
- content.ts：isolated world 的单个 MutationObserver，加输入/路由事件与聊天 monitor，维护原位挂载、客户侧栏和名片工具。自有 UI 变更排除，React 重建后恢复；仅向 MAIN 发送必要功能开关，客户/预设整库不暴露给页面。
- ui.ts、editor.ts、preset-ui.ts、clients.ts：一个设置中心与同一视觉变量，业务工具原位使用。编辑器生成与插入分离，备注不混入正文；保存原值后写入，等待原生确认。
- native-fields.ts、upload-adapter.js、stream-chat-adapter.js：回调/Store/Slate 操作，不模拟键盘，不替换 Slate DOM。
- background.ts：可信 storage 与分服务商 Key、域名权限检查、兼容 API。没有页面事件直接调用 AI 的通道。
- core.ts、migration.ts：配置、旧数据兼容、导入原子合并与外部迁移桥校验、API 请求及错误。生产模拟开关可关闭。
- locale/*、localize.ts：公开静态 UI 文案证据 + 页面/组件/字段上下文，原始文字与本地 exact/regex/context 词典共用三种模式。DOM 增量根队列和自写值记录避免自身修改回环；PerformanceObserver 直接接收新构建资源，不依赖已满的资源缓冲区。
- locale/reports.ts：只接收分类后的 UI 文案，按页面、组件、字段去重；重新核验会清除已补词的漏翻状态。报告独立于业务配置存储。
- locale/select.ts：双语原生单行下拉框适配，原生 select 继续拥有状态，只有用户明确选项才转发 input/change；退出模式恢复原控件。富文本 UI 保持 React 节点原位，中文集中为下方次级行。
- native-fields.fieldLabel：识别原生 React 语义元数据，不读字段值，也不依赖汉化后的 DOM。

数据持久化仅在扩展本地。诊断环形记录最多500条，保存事件类别、状态与统计，不保存正文、URL、ID、Cookie、Token。旧项目只读封存在 Archive。
