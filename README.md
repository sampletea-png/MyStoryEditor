# 小说编辑器

个人 Windows 桌面小说编辑器。显示名：**小说编辑器**。技术栈为 Tauri 2 + React + TypeScript + Tiptap MIT 核心 + 每作品 SQLite。

## 开发

需要 Node.js 与 Rust（MSVC）。日常开发在 `develop` 分支。

```bash
npm install
npm test
npm run tauri dev
```

前端也可单独跑 `npm run dev`，用内存作品库在浏览器里验证编辑器与中文组字。

## 当前状态

阶段 1（能开能写）与阶段 2（设定资料）已收口，在 `develop`。下一阶段是关联与邻侧查阅，见 `docs/roadmap.md`。

字数按「除空白外的字符」计；「你好，世界 Hello」为 10。规格验收句写 11，以规则为准。

尚未在本机点验、但不挡代码收口的验证门：微软拼音 / 搜狗组字不落盘；干净 Win10（无 WebView2）启动提示安装。设定资料请用 `npm run tauri dev` 在桌面端点验落盘。

## 阶段 1

作品库、数据包、卷章、Tiptap、约 3 秒自动保存、字数、保存失败拦截、进程单实例。规格见 `docs/mvp-spec.md`，路线见 `docs/roadmap.md`。

## 阶段 2

角色、地点、事件、故事线、设定条目、预置分类（含不可删的「未分类」）、地点树、资料进入作品回收站。不做通用关联和总图。
