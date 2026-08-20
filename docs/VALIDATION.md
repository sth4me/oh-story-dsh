# Validation

Target: DeepSeek Harness `0.1.0-rc.8` · validated 2026-08-20.

## Automated coverage

| Area | Evidence |
| --- | --- |
| Capability catalog | Native DSH Session exposes 13 Oh Story Skills and 10 Drama Skills |
| Upstream integrity | Both knowledge manifests verify pinned commits, catalogs and file hashes |
| Plugin boundary | Host bundle and source audit keep all DSH imports inside `@oh-story/dsh` |
| Workspace safety | Unit tests cover canonical paths, missing write targets, traversal, absolute paths and symbolic-link escape |
| File following | Unit tests cover partial tool JSON, streamed write/edit projection, creative path classification and workbench switching |
| Three-column layout | Native DSH Chrome smoke checks ordered tree/editor/Chat geometry and minimum usable widths |
| Composer stability | Scroll regression confirms the official Composer remains fixed inside the Chat column |
| Dual workbench | Native smoke switches 小说/短剧, opens a drama file and verifies Markdown preview/source modes |
| Editor header | Native smoke asserts that the saved state has no redundant action button |
| Roles and hooks | Unit tests cover Role catalog, DSH child-Agent invocation and novel mutation guards |
| Package contents | Build and pack include both pinned knowledge sets and omit the Drama Skills standalone Dashboard surface |

## Manual Chrome audit

The packaged plugin was installed into official DSH Web and opened against the Drama Skills golden project. The audit confirmed:

- short-drama metadata selects the 短剧 workbench and displays title, episode count and aspect ratio;
- the initial document is `剧集/EP001/screenplay.md` in rendered preview mode;
- top-level project areas and episode folders are independently collapsible;
- Markdown preview/source switching preserves the current file and shared buffer;
- the official Chat, Trajectory and bottom Composer remain in the third column;
- the same live page produced `docs/images/short-drama-dsh-demo.gif`.

The novel workbench was previously audited with a 5,298 px conversation and a real streamed file write. The Composer retained the same viewport position at the top, middle and end of the message scroll; the editor observed 94 incremental content states during the write.

## Commands

```bash
pnpm verify
pnpm test:dsh
DEEPSEEK_API_KEY_FILE=/path/to/key pnpm test:dsh:real
```

`test:dsh:real` creates an isolated temporary project and DSH home, runs a read-only `story-review` through the official DeepSeek provider, requires bundled Role calls and durable completion, verifies the project tree is unchanged, and redacts the credential from all errors and logs.

Latest real-model observation: `deepseek-official/deepseek-v4-flash`, 3 `oh_story_role` calls, 16,072 durable Session events, successful completion and an unchanged project digest. Event totals are observational and are not fixed test assertions.
