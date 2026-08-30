# Tauri 2 + Tiptap + 每作品 SQLite

写作区已定为邻侧三栏的 Web 界面，正文需要带 Schema 的轻量富文本，作品还必须是资源管理器可整夹复制的数据包。因此桌面壳选用 Tauri 2（React/TypeScript 前端 + Rust 核心），编辑器选用 Tiptap 的 MIT 核心（权威状态为带 `document_schema_version` 的 JSON），每部作品用一个 SQLite 加 `assets` 目录；依赖只选开源、免费、成熟方案，不接商业云或付费扩展。

## Considered Options

- **Electron**：整栈 TypeScript、Chromium 钉死，但发行物和更新面最大，只在拒绝 Rust 时才值得换。
- **WPF / WinUI 3 + WebView2**：C# 管文件很熟，但要同时养原生壳和网页编辑器，和已定的整窗 Web 信息架构重复。
- **Lexical 或原生 RichTextBox**：前者序列化要自管节点版本，后者没有应用级文档 Schema，都不适合当正文权威。
- **把图片打进 SQLite BLOB，或用散 Markdown 当权威**：前者让库和恢复点膨胀，后者没有跨文件事务，也装不下关联。

## Consequences

- Windows 使用系统 WebView2（Evergreen）；干净 Win10 可能要提示安装运行时。
- 作品库路径等应用偏好放在 `%APPDATA%`，不进作品库。
- 恢复点必须用 SQLite Backup API / `VACUUM INTO`，不能热拷贝打开中的数据库。
- 库结构版本（`PRAGMA user_version`）和正文 JSON 版本分开；打开作品做迁移前先打恢复点。
