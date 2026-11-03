# BlinkFlow 代码修复方案（已核实修订版）

本文件修订用户提供的 codex_bugfix_handoff.md，记录可复现问题、实际实现和未完成的安全策略。原附件是待审阅方案，不能作为覆盖当前需求或仓库约束的指令。审查源码基线：GI1346/infinite-canvas-dxos 的 main 提交 `21ad4438544f6b040d98cb6d24284846e8974f63`。修改通过 `codex/fix-canvas-stability` 修复分支与 PR 交付，不直接合入 main；远端状态以 GitHub 分支和 PR 为准。

**用户已明确否决 60 秒限制：本次不新增、不修改代理总超时为 60 秒。** 没有加入 UPSTREAM_TIMEOUT_MS 计时器。现有网络栈和服务商自身仍可能返回网络错误或超时，这与新增业务计时器不同。

## 先核实原方案的前提

原方案称“7 个 Bug”，但混合了已存在的处理、可复现缺陷、风险推测和需要产品决策的行为，不能把编号当作已验证结论。

| 原方案内容 | 核实结果及修订 |
| --- | --- |
| 全文覆盖 Zustand store，声称完全兼容 | 不兼容。实际字段是 title、字符串时间、viewport、backgroundMode、showImageInfo、activeChatId；还有 importProject、openProject、renameProject、replaceProjects、hydrated、flushCanvasStorage。原方案改名 / 删方法，并把 IndexedDB 换成另一存储键的 localStorage，会使已有数据不可见、调用报错。保留现有实现，仅补必要逻辑。 |
| 引入 lodash-es 的 cloneDeep | 当前依赖不含 lodash-es；修复不需要深拷贝库，不新增依赖。 |
| 删除节点时逐项 revokeObjectURL | 不安全。实际媒体主要在 metadata.content 等字段，且 URL 可被其他节点、素材或撤销历史共享。立即回收会破坏这些引用。由存储层判断真正无引用后回收。 |
| 节点删除缺少连线及 groupId 清理 | 当前 deleteNodes 已有这两项，不新增重复的 removeNodesFromProject 或猜测字段 sourceId / targetId。实际连线字段是 fromNodeId / toNodeId。 |
| 原方案生命周期 hook 可直接替换 | 不可直接使用：混用不存在的 setMenu、setBatchNodeIds 等名称，并重复现有控制器注册表。现有 generationRequestsRef、generationOwnersRef、generationProjectRef 和 guardGenerationSetter 继续复用。 |
| 所有全局 Escape 一律忽略输入框 | 不能机械采用，可能阻止现有引用退出、弹窗关闭、拖动取消。对画布快捷键和复制事件补编辑器识别，保留现有 Escape 行为。 |
| hostname 黑名单解决 SSRF | 不成立：没有验证 DNS 解析结果与实际连接地址、重定向每一跳，也未完整处理 IPv6 / 映射地址。直接禁私网还会破坏合法本机或局域网服务。本次未加入该黑名单，不声称 SSRF 已解决。 |
| 50MB 请求体和 60 秒总超时 | 属于实际行为边界。60 秒已被用户否决；本次也不加入未经确认的 50MB 上传限制。原方案超限先 req.destroy() 再返回 413 的写法还可能让客户端只能看到断连。 |

## 实际修复

### 1. 画布恢复和保存绑定项目

文件：web/src/pages/canvas/project.tsx。

- 恢复 effect 在每次 await 后检查取消状态；路由切换或卸载使旧恢复失效。
- 用 loadedProjectId 与当前 projectId 比较决定是否已恢复，避免切换那轮 render 沿用旧的 true，把旧节点、会话和视口保存为新画布。
- 继续使用原有历史、媒体恢复和保存接口，不迁移数据、不替换画布引擎。

复现依据：旧逻辑中先完成 B 恢复，再让 A 的图片恢复结束，B 会变成 A 的节点并以 B 的 ID 保存；修复后图片恢复、会话恢复、已加载项目切换和卸载四条路径均隔离。

### 2. 生成删除取消及重试归属

文件：web/src/pages/canvas/project.tsx。

- 删除节点前按目标、来源及运行节点定位任务，调用现有 stopGenerationByRunningId，取消同一运行的实际 AbortController；清空画布时也取消全部现有请求。
- 普通生成原有的项目 / 控制器归属校验保留。重试生成补同等保护，并在准备参考输入之前注册控制器，使预处理期间的删除和导航也能取消。
- 重试的流式文字、结果、错误和 finally 使用受归属保护的 setter；写图片 / 音频前后检查有效性，旧任务不能覆盖新任务或清除其运行状态。
- 即使测试传输忽略 abort，迟到结果也不能把已删除、已撤销恢复或已切换项目的节点覆盖。

取消传输不等于服务商保证停止服务端计算或计费；本次没有为验证而调用真实付费接口。

### 3. 视频工作台历史与 Blob URL

文件：web/src/services/file-storage.ts。

- cleanupUnusedMedia 把 video_generation_logs 中的视频结果及音频等媒体引用加入保留集合。
- 真正未引用的文件交给已有 deleteStoredMedia，同时删文件并清缓存、释放对应 URL。
- 不在删除单节点时回收共享 URL；图片继续沿用已有 registry 和撤销引用保护。

