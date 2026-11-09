# 第一轮接手入口

先读 CURRENT.md、FEATURE_MATRIX.md，按需读 ARCHITECTURE.md。完整原任务 reference/TASK.md，方法论 reference/AI开发手册_v0.21.md。

唯一主动写入目录就是本项目。Archive/Legacy/2026-11-08 不修改。两份原始脚本 reference/toolkit.user.js、reference/tags.user.js 不覆盖。

上次提前交付已撤销；本轮已补齐主要功能，不再沿用旧“7项测试+首页入口=交付”的判断。真实账号严禁自动写入、打开聊天取证、读取或导出凭据、向 AI 发送真实内容。仅用户主动插入/打开/提交等操作可使用相应能力。

用户已登录，访问阻断已解除；真实作品弹窗/画师侧栏/订单名片与备注工具完成只读验证。证据在 evidence/authenticated-readonly-check.json。当前可恢复的测试浏览器使用 .cache/interactive-vgen-profile，调试端口9335；不要读取 profile 凭据。临时非只读请求拦截仍开启。聊天、真实上传/保存/提交没有执行。
