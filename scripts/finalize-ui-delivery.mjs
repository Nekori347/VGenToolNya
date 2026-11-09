import fs from 'node:fs/promises';import crypto from 'node:crypto';
const dir='evidence/ui-remediation/';const read=async file=>JSON.parse(await fs.readFile(dir+file,'utf8'));
const workflow=await read('workflow-coverage.json'),modal=await read('modal-coverage.json'),matrix=await read('layout-matrix.json'),theme=await read('theme-check.json'),spa=await read('spa-and-key-propagation.json'),scroll=await read('scroll-check.json'),live=await read('live-first.json');
const reports={...workflow.reports,...modal.reports};const rows=Object.entries(reports).sort(([a],[b])=>a.localeCompare(b)).map(([page,r])=>({page,hit:r.terms.filter(t=>t.translation!==null).length,miss:r.terms.filter(t=>t.translation===null).length}));
const integration=JSON.parse(await fs.readFile('evidence/integration-check.json','utf8'));
const summary={date:'2026-11-08',installDirectory:'F:\\[2]Ai\\VGenToolNya\\Demo\\chrome-mv3',bundleSHA256:crypto.createHash('sha256').update(await fs.readFile('Demo/chrome-mv3/content-scripts/content.js')).digest('hex'),unitTests:20,integrationChecks:integration.checks.length,vgenWriteRequests:integration.vgenWriteRequests,realRouteModeChecks:workflow.routes.length,geometryCases:matrix.length,allNativeZoomMatches:matrix.every(t=>t.zoom===t.nativeZoom),geometryOverflow:matrix.filter(t=>t.horizontalOverflow>0).length,geometryClipping:matrix.filter(t=>t.issues.length).length,workflowClipping:workflow.routes.filter(t=>t.clips.length).length,theme,scroll,coverage:rows,scope:'Counts cover classified observed native UI only, not all possible VGen UI.',unverified:['Real account writes, uploads, messages, receipts and reviews were not performed.','Native OS shortcut injection denied foreground activation; synthetic Ctrl propagation and actual Chrome zoom/window API verified.','Real chat and upload-dependent Slate UI covered by source and native-state simulation, not authenticated write acceptance.']};
await fs.writeFile(dir+'delivery-summary.json',JSON.stringify(summary,null,2));
const report=`# 第一轮 UI 与本地汉化整改交付 · 2026-11-08

可直接加载的扩展：\`F:\\[2]Ai\\VGenToolNya\\Demo\\chrome-mv3\`。安装压缩包为同目录上级的 \`Demo/VGenToolNya-UI-20261108.zip\`。图像对照入口：\`Demo/体验与验收.html\`。不需要修改源码。

## 已完成的整改

| 原设计与功能 | 本轮实现 |
|---|---|
| 常用访问 | 提取原始 vgt CSS 与结构，恢复标题点、细窄顶栏、图标、52px 行、头像/横幅/备注/更新信息、折叠及管理。空列表从约 230px 收缩到 ${live.modes[0].clientsHeight.toFixed(1)}px。统一中心保留完整增删编辑、尺寸与排序。 |
| 上传原位预设 | 提取原始 vtq 条形结构，标题、描述、发现和全局下拉选取即应用，＋保存、刷新、齿轮按当前字段定位统一管理；分类标签恢复分组、备注提示、整组增删、进度和单项切换。 |
| 统一入口 | 移除右下角文字浮动按钮；齿轮、语言与选中客户文字的翻译入口整合到原生侧栏/导航。共享后台、主题与配置。 |
| 汉化机制 | 已阅读专站项目实际源码；公开原生静态资源发现、页面/组件/字段分类、exact/regex/context 词典、命中/漏翻去重统计、导出与补词重验。未知且不能确认来源的正文不记录。 |
| 动态处理 | 单一 DOM 观察器使用增量根去重与自写值排除；直接接收资源事件，解决静态 CDN 与资源缓冲区满后漏发现。React 重建、SPA 与 Portal 按实际结构处理。 |
| 三种模式 | 默认中文；英文无损恢复；双语为原文主文字加下方 10px、400 字重中性灰副文字。保留 React 原始节点、富文本结构和原生字段值。原生下拉框拥有独立可操作的两行适配。 |
| 其他功能 | 已有翻译、独立回译、撤回恢复、评价与原生标签、客户 ID/差评、聊天与旧数据导入导出全部保留。业务字段从 React 元数据识别，不依赖被翻译后的 DOM。 |

## 验证结果

- TypeScript、生产构建、20 项行为测试、${integration.checks.length} 项浏览器集成检查通过；集成 VGen 写请求 ${integration.vgenWriteRequests}，页面错误 ${integration.errors.length}。
- 11 个主要路由分别检查中文、英文和双语，共 ${workflow.routes.length} 个路由模式样本；另有 Portfolio、空白作品弹窗三模式与真实 SPA 侧栏切页。没有声称真实聊天或真实账户写入通过。
- 1280×800、1366×768、1920×1080，各 80%/100%/125% 原生 Chrome 页面缩放、三种模式，共 ${matrix.length} 例；真实 getZoom 与设定一致，未出现横向溢出或检查范围内的副文本裁切。
- 页面、原生侧栏与空白上传弹窗的滚轮记录见 scroll-check.json。深浅主题的实际截图已检查，副文字按原生组件前景对比度选择中性灰，不继承按钮高亮色。
- 禁用/启用扩展对照：原生 Portfolio 文档高度均为 20293px，扩展没有额外撑高主文档。旧固定自动化视口已替换为原生视口，窗口与页面缩放可以独立变化；没有设置全局 overflow:hidden、固定页面高度或 CSS zoom。

## 观察到的原生 UI 分类覆盖

以下数字是已观察并成功分类的唯一页面/组件/字段词条，不是全站百分比，也不包含私人内容及不能确认来源的文本。

| 页面分类 | 已命中 | 未命中 |
|---|---:|---:|
${rows.map(r=>`| ${r.page} | ${r.hit} | ${r.miss} |`).join('\n')}

固定公开资源初始清单包含 1629 个候选文案，运行时继续发现新构建中的文案。词条来源证据与固定任务组件契约共同限制采集范围。设置中心“本地汉化”提供本地统计、漏翻导出、完整清单和上下文词典编辑。补充后立即重验，已补齐的词条不再计为漏翻。

## 明确保留的验证边界和缺口

- 真实账户没有保存、发送、评价、上传、修改订单或修改已读。聊天会话没有打开；真实文件上传后才挂载的 Slate、评价写入和聊天行为使用原源码及离线原生状态验证，等待用户本人真实验收。
- 未打开会触发账户安全、提现或提交副作用的确认流程。其未见状态和未来新增组件不能标记为真实视觉验收完成。
- 带真实保存日期的状态等未确认参数模板可保持英文；没有为凑覆盖率把私人参数或未分类 DOM 文本写入漏翻报告。作品、服务、文件夹名称、自定义标签和用户资料作为内容保留原文。
- Windows 系统拒绝自动化会话激活浏览器前台，原生 Ctrl 加减号/0 的系统键注入不能声明通过。替代证据：真实 Chrome 缩放 API、窗口调整、CSS zoom=1，以及 Ctrl 键合成事件不被扩展阻止。见 browser-shortcuts.json 与 spa-and-key-propagation.json。
- 没有发现本次检查范围内的已有业务回归。检查窗口保留临时网络只读拦截，正式 Demo 不含该测试拦截；真实写入应由用户在自己的正常 Chrome 安装后验收。

源码参考和许可边界见 reference/LOCALIZATION-SOURCES.md；未复制 GPL 或未授权项目源码。完整逐项能力对应仍见 FEATURE_MATRIX.md。
`;
await fs.writeFile('UI_REMEDIATION.md',report);
const img=(file,caption)=>`<figure><a href="../evidence/${file}"><img loading="lazy" src="../evidence/${file}" alt="${caption}"></a><figcaption>${caption}</figcaption></figure>`;
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VGenToolNya · 第一轮整改验收</title><style>body{font:15px/1.6 system-ui,sans-serif;margin:0;background:#f3f6fb;color:#252a37}main{max-width:1500px;margin:auto;padding:24px}h1{font-size:24px;border-top:3px solid #4f7cff;padding-top:12px}h2{font-size:18px;margin-top:30px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px}figure{margin:0;background:white;border:1px solid #dce2ed;border-radius:9px;overflow:hidden}img{width:100%;display:block}figcaption{padding:10px;color:#636d80}code{background:white;padding:3px 6px}a{color:#4f7cff}.note{padding:12px;border-left:3px solid #20cda7;background:white}</style><main><h1>VGenToolNya · 第一轮整改</h1><p>加载已解压的扩展目录：<code>F:\\[2]Ai\\VGenToolNya\\Demo\\chrome-mv3</code>。侧栏齿轮进入统一设置，旁边选择中文、英文或上下双语。</p><p class="note">20 项行为测试、${integration.checks.length} 项集成检查；${workflow.routes.length} 个主要路由模式样本；${matrix.length} 个窗口/原生缩放/语言组合。真实账户写入未执行。<a href="../UI_REMEDIATION.md">完整结果与边界</a></p><h2>Portfolio 前后对照</h2><p>整改前后为真实登录页面。保留作品标题与自定义标签原文；点击图片查看原尺寸。</p><div class="grid">${img('ui-remediation/before-portfolio-settled.png','整改前：大空面板、文字悬浮入口与导航漏翻')}${img('ui-remediation/after-portfolio-zh.png','整改后：原始紧凑组件、原位入口与中文主界面')}</div><h2>英文恢复与双语</h2><div class="grid">${img('ui-remediation/after-portfolio-en.png','英文原文模式')}${img('ui-remediation/after-portfolio-bilingual.png','英文主文字，下方为灰色中文副文字')}</div><h2>上传工具原位还原</h2><div class="grid">${img('authenticated-upload-readonly.png','此前上传界面的整改基线')}${img('ui-remediation/upload-bilingual.png','原位全局/标题预设与原生双语适配；空白表单只读检查')}</div><h2>主要画师页面</h2><div class="grid">${img('ui-remediation/workflow-commissions-bilingual.png','委托看板（私人内容已遮罩）')}${img('ui-remediation/workflow-commissions-services-bilingual.png','服务管理：原生状态与业务工具')}${img('ui-remediation/workflow-settings-bilingual.png','设置与内容偏好')}${img('ui-remediation/workflow-quests-bilingual.png','任务与认证说明')}</div><h2>明暗主题</h2><div class="grid">${img('ui-remediation/theme-light.png','浅色原生主题')}${img('ui-remediation/theme-dark.png','深色原生主题；浅色按钮也保留可读的中性灰副文本')}</div><p>完整截图、缩放和滚动记录位于 <code>evidence/ui-remediation</code>。未打开真实聊天，没有提交表单或上传文件；OS 快捷键自动注入受前台激活限制，不能标记为原生快捷键已实测通过。</p></main></html>`;
await fs.writeFile('Demo/体验与验收.html',html);console.log(JSON.stringify({coverage:rows,geometry:matrix.length,workflow:workflow.routes.length,hash:summary.bundleSHA256}));