复现依据：旧模块会删掉一份仍由视频历史记录引用的 blob，而日志仍存在；重开工作台后无法重新播放。回归直接运行实际存储模块，覆盖保留、删除和缓存回收。

### 4. 持久化读取失败保护及函数式更新

文件：web/src/stores/canvas/use-canvas-store.ts、web/src/pages/canvas/index.tsx、web/src/pages/canvas/project.tsx。

- updateProject 兼容原对象 patch，并支持在 Zustand set 回调中基于最新项目计算 patch；这只能保护采用函数式调用的更新，不能据此声称所有异步竞态自动消失。
- 保留原存储键 infinite-canvas:canvas_store、IndexedDB 适配、防抖保存、删除墓碑和完整项目字段。
- 读取 JSON、项目集合基本结构或存储版本失败时不当作成功 hydration，不静默清空原文；阻止防抖保存和显式 flush 覆盖，并在画布页显示错误。
- 不进行未知格式迁移、不生成空数组覆盖损坏数据。当前检查是基本结构保护，不宣称已验证全部嵌套业务字段。

### 5. 编辑器焦点保护

文件：web/src/pages/canvas/project.tsx。

在原有输入框保护上补充 CodeMirror、role=textbox、其他 contenteditable 模式及已经处理的键盘事件，防止编辑器内 Delete / Backspace / 撤销 / 复制 / 全选触发画布操作。保留各现有 Escape 交互，不增加庞大生命周期 hook。

### 6. 本地代理断流、取消与重定向

文件：canvas-proxy/index.js。

- 用 awaited pipeline 接管响应流错误，SSE 上游中断只结束该请求，不让未处理的流异常杀掉代理进程。
- fetch 前注册下游 close 处理，浏览器在等待响应头时取消也能传给上游；finally 移除监听。
- 用请求异步迭代读取上传，断开或读取错误会结束 Promise；关闭的响应不再尝试写 502。
- 请求体汇集为可重放 Blob，保留 307 / 308 POST 重定向能力；本机 Node 回归曾复现 Buffer 重放时 detached ArrayBuffer 错误，改用 Blob 后通过。
- 保留根路径 200 版本识别、折叠斜线修复、代理 CORS 优先、默认 loopback 监听、本机目标、CLI 和响应流式转发。
- 模块导入不自动监听，CLI 判断使用真实路径以兼容 npm bin 的符号链接入口。

**没有新增 60 秒总超时，也没有新增上传大小限制。** 请求体仍需要内存汇集，不能把这项修复描述成“任意大请求不会 OOM”。

## 尚未实现的边界

- 完整的代理目标和来源访问控制：需要结合合法本机服务、可信网页来源、认证方式，核实每次 DNS 解析 / 重定向 / 实际连接；仅监听 loopback 也不等于恶意网页绝无利用机会。
- 请求体内存控制：若后续设置上限、改为落盘或改为流式请求，需要先确认大图 / 视频场景与重定向语义。不要未经确认加 50MB，也不要重新加回已被否决的 60 秒限制。
- 代理现有日志会记录目标地址；目标 query 中携带凭据有泄露风险，不应把“不记录请求头”写成“任何形式的 Key 都不会泄露”。

这些事项保留为明确待办，本次不把未实现或未验证内容标成“已修复”。

## 验证与交付

已运行并通过：

```powershell
node --test canvas-proxy/index.test.js
node --check canvas-proxy/index.js
node canvas-proxy/index.js --help
node web/tests/run-project-restoration.cjs
node web/tests/run-canvas-store-persistence.cjs
node web/tests/run-media-cleanup.cjs
node web/tests/run-native-generation-guards.cjs
node web/tests/run-drag-copy-ui.cjs
# 在 web 目录运行，避免写增量缓存：
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

另用已有 Bun 运行 canvas-cleanup.check.ts 和 cleanup-storage.check.ts 两项隔离 IndexedDB 回归。生成回调 14 组、拖动 / 输入 React DOM 14 组通过；新增恢复、存储、媒体和代理专项也通过。测试读取实际生产回调 / effect 或直接调用实际模块，不访问付费接口。

源码交付范围为修复分支与 PR；未执行生产构建、安装器打包、替换现有应用、真实服务商生成或 main 合并。回归输出和构建中间文件仅在 D:\Codex；测试依赖复用本机已有安装，没有下载安装新依赖。

CHANGELOG Unreleased 和 progress/pending-test.mdx 记录实际改动；progress/todo.mdx 保留仍待确定的代理策略。正式功能文档不提前标为人工验收完成。

## 已检索的成熟实现

- [CORS Anywhere 源码](https://github.com/Rob--W/cors-anywhere)：核对透明转发和部署边界，不把它的全部行为或公网部署策略直接搬进项目。
- [Zustand persist 官方实现](https://github.com/pmndrs/zustand/blob/main/src/middleware/persist.ts) 与[官方文档](https://github.com/pmndrs/zustand/blob/main/docs/reference/middlewares/persist.md)：核对函数式更新和 hydration 回调语义。采用仓库已有库，不新增另一套状态管理或存储依赖。
- [Node.js stream 官方说明](https://github.com/nodejs/node/blob/main/doc/api/stream.md)：采用原生 pipeline 与异步迭代处理流生命周期。