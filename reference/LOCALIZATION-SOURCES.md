# 专站汉化机制参考与许可边界

2026-11-08 已阅读实际实现文件，而非仅 README。下面项目用于理解机制；本项目的 `src/locale/*` 与本轮 `src/localize.ts` 为独立实现，未复制其源码或词典。

| 项目实际源码 | 阅读到的机制 | 许可处理 |
|---|---|---|
| [maboloshi/main.user.js](https://github.com/maboloshi/github-chinese/blob/gh-pages/main.user.js) | `buildPageConfig`、`MissedTermsManager`、按页组合、祖先根去重、TreeWalker | GPL-3.0；未复制源码 |
| [Howe813/content.js](https://github.com/Howe813/j7tracker-zh/blob/main/content.js)、[dict.js](https://github.com/Howe813/j7tracker-zh/blob/main/dict.js) | exact/regex/context、用户内容排除及 UI 岛重新纳入、自写节点记录 | 未发现根目录许可证；未复制源码 |
| [KawaYiLab/devin-chinese.user.js](https://github.com/KawaYiLab/Devin-Web-Chinese/blob/main/devin-chinese.user.js) | 实际用户脚本末尾的增量树/属性队列、原始文字和自写值记录 | MIT；仍采用独立实现 |
| [saiyajiang/GitHub-zh-CN.user.js](https://github.com/saiyajiang/GitHub-zh-CN/blob/main/GitHub-zh-CN.user.js) | 页面词典、漏翻采集、噪声排除 | MIT；未复制源码 |
| [GitRuozhi/main.user.js](https://github.com/GitRuozhi/Github-Bilingual/blob/main/main.user.js) | 原文/译文配对与去重；其短文单行双语不符合本项目要求 | GPL-3.0；未复制源码 |

VGen 对应实现：公开 `vgen.co/_next/static/*` 与 `assets.vgen.co/<build>/_next/static/*` 构建资源中的 UI 属性文字，不读取 NextData、账户 API 或输入值；按原生组件和页面分类后才进入本地报告。已有公开资源可观察到 i18next/Stream 相关基础设施，尚未找到可直接用于整个画师工作台的中文语言包。不能据此断言网站没有其他语言资源。

诊断报告存于扩展本地存储。未知且没有公开源码文字证据或明确原生 UI 标记的内容默认不采集。未命中导出不包含完整 DOM、账户 ID、私信或表单值。四个主要项目的具体源码定位已用于实现，参考记录本身不是交付完成依据。
