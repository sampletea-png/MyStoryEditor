# Windows 本地桌面技术与离线数据方案研究

- 对应票据：[调研 Windows 本地桌面技术与离线数据方案 #3](https://github.com/sampletea-png/MyStoryEditor/issues/3)
- 研究日期：2026-08-30
- 研究边界：Windows 首发、本地优先、单用户；覆盖多作品、按章节组织的结构化正文、故事线与事件、角色、地点、世界设定及其关联；需要自动保存、历史版本、备份、搜索和导出。
- 证据范围：只采用框架、编辑器内核、数据库和格式规范的官方文档或官方源码站点。文中的“判断”是基于这些事实对本产品约束的推论，不是上游项目的承诺。

## 结论摘要

本研究不替父票据做最终技术选型；建议保留以下候选进入小型原型和性能验证：

1. **桌面壳层形成三个可行梯队**：
   - `WPF + WebView2 + .NET`：Windows 专用、宿主能力成熟，适合用 C# 承载数据库、文件、备份和系统集成，用 WebView2 承载结构化编辑器。
   - `WinUI 3 + WebView2 + .NET`：Microsoft 对新 Windows 应用的推荐原生 UI 路线，现代 Windows 体验更直接，但应通过原型验证窗口、输入法、部署及 WebView2 集成的工程成熟度。
   - `Tauri 2 + Web 前端 + Rust` 与 `Electron + Web 前端`：两者都能直接复用 Web 编辑器生态。Tauri 依赖系统 WebView2、安装体积潜力较好且有细粒度权限边界；Electron 自带 Chromium/Node，运行时一致性和全栈 TypeScript 开发路径更直接，但发行物和安全更新面更大。
2. **编辑器内核以 ProseMirror 系为优先验证对象，Lexical 为有价值的对照组**。Tiptap 在 ProseMirror 的严格 Schema、事务和 JSON 文档之上提供扩展层，能更快验证自定义语义节点；直接使用 ProseMirror 控制力最高但集成成本也最高。Lexical 的不可变、可序列化 EditorState 和独立 history 包足以构建正文编辑，但需验证复杂结构约束、粘贴规范化和导出链。
3. **SQLite 最契合单用户本地应用的主数据源**：关系、顺序、标签、版本元数据和全文索引放关系表；正文保存为有版本号的编辑器 JSON，同时维护可重建的纯文本投影；图片等大附件放受管理的资源目录。该“数据库 + 资源目录”方案比散落的 Markdown/JSON 文件更容易保证跨实体写入一致性，又避免大型二进制持续放大数据库。
4. **必须把三种“历史”分开设计**：编辑会话内 undo/redo、可跨重启恢复的正文修订、整库备份不是同一机制。编辑器 history 只解决第一层；第二层应由应用写入修订记录；第三层应使用 SQLite Online Backup API 或 `VACUUM INTO`，不能在数据库仍可能写入时直接复制主数据库文件。
5. **Markdown/HTML 应是导出格式，不宜单独承担权威存储**。CommonMark 能表达常用块和行内格式，但不定义作品元数据、实体关联和自定义语义节点；仅用文件树需要应用自行解决跨文件事务、重命名引用、索引同步和历史一致性。

## 评估标准

| 维度 | 本产品所需能力 |
|---|---|
| Windows 体验 | 文件关联、原生窗口/菜单/对话框、输入法、无账户离线启动、可安装及可卸载 |
| 编辑器适配 | 结构化文档模型、可控 Schema、中文输入、粘贴清洗、撤销重做、稳定 JSON 序列化 |
| 数据可靠性 | 原子写入、崩溃恢复、可迁移 Schema、自动保存不丢关联、可校验备份 |
| 查询能力 | 作品内和跨作品搜索；正文、角色、地点、世界设定及关联的组合查询 |
| 可维护性 | 清楚的前后端边界、可测试的数据服务、依赖升级和安全修复路径 |
| 可移植性 | 用户能备份、恢复并导出开放格式；内部格式可做版本迁移 |

## 一、桌面壳层候选

### 候选对比

| 候选 | 官方事实 | 对本产品的优势（判断） | 主要代价/待验证项（判断） |
|---|---|---|---|
| WPF + WebView2 + .NET | Microsoft 将 WPF 描述为成熟的 Windows .NET/XAML 框架，具备控件、数据绑定、布局、图形和样式；WPF 在现代 .NET 上仍获活跃投入。[Windows 应用开发选项](https://learn.microsoft.com/en-us/windows/apps/get-started/)、[WPF 升级概览](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/migration/) WebView2 可嵌入 Edge/Chromium，并支持本地 HTML、JavaScript 和宿主通信。[WinUI/WPF 可用的 WebView2 概览](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/webview2) | 原生壳层、C# 数据层和 Web 编辑器职责容易分开；WPF 的数据绑定适合资料树、检查器、关系面板等密集桌面 UI。 | 两套 UI 技术之间存在消息桥、焦点、快捷键、拖放和生命周期边界；Windows 专用。宿主接口必须缩小并异步化。 |
| WinUI 3 + WebView2 + .NET | WinUI 3 是 Microsoft 推荐的新 Windows 桌面原生 UI 框架，随 Windows App SDK 交付，支持 Windows 10 1809 及以后版本。[WinUI 3](https://learn.microsoft.com/en-us/windows/apps/winui/winui3/) | 与 Windows 新视觉和新平台 API 对齐；同样能用 C# 宿主 SQLite 和备份服务。 | 相比 WPF，应额外验证复杂桌面控件、窗口行为、开发工具链和所需第三方组件；这不是仅凭“官方推荐”即可消除的项目风险。 |
| Tauri 2 + Web 前端 + Rust | Tauri 由具有完整系统权限的 Core 进程管理系统 WebView；Windows 使用 WebView2，WebView 库不打进应用二进制。[进程模型](https://v2.tauri.app/concept/process-model/) Capability/Permission 可按窗口或 WebView 限制 IPC 命令及文件路径范围。[Capabilities](https://v2.tauri.app/security/capabilities/)、[Permissions](https://v2.tauri.app/security/permissions/) | 前端可直接使用 Tiptap/ProseMirror/Lexical；Rust Core 可集中实现数据库、文件和备份，并用 capability 限制编辑器前端的系统权限。 | 团队需承担 Rust、Web 前端和 IPC 三层调试；系统 WebView 更新带来的行为变化需回归；Windows 10 缺少 WebView2 时必须处理安装。 |
| Electron + Web 前端 | Electron 将 Chromium 和 Node.js 嵌入应用，终端用户无需另装 Node.js。[Prerequisites](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites) 它采用主进程/渲染进程模型；官方要求 context isolation、sandbox、限制 IPC 并保持 Electron 更新。[进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)、[安全清单](https://www.electronjs.org/docs/latest/tutorial/security) | Chromium 版本随应用固定，编辑器行为较可重复；主进程、前端和工具链都可使用 JavaScript/TypeScript；编辑器生态接入阻力低。 | 应用同时分发 Electron、Chromium 和 Node.js，发行物及更新负担相对依赖系统 WebView 的方案更高；必须把文件/数据库能力留在主进程并严格设计 preload API。 |
| Avalonia + NativeWebView + .NET（条件候选） | Avalonia 的 NativeWebView 在 Windows 上使用 WebView2；官方文档说明 Windows 10 可能需要随安装器提供运行时。[嵌入 Web 内容](https://docs.avaloniaui.net/docs/app-development/embedding-web-content) | 若父票据以后把跨平台提升为明确目标，可复用 .NET 数据层和 Web 编辑器。 | 当前首发仅 Windows，跨平台抽象未直接创造用户价值；需验证 NativeWebView 与纯 Windows WebView2 控件在输入、桥接及调试上的差异。 |

### WebView2 的共同部署与安全约束

- WebView2 的 Evergreen 模式自动更新，Microsoft 推荐多数应用使用；Fixed Version 允许锁定版本但需随应用携带专用运行时。[Evergreen 与 Fixed Version](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)
- Tauri 官方列出的 Windows 安装选项表明：默认下载 bootstrapper 需要网络；`offlineInstaller` 不需要网络但会显著增加安装包；`fixedVersion` 也不需要网络且更大。[Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/) 因而“应用运行离线”和“首次安装完全离线”是两个需要分别决定的产品要求。
- WebView2 的同步 host object 调用会阻塞脚本，官方推荐基于 Promise 的异步代理；暴露 host object 具有安全风险。[AddHostObjectToScript](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.addhostobjecttoscript) 对本项目的含义是：不要把任意文件系统或 SQL 接口直接暴露给编辑器页面，应暴露按用例命名、校验参数的窄接口，例如 `saveChapterRevision`、`searchWork`、`chooseExportFolder`。
- Electron 的官方安全清单同样要求渲染进程 sandbox、context isolation、CSP 和受约束的 IPC。[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security) 壳层不同，但“编辑器页面不直接持有系统权限”应成为共同架构约束。

### 壳层阶段性判断

目前没有事实支持只保留一个壳层。建议父票据让以下三条路线做同一组 spike：

1. `WPF + WebView2 + .NET`：代表“成熟 Windows 原生宿主”。
2. `WinUI 3 + WebView2 + .NET` 或 `Tauri 2` 二选一进入 spike：前者验证最新 Microsoft 原生路线，后者验证轻量 Web 壳层路线；应依据团队语言能力决定先后。
3. `Electron`：作为编辑器集成速度和 Chromium 一致性的基准组。

Spike 必须使用相同样例：10 万字级章节、中文 IME 连续输入、大段粘贴、撤销重做、侧栏资料查询、崩溃后恢复、安装在无开发环境的干净 Windows 用户账户。这里的字数是测试工况，不是已证明的容量上限。

## 二、编辑器内核候选

### ProseMirror 与 Tiptap

ProseMirror 的文档是由 Schema 约束的节点树；编辑状态是持久数据结构，每次修改产生 Transaction。Transform/Step 可记录和重放，是 history 的基础；history 插件通过保存事务的逆操作实现 undo。[ProseMirror Guide](https://prosemirror.net/docs/guide/) 文档节点支持 `toJSON()`，Schema 支持 `nodeFromJSON()`。[ProseMirror Schema 与序列化](https://prosemirror.net/docs/guide/#schema)

这与本产品的适配点：

- 可明确允许的正文节点和 mark，避免把浏览器 DOM/HTML 当权威模型。
- Transaction 可作为自动保存“发生了有效编辑”的信号，但不应把内存 undo 栈误当作持久版本历史。
- 自定义节点可以表示章节内的特殊语义；是否真的把角色/地点引用嵌入正文，应由产品交互研究决定，不能因技术可行就提前加入 MVP。

Tiptap 建立在 ProseMirror 上，沿用严格 Schema、Transaction 和节点树，并用 Extension 组织节点、mark 与功能；官方推荐以 JSON 持久化，`editor.getJSON()` 可取得文档。[Tiptap Concepts](https://tiptap.dev/docs/editor/core-concepts/introduction)、[Tiptap Persistence](https://tiptap.dev/docs/editor/core-concepts/persistence)

阶段性判断：

- **Tiptap**适合 MVP spike：更快搭出工具栏、快捷键、粘贴规则和自定义节点。
- **直接 ProseMirror**适合需要完全控制事务、插件和序列化边界的团队，但要自行整合更多编辑体验。
- 两者的持久格式实质上都需要应用维护 `document_schema_version` 和迁移器；“能序列化为 JSON”不等于未来扩展变更自动兼容。

### Lexical

Lexical 的 EditorState 是不可变状态，更新时使用 current/pending 双缓冲并在提交后形成新的不可变状态；EditorState 可序列化为 JSON并由编辑器反序列化。[Editor State](https://lexical.dev/docs/concepts/editor-state) 自定义节点需实现或生成 JSON 导入导出逻辑。[Serialization & Deserialization](https://lexical.dev/docs/serialization/) `@lexical/history` 提供 undo/redo 监听器和命令。[Lexical History](https://lexical.dev/docs/packages/lexical-history)

阶段性判断：

- 状态与 DOM 分离、JSON 序列化、React 绑定和 history 都满足基础正文编辑。
- 与 ProseMirror 系相比，不能仅凭官方概念文档判断哪一个更适合复杂小说结构；应实测 Schema/节点约束、中文组合输入、跨节点选择、粘贴规范化、长文性能和 HTML/Markdown 导出。

### 不建议把 HTML 或 Markdown 直接作为编辑器权威状态

- ProseMirror 和 Tiptap 都把内部文档定义为受 Schema 约束的节点树，并提供 JSON 序列化；HTML 是可解析/渲染表示，不是唯一无损表示。[ProseMirror Guide](https://prosemirror.net/docs/guide/)、[Tiptap Output](https://tiptap.dev/docs/guides/output-json-html)
- CommonMark 规范覆盖段落、标题、列表、引用、代码、链接、图片等块和行内结构，但没有作品元数据、实体关系或应用自定义节点的标准表达。[CommonMark Spec](https://spec.commonmark.org/0.31.2/)

因此内部保留带版本的编辑器 JSON，导出时生成 HTML/Markdown/纯文本，迁移和验证边界更清楚。

## 三、持久化与文件方案

### 方案对比

| 方案 | 优势 | 风险与代价 | 结论 |
|---|---|---|---|
| 每个实体一个 Markdown/JSON 文件 | 人可读；易用普通工具复制；正文 Markdown 可直接交付给其他工具。 | CommonMark 不承载应用元数据和关系；一次用户操作可能修改多个文件，跨文件原子性、重命名引用、索引、并发备份和历史一致性都需应用实现。大量小文件也会扩大迁移和恢复的状态空间。 | 可作为导出/交换格式，不宜作为当前需求下的唯一权威存储。 |
| 单个 SQLite 文件，正文/资料/附件均入库 | 单文件便于移动；关系、事务、索引和备份集中。SQLite 官方明确将桌面 application file format 列为适用场景。[Application File Format](https://sqlite.org/appfileformat.html) | 大图片等 BLOB 会让数据库和每次完整备份增长；用户无法直接浏览附件；资源替换也进入数据库写事务。 | 对“便携单文件作品”有吸引力，需以真实附件规模做备份和恢复测试。 |
| SQLite + 受管理资源目录 | 关系数据和正文获得事务与查询能力；图片保持普通文件，导出和去重更灵活。 | 作品不再是天然单文件；数据库记录与资源文件之间没有内建跨介质事务，备份必须用 manifest/staging 协议并校验缺失或孤儿资源。 | **最值得优先验证的通用方案**，但不是本报告的最终选型。 |
| SQLite 主存储 + 定期生成 Markdown/JSON 镜像 | 同时获得可靠内部模型和用户可读副本。 | 镜像是第二份状态，若被误当成双向编辑源，会产生冲突；持续生成增加 I/O。 | 只适合明确标记为只读导出或恢复工件，不应做隐式双向同步。 |

### 为什么 SQLite 与本地单用户场景吻合

- SQLite 是进程内、无独立服务器、零配置的事务型 SQL 引擎；完整数据库包含表、索引、触发器和视图，位于一个跨平台文件中。[About SQLite](https://sqlite.org/about.html)
- 官方“适用场景”明确指出：设备本地、低写入并发、数据量低于 1 TB 时 SQLite 通常很合适；桌面 application file format 是其典型用法。[Appropriate Uses](https://sqlite.org/whentouse.html)
- SQLite 事务提供原子提交；WAL 模式允许读者与写者同时工作，并让读事务看到稳定快照。[Atomic Commit](https://sqlite.org/atomiccommit.html)、[Isolation and WAL](https://sqlite.org/isolation.html) 对单用户桌面应用而言，一个应用级写入队列即可避免无意义的多写者竞争。
- FTS5 提供全文索引，默认 `unicode61` tokenizer，也提供 trigram tokenizer和自定义 tokenizer API；外部内容表要求应用或触发器保持索引同步。[FTS5](https://www.sqlite.org/fts5.html) 中文分词质量不能从“支持 Unicode”推导出来，必须用真实中文正文比较 `unicode61`、trigram 或自定义 tokenizer 的召回、排序、索引体积和速度。
- SQLite 内置 JSON 函数可验证和查询 JSON，但频繁参与关联、排序和约束的字段仍应正规化为列；JSON 适合保存编辑器节点树和少量扩展属性。[JSON Functions](https://www.sqlite.org/json1.html)

### 建议验证的数据边界

以下是用于原型的边界草案，不是冻结 Schema：

- `work`：作品元数据。
- `chapter`：章节标题、顺序、当前正文修订、字数等可查询投影。
- `chapter_content`：当前编辑器 JSON、`document_schema_version`、纯文本投影、更新时间。
- `chapter_revision`：持久修订 ID、章节 ID、创建时间、原因、正文快照或应用级 delta。
- `storyline`、`event`、`character`、`location`、`world_fact`：独立实体表。
- `entity_relation`：受约束的来源、目标和关系类型；是否改成按领域拆分的关系表留待领域模型稳定后决定。
- `search_fts`：由正文纯文本和资料文本构建的可重建索引。
- `asset`：逻辑 ID、相对路径、媒体类型、大小、内容哈希；文件位于作品资源目录。
- `schema_migration` 或 `PRAGMA user_version`：数据库结构版本；与正文 JSON 的 `document_schema_version` 分开。

关键原则是：**编辑器 JSON 是正文结构的权威表示，关系表是跨实体关系的权威表示，纯文本和 FTS 都是可重建投影**。不要在 JSON 和关系表中各保存一套可独立修改的同一关系。

## 四、自动保存、历史版本与备份

### 三层机制

1. **会话撤销/重做**
   - 由 ProseMirror/Tiptap history 或 Lexical history 负责，粒度面向输入体验。
   - 应测试切换章节、关闭窗口和恢复草稿时的边界；默认不承诺跨重启保留整个 undo 栈。

2. **持久修订**
   - 自动保存把当前正文 JSON、纯文本投影、字数和当前修订引用放在一个数据库事务中。
   - 自动保存不必每次都创建用户可见版本；可按“显著编辑、切换章节、应用退出、手动命名版本”等策略写 `chapter_revision`，具体节流参数由丢失预算和性能测试决定。
   - SQLite Session Extension 能记录表 changeset，changeset 可反转用于 undo。[Session Extension](https://sqlite.org/sessionintro.html) 但若正文是一整块 JSON，行级 changeset 很可能仍记录整列旧值/新值；因此它应作为 delta 原型候选，而非默认假设。MVP 可先验证压缩快照的空间和恢复简单性。

3. **整库备份**
   - Online Backup API 可增量复制运行中的数据库，源库只在每个复制步骤短暂持有读锁。[Online Backup API](https://sqlite.org/backup.html)
   - `VACUUM INTO` 可生成一致、压缩后的数据库快照；它不支持增量，但输出会清除空闲页。[VACUUM INTO](https://sqlite.org/lang_vacuum.html)
   - SQLite 官方腐坏指南明确警告：事务进行中直接复制数据库可能得到新旧内容混合的损坏副本；安全方式包括 Backup API、`VACUUM INTO`，或确保无事务并正确处理 journal/WAL 文件。[How To Corrupt An SQLite Database](https://www.sqlite.org/howtocorrupt.html)
   - 若采用外部资源目录，备份流程还需冻结一份资源 manifest，将数据库快照与 manifest 指向的资源复制到临时目标，校验后再发布为完整备份；仅备份 `.db` 不等于完整作品备份。

### 恢复和保留策略必须可验证

- 每个备份应携带格式版本、生成时间、应用版本、资源 manifest 和校验结果。
- 恢复应写入新位置并通过 `PRAGMA integrity_check`、迁移预检和资源校验后再让用户打开；不要原地覆盖唯一工作副本。
- 保留策略应同时覆盖近期密集备份和较长期稀疏备份，但具体数量和周期属于产品决策，不在研究阶段凭空确定。
- 至少做三类故障注入：数据库事务中止、数据库快照完成但资源复制中止、迁移中止。验收标准是原工作副本仍可打开，且系统不会把半成品标记为可恢复备份。

## 五、导出与用户可携带性

建议把导出做成从内部模型生成的独立流水线：

- **纯文本**：最低共同格式，用于阅读和应急恢复。
- **Markdown**：章节标题、段落、强调、列表、链接和图片；应用特有关系另附清单或 JSON。
- **HTML**：保留更多富文本表现，适合预览和后续排版。
- **结构化 JSON 包**：包含作品元数据、正文节点树、资料实体、关系、格式版本和资源 manifest，作为应用间完整交换候选。
- **数据库快照**：用于本应用完整备份/恢复，不与面向其他工具的“导出”混为一谈。

导出必须从同一个一致性快照读取，并用稳定 ID 表示跨实体引用；导出器应有独立版本和 golden-file 测试。CommonMark 只规定 Markdown 语法，不规定小说作品包，因此完整交换格式需要本项目自己的版本化规范。[CommonMark Spec](https://spec.commonmark.org/0.31.2/)

## 六、建议父票据安排的决策实验

### 壳层 × 编辑器 spike

对入围壳层使用同一 Tiptap/ProseMirror 示例，记录：

- 冷启动和安装包组成；
- 无网络、无开发工具的 Windows 环境能否安装和首次启动；
- 中文 IME、候选窗位置、组合输入、全角标点、跨段选择；
- 10 万字级单章的输入延迟、查找、滚动、撤销、大段粘贴；
- WebView 与宿主间保存、搜索、文件选择、关闭拦截和崩溃恢复；
- Windows 缩放、键盘快捷键、辅助功能和多窗口行为；
- 壳层及 Web 依赖升级后的回归范围。

### 存储 spike

使用一套接近真实规模的夹具：多作品、数百章节、数千资料实体和关系、中文正文、图片附件。比较：

- SQLite 全 BLOB 与 SQLite + 资源目录的库大小、备份时间、恢复时间和增量增长；
- JSON 正文快照与压缩快照/应用级 delta 的空间、写入延迟和恢复复杂度；
- `unicode61`、trigram 和可选中文 tokenizer 的搜索质量、索引大小和构建时间；
- 自动保存期间强制终止进程后的最近可恢复状态；
- 数据库及正文 Schema 各升级一次、降级拒绝一次的迁移行为。

## 七、待父票据决定的问题

1. 团队更愿意承担 `.NET/C# + Web`、`Rust + Web` 还是全 TypeScript 的长期维护成本？
2. “安装时也必须完全离线”是否为硬要求？这会直接影响 WebView2 分发方式和安装包大小。
3. 用户心智是“一个作品一个可移动文件”，还是“应用管理的作品库 + 显式导入导出”？这会影响 SQLite 单文件、共享数据库和资源目录的边界。
4. 历史版本的用户承诺是什么：仅防误操作、可按时间浏览，还是要做任意版本比较和选择性恢复？
5. 正文内是否需要持久的角色/地点引用节点，还是 MVP 只需侧栏关联？这会影响编辑器 Schema 和导出降级规则。
6. Windows 10 的最低版本和支持期限是什么？Microsoft 当前文档中现代 .NET 与 WebView2 的支持范围会随 OS 生命周期变化，应在发布前依据当时官方支持矩阵锁定。[Install .NET on Windows](https://learn.microsoft.com/en-us/dotnet/core/install/windows)、[WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)

## 来源索引

### Microsoft / .NET

- [Windows app development options](https://learn.microsoft.com/en-us/windows/apps/get-started/)
- [WinUI 3](https://learn.microsoft.com/en-us/windows/apps/winui/winui3/)
- [WPF architecture](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/wpf-architecture)
- [Overview of upgrading WPF apps](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/migration/)
- [WebView2 control](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/webview2)
- [Evergreen vs. Fixed Version WebView2 Runtime](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)
- [WebView2 AddHostObjectToScript](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.addhostobjecttoscript)
- [.NET releases and support](https://learn.microsoft.com/en-us/dotnet/core/releases-and-support)

### 桌面壳层

- [Tauri process model](https://v2.tauri.app/concept/process-model/)
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri permissions](https://v2.tauri.app/security/permissions/)
- [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Avalonia embedding web content](https://docs.avaloniaui.net/docs/app-development/embedding-web-content)

### 编辑器与格式

- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [ProseMirror Reference](https://prosemirror.net/docs/ref/)
- [Tiptap Concepts](https://tiptap.dev/docs/editor/core-concepts/introduction)
- [Tiptap Persistence](https://tiptap.dev/docs/editor/core-concepts/persistence)
- [Lexical Editor State](https://lexical.dev/docs/concepts/editor-state)
- [Lexical Serialization](https://lexical.dev/docs/serialization/)
- [Lexical History](https://lexical.dev/docs/packages/lexical-history)
- [CommonMark 0.31.2 Specification](https://spec.commonmark.org/0.31.2/)

### SQLite

- [About SQLite](https://sqlite.org/about.html)
- [SQLite as an Application File Format](https://sqlite.org/appfileformat.html)
- [Appropriate Uses for SQLite](https://sqlite.org/whentouse.html)
- [Atomic Commit](https://sqlite.org/atomiccommit.html)
- [Isolation and WAL](https://sqlite.org/isolation.html)
- [FTS5](https://www.sqlite.org/fts5.html)
- [JSON Functions](https://www.sqlite.org/json1.html)
- [Session Extension](https://sqlite.org/sessionintro.html)
- [Online Backup API](https://sqlite.org/backup.html)
- [VACUUM INTO](https://sqlite.org/lang_vacuum.html)
- [How To Corrupt An SQLite Database](https://www.sqlite.org/howtocorrupt.html)
