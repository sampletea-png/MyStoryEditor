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

## 阶段 1

作品库、数据包、卷章、Tiptap、约 3 秒自动保存、字数、保存失败拦截、进程单实例。规格见 `docs/mvp-spec.md`，路线见 `docs/roadmap.md`。
