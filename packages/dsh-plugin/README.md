# @oh-story/dsh

Oh Story DSH 是 DeepSeek Harness 的原生小说与短剧创作插件。它在当前 DSH Session 中注册：

- 13 个 Oh Story 小说 Skills 与 7 个专业 Roles；
- 10 个 Drama Skills 短剧流程；
- 小说协议 hooks 与安全的 Session workspace 文件路由；
- 文件树、Markdown 编辑器和官方 Chat 组成的三栏工作台；
- `oh_story_role` 的 DSH 原生子 Agent 工具视图。

## 安装

```bash
dsh plugin --profile web add @oh-story/dsh
dsh web
```

本地打包版本：

```bash
dsh plugin --profile web add /absolute/path/to/oh-story-dsh-0.1.0-alpha.0.tgz
```

将作品目录添加为 DSH workspace，然后在普通 Agent 会话中使用 `/story` 或 `/short-drama`。文件工具运行时，工作台会自动定位目标并显示流式内容；Chat 中的作品文件链接也会同步树与编辑器。Markdown 文件支持预览和源码编辑。

可选配置：

```yaml
- id: oh-story
  config:
    editorMaxBytes: 2097152
```

模型、凭据、Preset、权限、会话记录、停止/继续、Todo、审批和 Composer 均使用当前 DeepSeek Harness 配置与界面。

## License

[MIT](../../LICENSE)
