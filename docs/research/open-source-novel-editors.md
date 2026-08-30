# 开源小说写作与世界设定工具研究

> 研究票据：[分析开源小说写作与世界观管理工具 #2](https://github.com/sampletea-png/MyStoryEditor/issues/2)  
> 调研日期：2026-08-30  
> 目标产品：Windows、本地优先、单用户，以正文写作为核心，并综合管理故事线、角色、地点与世界设定。

## 结论摘要

没有一个候选项目同时把“低摩擦长篇写作”“结构化故事规划”“可扩展世界设定”和“透明可靠的本地数据”都做到最好。适合本产品的方向不是复刻某个竞品，而是组合三类成熟做法：

1. **以正文编辑为主路径。** 借鉴 novelWriter 的“作品树 + 小文档 + 专注编辑 + 引用元数据”，让用户打开作品后能立即回到最近正文；角色、地点和世界设定应在写作时就近引用，而不是迫使用户先填写大量表单。
2. **正文结构与故事结构分离但关联。** 章节/场景属于读者看到的叙事顺序；故事线/事件表达故事内部的因果和时间。STARC 的卡片与正文双向联动、bibisco 的 narrative strands（叙事线）分析值得借鉴，但不能把卡片直接等同于章节。
3. **采用每作品一个 SQLite 数据库，并提供可读导出与自动备份。** SQLite 适合事务、搜索、关系和迁移；但应像 novelWriter 一样重视数据可恢复性，并像 bibisco 一样将定时、退出时备份做成产品能力。不能把浏览器 IndexedDB 或一个不断重写的大 JSON 文件当作唯一真相源。
4. **领域模型保持小而可扩展。** MVP 固定建模作品、正文、章节、故事线、事件、角色、地点、世界设定和关联；世界设定的细分类别使用模板/自定义字段扩展。避免 Manuskript、Quoll Writer 等项目逐年形成的类型树和专用面板膨胀。
5. **先做可靠的单机写作闭环，再做图谱和高级规划。** 地点层级、关系、地图图片与标记可以由统一关联模型支持；完整地图绘制器、实时协作、云同步、AI 和复杂关系图都不应进入首版核心。

## 研究范围与证据标准

选择 7 个项目，覆盖活跃的正文编辑器、小说规划器、剧本/小说一体工具、世界设定数据库和本地 PWA。只采用项目官方仓库、官方文档、源码及官方发布记录。维护状态以 2026-08-30 查看仓库默认分支的最近推送和最新官方发布为准；“活跃”不代表成熟，“发布较旧”也不自动表示无参考价值。

## 横向比较

| 项目 | 信息架构与编辑体验 | 领域模型 | 本地存储 | 技术栈 | 维护状态（截至调研日） |
| --- | --- | --- | --- | --- | --- |
| [novelWriter](https://github.com/saga-soft/novelWriter) | 作品树组织大量小型纯文本文档；正文与备注并列；编辑器使用类 Markdown 语法、概要和交叉引用，强调低干扰写作与编译预览 | Novel 根节点下组织文档；角色、地点、情节、时间线等作为可标记、可引用的参考条目，模型偏“文档 + 元数据” | 每作品一个目录；正文为人类可读文本，结构/设置为版本化项目文件；适合版本控制与文件同步 | Python、Qt 6、PyQt 6 | **活跃且成熟**：仓库 2026-08-29 仍有推送；官网稳定版 2026.1 patch 2 发布于 2026-07-25，GitHub 同时有 26.2 候选版 |
| [Manuskript](https://github.com/olivierkes/manuskript) | 顶层按人物、情节、世界、纲要/正文分区；提供雪花法、索引卡、章节/场景重排和无干扰编辑 | Character、Plot、World、Outline 是平行模型；OutlineItem 形成层级树并承载场景写作 | 默认 `.msk` 单文件 ZIP；也可用目录模式保存多份文本/JSON，`settings.txt` 为 JSON | Python 3、PyQt 5 | **仍维护、架构较老**：仓库 2026-07-19 有推送；0.17.0 发布于 2025-06-30 |
| [bibisco Community Edition](https://github.com/andreafeccomandi/bibisco) | 强引导式小说工作流：前提、故事梗概、叙事线、设定、角色访谈、章节/场景、修订和分析；富文本编辑 | 章节包含场景；区分主/次角色、地点、叙事线，并记录场景中的视角、时间、地点和角色出现 | 用户指定作品目录；每作品目录含一个 JSON 数据文件和图片目录；自动保存，并可按频率/退出时导出归档备份 | JavaScript、Node.js、Electron（Community Edition 源码） | **产品在更新，公开源码节奏不透明**：官方文档 2026 年仍更新并覆盖 bibisco 5；社区仓库最近推送为 2024-09-27，GitHub 最新标记发布仍是 2.2.0 |
| [Story Architect (STARC)](https://github.com/story-apps/starc) | 首页进入多作品；作品内共用 story bible，包含正文/剧本、卡片板、思维导图、资料和统计；卡片与正文结构双向联动 | 单作品可含多种文本和剧集，共享角色、地点、世界资料；插件化支持小说、电影、漫画、舞台剧等格式 | 本地 `.starc` 作品文件；支持导入/导出多种行业格式。官方仓库以 project manager、models facade 和内容插件隔离存储/领域/UI | C++、Qt、qmake，插件化架构 | **非常活跃、仍为 beta/open core**：仓库 2026-08-27 有推送；0.8.2 发布于 2026-06-08 |
| [Fantasia Archive](https://github.com/vishiri/fantasia-archive) | 以世界设定数据库为中心；层级树、文档工作区、快速添加/搜索、多标签页和模板驱动表单；正文不是当前最强主路径 | 世界、层级文档、模板、自定义字段、标签与文档关系；类型可由模板扩展 | 每作品一个 `.faproject` SQLite 文件；主进程集中数据库访问，以 `user_version` 管理 schema | TypeScript、Vue 3、Quasar、Electron、better-sqlite3、Pinia | **源码高度活跃、发布滞后且仍预发布**：仓库 2026-08-29 有推送；最新 GitHub 发布 0.1.13 为 2024-04-06 |
| [Quoll Writer](https://github.com/garybentley/quollwriter) | 项目树 + 多编辑器；支持章节/场景、资料、想法、目标、问题和专注模式，功能全面但界面/概念密度较高 | Project 顶层包含 Book、Character、QObject、ResearchItem、IdeaType；Book→Chapter→Scene/OutlineItem | 每作品目录内使用文件型 H2 数据库；内置 schema 版本号和逐版本升级脚本 | Java、Swing、H2、Ant | **低频维护、成熟遗留架构**：仓库最近推送为 2025-05-18；3.0.4 发布于 2025-03-03 |
| [Wavemaker Cards v4](https://github.com/wavemakercards/wavemaker-v4) | 工具箱式导航：Writer、规划板、时间线、卡片数据库、雪花法、思维导图等；可离线安装为 PWA | 章节/场景树、时间线条目和通用卡片；卡片可表达角色、地点、世界设定，但整体模型较松散 | Dexie 封装浏览器 IndexedDB；通过导入/导出和 Google Drive 备份/迁移 | JavaScript、Vue 3、TipTap、Vite、Dexie、Workbox/PWA | **活跃迭代但版本并行**：v4 仓库 2026-02-23 有推送，无 GitHub Release；官方组织还在开发 v5 |

## 逐项分析

### 1. novelWriter：正文优先与透明存储的最佳参照

**信息架构与编辑体验。** 官方将其定义为“由许多较小纯文本文档组装小说的纯文本编辑器”。左侧作品树既能表达卷、章、场景，也能容纳角色、地点、情节等笔记；中心编辑，右侧查看文档或参考资料。拆分/合并、编译、字数统计和文档状态围绕写作流程，而不是围绕数据库录入流程。类 Markdown 标记降低工具栏依赖，概要、注释、标签和引用仍能形成结构化导航。

**领域与存储。** 其关键取舍是把大多数对象视为“有类别和元数据的文档”，而不是每类对象一套庞大表单。作品结构文件保存树、类别、状态和版本，正文保持可读文本。官方明确说明这种格式适合版本控制和文件同步。项目格式文档还体现了格式版本和迁移意识。

**可借鉴。**

- 打开作品直接回到正文，并支持“编辑正文时固定查看某角色/地点”的邻近参考体验。
- 对正文使用小粒度节点，支持树中拖拽、拆分、合并和跨节点搜索。
- 统一标签/引用语法或引用选择器，让角色、地点、世界设定能从正文反向发现。
- 导出不只是发布功能，也是脱离应用读取作品的恢复通道。

**不应照搬。**

- 纯文本 + XML 很透明，但对事件顺序、任意实体关系、地图标记和全文索引的事务一致性较弱。
- 让所有世界设定都退化为无 schema 文档，会使筛选、关系约束和后续迁移困难。
- 标记语法适合技术用户，Windows 大众用户仍需要命令面板、自动补全和可视化属性编辑。

**一手资料：** [官方仓库与 README](https://github.com/saga-soft/novelWriter)、[组织作品源码文档](https://github.com/saga-soft/novelWriter/blob/main/docs/source/usage/organising_project.rst)、[标签与引用源码文档](https://github.com/saga-soft/novelWriter/blob/main/docs/source/usage/tags_and_references.rst)、[项目格式源码文档](https://github.com/saga-soft/novelWriter/blob/main/docs/source/more/project_format.rst)、[官方下载与稳定版信息](https://novelwriter.io/)、[GitHub Releases](https://github.com/saga-soft/novelWriter/releases)。

### 2. Manuskript：功能分区清晰，但暴露了“模块孤岛”风险

**信息架构与编辑体验。** Manuskript 将 Characters、Plots、World、Outline 等做成明显的顶层工作区。纲要同时提供树和索引卡，可重排章节与场景；写作模式提供专注界面。雪花法和角色问卷对从零规划有帮助。

**领域与存储。** 源码中 `characterModel`、`plotModel`、`worldModel`、`outlineModel` 是平行模型，说明它更像多个专用工具装在同一外壳中。默认 `.msk` 是 ZIP 归档，也可保存为目录；样例作品直接展示 `characters/`、`outline/` 等目录和文本文件。压缩包便于搬运，但每次整体重写会放大崩溃时的损坏面，目录/单文件双模式也增加测试矩阵。

**可借鉴。**

- 大纲树与索引卡是同一结构的两种视图。
- 场景状态、标签、视角角色等适合在大纲中直接快速编辑。
- 专注写作、目标和字数反馈应是正文区域的轻量能力。

**不应照搬。**

- 不要让角色、情节、世界、正文成为互相跳转成本很高的顶层孤岛。
- 不要在 MVP 内置一种写作方法（如雪花法）并让它主导领域模型；应把方法论做成可选模板。
- 不维护“单归档/目录”两套同等地位的主存储模式。

**一手资料：** [官方仓库与功能 README](https://github.com/olivierkes/manuskript)、[模型源码目录](https://github.com/olivierkes/manuskript/tree/develop/manuskript/models)、[加载/保存源码](https://github.com/olivierkes/manuskript/tree/develop/manuskript/load_save)、[官方样例作品](https://github.com/olivierkes/manuskript/tree/develop/sample-projects/book-of-acts)、[设置存储说明](https://github.com/olivierkes/manuskript/wiki/Configuration-Settings-Storage-Locations)、[0.17.0 发布信息](https://github.com/olivierkes/manuskript/releases/tag/0.17.0)。

### 3. bibisco：优秀的小说引导与分析，代价是流程过强

**信息架构与编辑体验。** bibisco 从 premise、fabula、narrative strands、setting 和角色设计，引导到章节/场景写作、修订与分析。角色访谈把抽象的“填写角色卡”变成连续提问；章节内场景记录地点、时间、视角和出场角色，从而自动产生分布分析。

**领域与存储。** 模型围绕“章节—场景”展开，并将角色、地点、叙事线关联到场景。官方项目目录文档说明每作品是一个 JSON 文件加图片目录；自动备份会按配置频率及退出时导出带时间戳的归档，并限制保留数量。

**可借鉴。**

- 创建角色/世界设定时提供“快速创建”和“引导完善”两条路径。
- 在场景元数据中连接故事线、角色、地点、时间和视角，再由数据自然生成分析。
- 自动备份允许选择目录、频率和保留数量，并明确提示异盘/外部介质备份。
- 修订状态与正文写作分离，避免编辑期间堆满校对控件。

**不应照搬。**

- 强制线性地完成前提、人物访谈等步骤，会阻塞探索型写作者；所有规划都应可跳过。
- 单个大 JSON 作为主数据不利于局部事务、增量保存和大作品性能。
- Community/Supporters/Everywhere 的能力边界和开源仓库发布不同步，不适合作为架构透明度范例。

**一手资料：** [Community Edition 官方仓库](https://github.com/andreafeccomandi/bibisco)、[官方项目目录结构](https://bibisco.com/docs/projects-directory-structure/)、[官方自动备份说明](https://bibisco.com/docs/automatic-backup-system/)、[应用包与 Electron 依赖](https://github.com/andreafeccomandi/bibisco/blob/master/bibisco/app/package.json)、[章节/场景组件源码](https://github.com/andreafeccomandi/bibisco/tree/master/bibisco/app/components/chapters)、[角色组件源码](https://github.com/andreafeccomandi/bibisco/tree/master/bibisco/app/components/characters)、[分析组件源码](https://github.com/andreafeccomandi/bibisco/tree/master/bibisco/app/components/analysis)。

### 4. Story Architect：多视图联动和共享 story bible 的最佳参照

**信息架构与编辑体验。** STARC 允许一个作品包含多个剧集及不同文本形式，并共享角色、地点和世界资料。官方首页强调正文、卡片板、思维导图和 story bible；卡片顺序/分组变化会反映到剧本文本，反向编辑也同步。其编辑器自动处理行业格式，说明“用户输入内容、软件处理结构”的原则很强。

**领域与架构。** 源码把 project manager、models facade、插件管理层分开，并为 character information、location information、relations、map 和不同文本类型设插件。这使多文种扩展成为可能，但也带来很大的抽象与构建成本。官方明确采用 open-core，部分免费或付费能力闭源。

**可借鉴。**

- 正文树、卡片板和时间线应是同一批实体/关联的投影视图，而不是复制数据。
- 一个作品共用角色、地点、世界设定，可被多个卷或子作品引用。
- “story bible + 正文”并排查看，适合写作时即时核对。
- 导入层与内部模型隔离，为未来兼容 DOCX/Markdown 等格式留边界。

**不应照搬。**

- 不为 MVP 引入 C++/Qt 插件框架和大量文体插件；单一小说上下文不需要这种复杂度。
- 不把剧本的场景标题、格式化段落和制作统计直接套到小说正文。
- 不复制 open-core 造成的功能边界不透明，也不纳入其云协作和 AI 路线。

**一手资料：** [官方仓库与 README](https://github.com/story-apps/starc)、[官方产品页](https://starc.app/)、[官方 open-core 下载说明](https://starc.app/download/)、[项目管理层源码](https://github.com/story-apps/starc/tree/master/src/core/management_layer/content/project)、[插件源码目录](https://github.com/story-apps/starc/tree/master/src/core/management_layer/plugins)、[0.8.2 发布](https://github.com/story-apps/starc/releases/tag/v0.8.2)。

### 5. Fantasia Archive：模板化世界设定与每作品 SQLite

**信息架构与编辑体验。** Fantasia Archive 的重点是层级化世界资料而非连续正文。当前源码提供项目层级树、文档工作区、多标签页、快速添加/搜索以及项目模板设置。它展示了复杂世界设定中“树负责归属、标签和关系负责横向连接、标签页负责工作上下文”的可行组合。

**领域与存储。** 官方数据库文档说明 `.faproject` 为每作品一个 SQLite 数据库，并用 `PRAGMA user_version` 标识 schema。文档模板和自定义字段让用户在不增加硬编码实体类型的情况下定义资料结构。Electron 主进程持有 `better-sqlite3`，渲染层经 IPC 访问，符合本地桌面应用的安全边界。

**可借鉴。**

- 每作品一个可复制、可备份的 SQLite 文件，配套明确 schema 版本和迁移。
- 用模板 + 字段定义扩展世界设定，固定字段只保留名称、摘要、类型、标签等共同属性。
- 层级树用于地点/资料归属，统一关系用于“角色属于势力”“事件发生于地点”等跨类型连接。
- 快速添加先保存最少字段，详情面板稍后完善。

**不应照搬。**

- 世界设定数据库不能成为产品首页和首要工作流；目标产品必须以正文为中心。
- 当前项目仍在预发布期，数据库 schema 被压平到版本 1，不能直接当作长期迁移策略。
- Electron 原生模块打包、ABI 和内存开销是实际成本；选择同类技术栈时必须用自动构建与 Windows 安装测试约束风险。

**一手资料：** [官方仓库与架构 README](https://github.com/vishiri/fantasia-archive)、[项目数据库文档](https://github.com/vishiri/fantasia-archive/blob/master/docs/database/projectDB.md)、[模板自定义字段文档](https://github.com/vishiri/fantasia-archive/blob/master/docs/database/templateCustomFields.md)、[Electron 主进程源码](https://github.com/vishiri/fantasia-archive/tree/master/src-electron)、[0.1.13 发布](https://github.com/vishiri/fantasia-archive/releases/tag/v0.1.13)。

### 6. Quoll Writer：关系型本地存储和迁移成熟，但类型树过重

**信息架构与编辑体验。** Quoll Writer 将写作、资料、想法、问题、资产和目标纳入同一桌面项目；支持多个编辑器和专注模式。功能覆盖很广，但层级菜单、专用对象和旧式桌面控件提高了学习成本。

**领域与存储。** 官方 README 对模型描述很具体：Project 包含 Book、QCharacter、QObject、ResearchItem、IdeaType；Book 包含 Chapter；Chapter 包含 Scene 和 OutlineItem。每作品使用文件型 H2 数据库，schema 版本存在作品中，并按 `2-3.xml` 这类升级脚本逐级迁移。这是长期本地数据兼容的正面样本。

**可借鉴。**

- 数据库 schema 版本必须随作品保存，迁移按版本顺序执行、失败时不破坏原文件。
- 作品打开前备份，迁移应可测试、可恢复，并记录应用版本。
- Project/Book/Chapter/Scene 的聚合边界可帮助约束删除、重排和导出。

**不应照搬。**

- 不为每种资料建立 Java 类、Handler、表和专用 UI；统一世界设定 + 模板更可控。
- 不复制 Swing/Ant/H2 技术组合到新的 Windows 应用。
- 不把“想法、问题、研究资料”等边缘概念全部固化进 MVP 顶层导航。

**一手资料：** [官方仓库与模型/数据库说明](https://github.com/garybentley/quollwriter)、[数据模型源码](https://github.com/garybentley/quollwriter/tree/master/src/main/java/com/quollwriter/data)、[数据库源码](https://github.com/garybentley/quollwriter/tree/master/src/main/java/com/quollwriter/db)、[schema 与迁移脚本](https://github.com/garybentley/quollwriter/tree/master/src/main/resources/data/schema/update-scripts)、[3.0.4 发布](https://github.com/garybentley/quollwriter/releases/tag/v3.0.4)。

### 7. Wavemaker Cards：低门槛规划工具箱，但存储和概念一致性不足

**信息架构与编辑体验。** Wavemaker 把 Writer、时间线、规划板、卡片数据库、雪花法和思维导图做成可独立进入的工具。通用卡片可以快速记录角色、地点和世界资料，PWA 可离线安装，TipTap 提供现代富文本体验。

**领域与存储。** README 和源码显示 v4 使用 Dexie/IndexedDB；章节/场景树、时间线和卡片由不同组件组织。优点是启动门槛低且离线，弱点是数据生命周期受浏览器 profile 影响，多个规划工具也容易形成重复字段与不同步。

**可借鉴。**

- 同一作品可按写作者偏好选择卡片、时间线或正文入口。
- 通用卡片与快速模态框适合捕捉尚未分类的想法。
- TipTap 类结构化富文本编辑器适合做本地桌面正文编辑，但应约束文档 schema 和导出语义。

**不应照搬。**

- 不用 IndexedDB 作为 Windows 桌面应用唯一主存储；清理浏览器数据或 profile 损坏的恢复路径不够直观。
- 不让每种写作方法成为独立数据孤岛。
- 不把 Google Drive 同步纳入本地优先 MVP 的正确性边界。

**一手资料：** [官方 v4 仓库与功能/技术 README](https://github.com/wavemakercards/wavemaker-v4)、[数据库入口源码](https://github.com/wavemakercards/wavemaker-v4/blob/main/src/db.js)、[Dexie 封装源码](https://github.com/wavemakercards/wavemaker-v4/blob/main/src/mixins/dexieDB.js)、[Writer 组件](https://github.com/wavemakercards/wavemaker-v4/tree/main/src/components/writer)、[时间线组件](https://github.com/wavemakercards/wavemaker-v4/tree/main/src/components/timeline)、[官方 GitHub 组织与 v5 状态](https://github.com/wavemakercards)。

## 面向目标产品的建议

### 建议的信息架构

打开应用后的第一层只放“作品列表”和全局设置。打开作品后使用稳定的三栏壳：

- **左栏：作品导航。** 顶部固定“正文”，其下是卷/章节树；随后是故事线、角色、地点、世界设定。收藏、最近访问和搜索是跨分类入口，不再增加顶层概念。
- **中栏：主工作区。** 默认正文编辑；同一区域也承载大纲、卡片、时间线、资料详情和地图图片，使用标签页保留上下文。
- **右栏：上下文检查器。** 显示当前章节/事件/设定的属性、关联、反向引用和写作统计；可折叠，不能挤占专注写作。

关键原则是：树、卡片、时间线、搜索结果和关系视图都是同一领域数据的不同投影。任何视图中改名、重排或建立关联，都立即反映到其他视图。

### 建议的领域模型

- **作品**：本地数据边界、备份边界和导出边界。
- **正文**：由有序章节组成；若未来需要场景，可先作为章节内可选分段，而不是 MVP 顶层必填实体。
- **章节**：包含标题、正文、概要、状态、字数目标和叙事顺序。
- **故事线**：组织一组事件，可具有颜色、状态和排序。
- **事件**：包含摘要、故事内时间/顺序、叙事位置，并关联角色、地点、世界设定和零到多个章节。
- **角色、地点、世界设定**：共享名称、摘要、标签、图片和归档状态；各自只有少量稳定字段。
- **地点层级与地图标记**：地点可有父地点；地图图片属于作品或地点，标记引用地点。它不是独立地图绘制模型。
- **关联**：统一表达任意实体之间有类型、有方向、可备注的连接；反向引用由查询得到，不复制保存。
- **模板/自定义字段**：主要扩展世界设定，也可扩展角色和地点；字段定义与字段值分离并可迁移。

章节和事件必须分开：章节回答“读者以什么顺序读到什么”，事件回答“故事中发生了什么、属于哪条故事线、涉及谁和哪里”。二者应是多对多关联，以支持插叙、同一事件跨章节展开和一章推进多条故事线。

### 建议的本地存储与可靠性

采用**每作品一个 SQLite 数据库文件 + 一个同名资源目录或可打包作品容器**：

- SQLite 保存结构化正文文档、领域对象、关联、标签、设置和全文搜索索引；启用事务、外键、WAL，并把 schema 版本写入数据库。
- 图片等大二进制资源优先保存到作品资源目录，以内容 ID/稳定相对路径引用；导出/搬运时打包为单一归档。
- 自动保存使用短时防抖和事务提交；界面明确显示“已保存/保存中/保存失败”，不得静默吞错。
- 自动备份至少支持：退出作品时、可配置间隔、迁移前；使用时间戳、保留数量和原子替换。默认备份目录应与主作品目录可分开配置。
- 每次 schema 迁移先制作可验证备份，在副本或事务中升级；保存 `schema_version` 和 `app_version`，测试跨多个历史版本升级。
- 导出 Markdown/DOCX/PDF 面向发布；另提供包含数据库、资源和 manifest 的完整作品归档，面向备份与迁移。

SQLite 不是透明性的终点。应用还应提供“导出全部为可读 Markdown/JSON”的逃生通道，并记录资源引用，避免用户只能依赖本程序恢复作品。

### 推荐吸收顺序

1. **MVP 基线：** novelWriter 的正文优先、小节点组织、邻近参考；bibisco 的自动备份；Quoll Writer 的 schema 迁移纪律。
2. **结构规划：** STARC 的同源多视图；bibisco 的场景/章节关联分析，但使用“章节—事件”多对多模型。
3. **世界设定：** Fantasia Archive 的层级、模板、自定义字段和统一关系，保持为写作辅助。
4. **后续增强：** Wavemaker 的可选规划方法和快速卡片；Manuskript 的索引卡/树双视图。方法论模板不能改变核心数据模型。

## 明确不进入首版的做法

- 云账户、实时协作、冲突合并和跨设备同步。
- AI 生成、改写或续写；只在应用服务层预留未来接口。
- 完整地图绘制器、自由形状图编辑器和复杂关系图自动布局。
- 剧本行业格式引擎、多文体插件系统和 open-core 权限层。
- 强制雪花法、角色访谈或其他线性创作流程。
- 将浏览器存储、单个大 JSON 或整体重写 ZIP 作为唯一主存储。
- 为每一种世界设定类型新增硬编码表、类和页面。

## 来源索引与维护状态

以下链接用于复核本报告中的活跃度与发布判断：

- novelWriter：[仓库](https://github.com/saga-soft/novelWriter) · [发布](https://github.com/saga-soft/novelWriter/releases) · [官网稳定版](https://novelwriter.io/)
- Manuskript：[仓库](https://github.com/olivierkes/manuskript) · [发布](https://github.com/olivierkes/manuskript/releases)
- bibisco Community Edition：[仓库](https://github.com/andreafeccomandi/bibisco) · [官方文档](https://bibisco.com/docs/) · [GitHub 发布](https://github.com/andreafeccomandi/bibisco/releases)
- Story Architect：[仓库](https://github.com/story-apps/starc) · [发布](https://github.com/story-apps/starc/releases) · [官方下载](https://starc.app/download/)
- Fantasia Archive：[仓库](https://github.com/vishiri/fantasia-archive) · [发布](https://github.com/vishiri/fantasia-archive/releases)
- Quoll Writer：[仓库](https://github.com/garybentley/quollwriter) · [发布](https://github.com/garybentley/quollwriter/releases) · [官网](https://www.quollwriter.com/)
- Wavemaker Cards：[官方组织](https://github.com/wavemakercards) · [v4 仓库](https://github.com/wavemakercards/wavemaker-v4) · [v5 仓库](https://github.com/wavemakercards/wavemaker-v5)

