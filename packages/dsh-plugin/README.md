# @oh-story/dsh

`oh-story-dsh` 是 DeepSeek Harness 的原生小说与短剧创作插件，提供：

- 13 个 Oh Story 小说 Skills 与 7 个专业 Roles；
- 10 个 Drama Skills 短剧流程；
- 小说协议 hooks 与安全的 Session workspace 文件路由；
- 文件树、创作文档编辑器和官方 Chat 组成的三栏工作台；
- Markdown 与 JSONL 结构化预览；
- `oh_story_role` 原生子 Agent 工具视图。

## 安装

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @oh-story/dsh
npx -y @deepseek-ai/dsh web
```

将作品目录添加为 DSH workspace，然后在普通 Agent 会话中使用 `/story` 或 `/short-drama`。模型、凭据、Preset、权限、会话记录、停止/继续、Todo、审批和 Composer 均使用当前 DeepSeek Harness 配置与界面。

## License

[MIT](LICENSE)
