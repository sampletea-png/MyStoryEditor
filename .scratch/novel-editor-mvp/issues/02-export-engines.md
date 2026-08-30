# 02: 正文导出引擎

**What to build:** 作者的章节正文能从编辑器文档变成 Markdown、纯文本和 DOCX 三个文件的字节，含卷章标题和基础样式，不含设定资料。本票只交付转换本身，不交付保存对话框。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Markdown 为 UTF-8 无 BOM，卷章标题为标题，粗体 / 斜体 / 删除线 / 分隔线有对应标记，没有设定资料
- [ ] 纯文本为 UTF-8 BOM，只留文字，去掉格式
- [ ] DOCX 由 MIT / Apache 库从编辑器 JSON 生成（禁止 Tiptap Pro 导出包），含中文标题与基础样式
- [ ] 用 Word 与 WPS 打开该 DOCX 能看到标题和基础样式
