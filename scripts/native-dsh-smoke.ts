import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dshVersion = "0.1.0-rc.8";
const demoFramesDirectory = process.env.OH_STORY_DEMO_FRAMES_DIR;

async function captureDemoFrame(page: Page, workbench: "story" | "drama", index: number): Promise<void> {
  if (demoFramesDirectory === undefined) return;
  await mkdir(demoFramesDirectory, { recursive: true });
  await page.waitForTimeout(180);
  await page.screenshot({
    path: join(demoFramesDirectory, `${workbench}-${String(index).padStart(2, "0")}.png`),
    animations: "disabled"
  });
}

async function prepareDemoSurface(page: Page): Promise<void> {
  if (demoFramesDirectory === undefined) return;
  const failure = page.getByText(/^This (?:turn|has) failed\b/iu).first();
  if (await failure.count() > 0) {
    await failure.evaluate((element) => {
      let container = element as HTMLElement;
      while (container.parentElement !== null) {
        const parent = container.parentElement;
        const box = parent.getBoundingClientRect();
        if (box.height > 240 || box.width > 520) break;
        container = parent;
      }
      container.style.display = "none";
    });
    if (await failure.isVisible()) throw new Error("Credential failure card remained visible on the demo surface.");
  }
  const collapse = page.getByRole("button", { name: /^(?:Collapse sidebar|收起侧边栏)$/u }).first();
  await collapse.waitFor({ state: "visible", timeout: 10_000 });
  await collapse.click();
  await page.getByRole("button", { name: /^(?:Open sidebar|打开侧边栏)$/u }).first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(350);
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve a DSH test port.");
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return address.port;
}

async function waitForServer(origin: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(origin)).ok) return; } catch { /* retry */ }
    await new Promise((accept) => setTimeout(accept, 150));
  }
  throw new Error("Timed out waiting for official DSH Web.");
}

async function rpc<T>(origin: string, method: string, payload: unknown): Promise<T> {
  const rpcId = `oh-story-smoke-${crypto.randomUUID()}`;
  const deadline = Date.now() + 15_000;
  while (true) {
    const response = await fetch(`${origin}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload })
    });
    const body = await response.text();
    if (response.status === 404 && body.trim() === "not found" && Date.now() < deadline) {
      await new Promise((accept) => setTimeout(accept, 100));
      continue;
    }
    let envelope: {
      readonly rpcId: string;
      readonly result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
    };
    try { envelope = JSON.parse(body) as typeof envelope; }
    catch { throw new Error(`DSH ${method} returned HTTP ${String(response.status)} with a non-JSON body: ${body.slice(0, 200)}`); }
    if (!response.ok || envelope.rpcId !== rpcId || !envelope.result.ok) {
      throw new Error(`DSH ${method} failed: ${JSON.stringify(envelope)}`);
    }
    return envelope.result.value;
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise<void>((accept) => child.once("exit", () => accept())),
    new Promise<void>((accept) => setTimeout(accept, 3_000))
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function main(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oh-story-native-dsh-smoke-"));
  const packDirectory = join(temporaryRoot, "pack");
  const installation = join(temporaryRoot, "dsh");
  const dshHome = join(temporaryRoot, "home");
  const fixtureRoot = join(temporaryRoot, "workspace");
  const origin = `http://127.0.0.1:${String(await freePort())}`;
  const logs: string[] = [];
  let child: ChildProcess | undefined;
  try {
    await Promise.all([
      mkdir(join(fixtureRoot, "正文"), { recursive: true }),
      mkdir(join(fixtureRoot, "大纲"), { recursive: true }),
      mkdir(join(fixtureRoot, "设定", "角色"), { recursive: true }),
      mkdir(join(fixtureRoot, "追踪"), { recursive: true }),
      mkdir(join(fixtureRoot, "剧集", "EP001", "分镜"), { recursive: true }),
      mkdir(join(fixtureRoot, "项目开发"), { recursive: true }),
      mkdir(join(fixtureRoot, "设定集", "角色"), { recursive: true }),
      mkdir(join(fixtureRoot, "交付", "EP001"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(join(fixtureRoot, "正文", "第001章_雨夜.md"), [
        "# 第一章 雨夜", "", "> 本章目标：让铜钥匙第一次回应旧站，并留下站内仍有人活动的证据。", "",
        "## 旧站", "", "雨线斜切过废弃站牌。林舟把铜钥匙攥在掌心，锯齿硌得发疼。", "",
        "售票窗后的灯忽然亮了。玻璃上没有人影，只有一张新写的车票慢慢滑到窗口前。", "",
        "**终点：旧渡站。发车时间：二十三年前。**"
      ].join("\n")),
      writeFile(join(fixtureRoot, "大纲", "细纲_第001章.md"), [
        "# 第一章细纲", "", "| 节拍 | 冲突 | 结果 |", "| :--- | :--- | :--- |",
        "| 抵达旧站 | 林舟想避雨，却发现站内有灯 | 被迫进入 |",
        "| 车票出现 | 车票日期早于林舟出生 | 铜钥匙发热 |", "",
        "- [x] 建立雨夜与废站氛围", "- [x] 投放铜钥匙异常", "- [ ] 回收售票员身份"
      ].join("\n")),
      writeFile(join(fixtureRoot, "设定", "角色", "林舟.md"), "# 林舟\n\n谨慎，随身携带一把来历不明的铜钥匙。\n"),
      writeFile(join(fixtureRoot, "追踪", "_tracking-state.json"), '{"state_revision":1,"last_committed_chapter":1}\n'),
      writeFile(join(fixtureRoot, "追踪", "characters.jsonl"), [
        '{"record_type":"character","character_id":"CHAR-LINZHOU","display_name":"林舟","status":"active","traits":["谨慎","观察敏锐"]}',
        '{"record_type":"mystery","record_id":"MYSTERY-COPPER-KEY","title":"铜钥匙来历","status":"open","first_seen":"正文/第001章_雨夜.md"}'
      ].join("\n") + "\n"),
      writeFile(join(fixtureRoot, "short-drama.json"), `${JSON.stringify({
        schema_version: "1.0.0-draft",
        project_id: "SMOKE-DRAMA",
        title: "雨停之前",
        format: { aspect_ratio: "9:16", episode_count: 8 }
      }, null, 2)}\n`),
      writeFile(join(fixtureRoot, "剧集", "EP001", "screenplay.md"), [
        "# EP001 雨停之前", "", "> 本集钩子：失踪二十三年的末班车，在暴雨夜重新进站。", "",
        "## 1-1 旧渡站 / 夜 / 外", "", "雨水漫过站台边缘。林舟追着一张泛黄车票冲进候车厅。", "",
        "电子钟从 **23:47** 跳回 **00:01**。", "", "售票窗后传来女人的声音：", "",
        "“你终于来接我了。”"
      ].join("\n")),
      writeFile(join(fixtureRoot, "剧集", "EP001", "分镜", "shots.jsonl"), [
        '{"record_type":"shot","shot_id":"EP001-SC001-SH001","title":"雨夜建立镜头","status":"approved","scale":"wide"}',
        '{"record_type":"shot","shot_id":"EP001-SC001-SH002","title":"车票特写","status":"draft","scale":"close-up"}'
      ].join("\n") + "\n"),
      writeFile(join(fixtureRoot, "项目开发", "creative-brief.md"), [
        "# 《雨停之前》创作简报", "", "## 项目定位", "",
        "| 维度 | 决策 |", "| --- | --- |", "| 类型 | 都市悬疑 · 亲情救赎 |", "| 规格 | 8 集 · 9:16 |", "| 核心钩子 | 末班车连接两个时间 |", "",
        "- [x] 首集建立失踪谜案", "- [x] 每集保留时间倒计时", "- [ ] 第四集揭示母亲身份"
      ].join("\n")),
      writeFile(join(fixtureRoot, "设定集", "角色", "characters.jsonl"), [
        '{"record_type":"character","character_id":"CHAR-LINZHOU","display_name":"林舟","status":"locked","role":"追查母亲失踪的记者"}',
        '{"record_type":"character","character_id":"CHAR-SUYU","display_name":"苏雨","status":"mystery","role":"末班车售票员"}',
        '{"record_type":"relationship","record_id":"REL-001","title":"林舟与苏雨","status":"hidden","truth":"母子"}'
      ].join("\n") + "\n"),
      writeFile(join(fixtureRoot, "交付", "EP001", "video-prompts.md"), "# EP001 视频提示词\n\n竖屏 9:16，冷蓝雨夜，镜头缓慢推进废弃售票窗。\n")
    ]);
    run("pnpm", ["--filter", "@oh-story/dsh", "build"]);
    run("pnpm", ["--filter", "@oh-story/dsh", "pack", "--pack-destination", packDirectory]);
    await mkdir(installation, { recursive: true });
    await writeFile(join(installation, "package.json"), `${JSON.stringify({ private: true, dependencies: { "@deepseek-ai/dsh": dshVersion } }, null, 2)}\n`);
    await writeFile(join(installation, "pnpm-workspace.yaml"), [
      "packages:", "  - .", "nodeLinker: hoisted", "allowBuilds:",
      "  '@deepseek-ai/dsh-subprocess-local': true", "  '@google/genai': false", "  koffi: true",
      "  node-addon-require-builtin: false", "  node-pty: true", "  protobufjs: false", ""
    ].join("\n"));
    try { run("pnpm", ["--dir", installation, "install", "--offline"]); }
    catch { run("pnpm", ["--dir", installation, "install"]); }
    const dshBin = join(installation, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    const tarball = (await readdir(packDirectory)).find((entry) => entry.endsWith(".tgz"));
    if (tarball === undefined) throw new Error("Plugin pack did not create a tarball.");
    const archivePath = join(packDirectory, tarball);
    const archive = spawnSync("tar", ["-tzf", archivePath], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    if (archive.status !== 0) throw new Error(`Could not inspect plugin tarball:\n${archive.stderr}`);
    const entries = new Set(archive.stdout.split("\n").filter((entry) => entry !== ""));
    for (const required of [
      "package/LICENSE", "package/README.md", "package/cordis.patch.yml", "package/package.json",
      "package/lib/index.js", "package/lib/client.js", "package/lib/oh-story/manifest.json", "package/lib/drama/manifest.json"
    ]) {
      if (!entries.has(required)) throw new Error(`Plugin tarball is missing ${required}.`);
    }
    for (const entry of entries) {
      if (/\/(?:src|tests)\//u.test(entry) || /dashboard_server\.py$/u.test(entry) || entry.endsWith("/.DS_Store")) {
        throw new Error(`Plugin tarball retained forbidden content: ${entry}`);
      }
    }
    const env = { ...process.env, DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: "1" };
    run(process.execPath, [dshBin, "plugin", "--profile", "web", "add", archivePath], env);
    const port = new URL(origin).port;
    child = spawn(process.execPath, [dshBin, "web", "--no-open", "--port", port], {
      cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
    await waitForServer(origin);

    const createdWorkspace = await rpc<{ readonly workspace: { readonly workspaceId: string; readonly title: string } }>(origin, "workspace.create", { path: fixtureRoot });
    const createdSession = await rpc<{ readonly sessionId: string }>(origin, "session.create", { workspaceId: createdWorkspace.workspace.workspaceId });
    const catalog = await rpc<{ readonly skills: readonly { readonly name: string }[] }>(origin, "skill.list", { sessionId: createdSession.sessionId });
    const ohStorySkills = catalog.skills.filter((skill) => skill.name === "story" || skill.name.startsWith("story-") || skill.name === "browser-cdp");
    const dramaSkills = catalog.skills.filter((skill) => skill.name === "short-drama" || skill.name.startsWith("short-drama-"));
    if (ohStorySkills.length !== 13) throw new Error(`Expected 13 Oh Story Skills, found ${String(ohStorySkills.length)}.`);
    if (dramaSkills.length !== 10) throw new Error(`Expected 10 Drama Skills, found ${String(dramaSkills.length)}.`);
    // DSH intentionally hides every conversation tab while a Session is in its
    // pristine blank-hero state. A credential-less prompt still creates the
    // durable user turn needed to exercise the real tab host.
    await rpc(origin, "session.prompt", {
      sessionId: createdSession.sessionId,
      mode: "queue",
      content: [{ type: "text", text: "请帮我继续完善这个故事。" }]
    });
    const nonBlankDeadline = Date.now() + 15_000;
    let nonBlank = false;
    while (Date.now() < nonBlankDeadline) {
      const sessions = await rpc<{ readonly items: readonly { readonly sessionId: string; readonly blank: boolean }[] }>(origin, "session.list", {});
      if (sessions.items.find((item) => item.sessionId === createdSession.sessionId)?.blank === false) { nonBlank = true; break; }
      await new Promise((accept) => setTimeout(accept, 100));
    }
    if (!nonBlank) throw new Error("DSH Session did not leave its blank-hero state after the smoke prompt.");
    const smokeTitle = "Oh Story Native Smoke";
    await rpc(origin, "session.rename", { sessionId: createdSession.sessionId, title: smokeTitle });

    const workspaceResponse = await fetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(createdSession.sessionId)}`);
    const workspace = await workspaceResponse.json() as { readonly mode?: string; readonly cwd?: string; readonly files?: readonly { readonly path: string }[]; readonly shortDrama?: { readonly title?: string } };
    if (!workspaceResponse.ok || workspace.mode !== "dsh-session" || workspace.cwd !== await realpath(fixtureRoot) || !workspace.files?.some((file) => file.path.startsWith("正文/")) || workspace.shortDrama?.title !== "雨停之前") {
      throw new Error(`Session-scoped workspace route failed: ${JSON.stringify(workspace)}`);
    }
    const escaped = await fetch(`${origin}/oh-story/file?sessionId=${encodeURIComponent(createdSession.sessionId)}&path=${encodeURIComponent("../package.json")}`);
    if (escaped.ok) throw new Error("Workspace route allowed path traversal.");

    const index = await (await fetch(origin)).text();
    const clientPath = index.match(/\/plugins\/[^"']*oh-story[^"']*client\.js[^"']*/u)?.[0];
    if (clientPath === undefined) throw new Error("DSH did not publish the Oh Story Browser module.");
    const client = await (await fetch(new URL(clientPath, origin))).text();
    for (const slot of ["conversation.session.header.actions", "tool.call.toolview"]) {
      if (!client.includes(slot)) throw new Error(`Browser module is missing official slot ${slot}.`);
    }
    for (const forbidden of ["shell.overlay", "EventSource", "FakeRuntimeAdapter"]) {
      if (client.includes(forbidden)) throw new Error(`Browser module still contains legacy surface ${forbidden}.`);
    }

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1_440, height: 900 } });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(origin, { waitUntil: "networkidle" });
      for (const name of [/^(?:Continue|继续)$/u, /^(?:Configure later|稍后配置)$/u]) {
        const button = page.getByRole("button", { name });
        try {
          await button.waitFor({ state: "visible", timeout: 10_000 });
          await button.click();
        } catch { /* the step may already be persisted */ }
      }
      await page.locator('[class*="onboardingOverlay"]').waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
      const workspaceRow = page.getByRole("treeitem").filter({ hasText: createdWorkspace.workspace.title }).first();
      await workspaceRow.waitFor({ state: "visible", timeout: 10_000 });
      if (await workspaceRow.getAttribute("aria-expanded") !== "true") await workspaceRow.click();
      const sessionRow = page.getByRole("treeitem").filter({ hasText: smokeTitle }).first();
      await sessionRow.waitFor({ state: "visible", timeout: 10_000 });
      await sessionRow.click();
      const storyTree = page.getByRole("navigation", { name: "小说项目文件" });
      try { await storyTree.waitFor({ state: "visible", timeout: 20_000 }); }
      catch (error) {
        const tabs = await page.getByRole("tab").allTextContents();
        const body = (await page.locator("body").innerText()).slice(0, 4_000);
        throw new Error(`Three-column story surface was not visible; tabs=${JSON.stringify(tabs)}; pageErrors=${JSON.stringify(pageErrors)}; body=${JSON.stringify(body)}`, { cause: error });
      }
      await page.getByText("请帮我继续完善这个故事。", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await prepareDemoSurface(page);
      const previewTab = page.getByRole("tab", { name: "预览" });
      await previewTab.waitFor({ state: "visible", timeout: 10_000 });
      if (await page.getByRole("button", { name: "已保存", exact: true }).count() !== 0) throw new Error("Editor header still renders a redundant saved button.");
      await page.getByRole("button", { name: "第001章_雨夜.md", exact: true }).click();
      await page.getByRole("article", { name: "正文/第001章_雨夜.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "story", 1);
      await page.locator(".oh-story-file-group > summary").filter({ hasText: "大纲" }).click();
      await page.getByRole("button", { name: "细纲_第001章.md", exact: true }).click();
      const outline = page.getByRole("article", { name: "大纲/细纲_第001章.md 渲染预览" });
      await outline.waitFor({ state: "visible", timeout: 10_000 });
      if (await outline.locator("table").count() !== 1 || await outline.getByRole("checkbox").count() !== 3) {
        throw new Error("Markdown preview did not render the outline table and task list.");
      }
      await captureDemoFrame(page, "story", 2);
      await page.locator(".oh-story-file-group > summary").filter({ hasText: "追踪" }).click();
      await page.getByRole("button", { name: "characters.jsonl", exact: true }).click();
      const jsonlPreview = page.getByRole("region", { name: "追踪/characters.jsonl 结构化预览" });
      await jsonlPreview.waitFor({ state: "visible", timeout: 10_000 });
      await jsonlPreview.getByText("2 条记录", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "story", 3);
      await page.getByRole("tab", { name: "源码", exact: true }).click();
      await page.getByRole("textbox", { name: "追踪/characters.jsonl" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "story", 4);
      await page.getByRole("tab", { name: "短剧", exact: true }).click();
      const dramaTree = page.getByRole("navigation", { name: "短剧项目文件" });
      await dramaTree.waitFor({ state: "visible", timeout: 10_000 });
      await dramaTree.locator(".oh-story-file-folder > summary").filter({ hasText: "EP001" }).first().waitFor({ state: "visible", timeout: 10_000 });
      await dramaTree.locator(".oh-story-file-folder > summary").filter({ hasText: "分镜" }).waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("button", { name: "screenplay.md", exact: true }).click();
      await page.getByRole("article", { name: "剧集/EP001/screenplay.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 1);
      await page.locator(".oh-story-file-group > summary").filter({ hasText: "项目开发" }).click();
      await page.getByRole("button", { name: "creative-brief.md", exact: true }).click();
      await page.getByRole("article", { name: "项目开发/creative-brief.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 2);
      await page.locator(".oh-story-file-group > summary").filter({ hasText: "设定集" }).click();
      await dramaTree.locator(".oh-story-file-folder > summary").filter({ hasText: "角色" }).click();
      await page.getByRole("button", { name: "characters.jsonl", exact: true }).click();
      const dramaJsonl = page.getByRole("region", { name: "设定集/角色/characters.jsonl 结构化预览" });
      await dramaJsonl.waitFor({ state: "visible", timeout: 10_000 });
      await dramaJsonl.getByText("3 条记录", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 3);
      await page.locator(".oh-story-file-group > summary").filter({ hasText: /^项目\d+$/u }).click();
      await page.getByRole("button", { name: "short-drama.json", exact: true }).click();
      await page.getByRole("textbox", { name: "short-drama.json" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 4);
      if (await page.getByRole("complementary", { name: "Agent 工作详情" }).count() !== 0) {
        throw new Error("Novel workspace still duplicates the official Agent activity UI.");
      }
      const treeBox = await page.locator(".oh-story-tree").boundingBox();
      const editorBox = await page.locator(".oh-story-editor").boundingBox();
      const chatLocator = page.locator('[data-slot="conversation.session"] > :not(.oh-story-split-surface)');
      const chatBox = await chatLocator.boundingBox();
      const composerLocator = page.locator("[data-composer-seat]");
      const composerBox = await composerLocator.boundingBox();
      if (treeBox === null || editorBox === null || chatBox === null || composerBox === null) throw new Error("Missing three-column layout box.");
      const geometry = {
        ordered: treeBox.x + treeBox.width <= editorBox.x + 1 && editorBox.x + editorBox.width <= chatBox.x + 1,
        composerInsideChat: composerBox.x >= chatBox.x - 1 && composerBox.x + composerBox.width <= chatBox.x + chatBox.width + 1,
        widths: [treeBox.width, editorBox.width, chatBox.width]
      };
      if (!geometry.ordered || !geometry.composerInsideChat || geometry.widths.some((width) => width < 120)) {
        throw new Error(`Invalid three-column geometry: ${JSON.stringify(geometry)}`);
      }
      const scrollerLocator = page.locator("[data-conversation-scroll]");
      const scrollViewport = await scrollerLocator.boundingBox();
      if (scrollViewport === null) throw new Error("Missing conversation scroll viewport.");
      const priorMinHeight = await chatLocator.evaluate((element) => element.style.minHeight);
      const viewportHeight = await scrollerLocator.evaluate((element) => element.clientHeight);
      await chatLocator.evaluate((element, height) => { element.style.minHeight = height; }, `${String(viewportHeight * 4)}px`);
      const scrollHeight = await scrollerLocator.evaluate((element) => element.scrollHeight);
      const composerScroll: { readonly top: number; readonly visible: boolean }[] = [];
      for (const top of [0, (scrollHeight - viewportHeight) / 2, scrollHeight]) {
        await scrollerLocator.evaluate((element, nextTop) => { element.scrollTo({ top: nextTop }); }, top);
        await page.waitForTimeout(50);
        const input = await composerLocator.boundingBox();
        if (input === null) throw new Error("Official Composer disappeared while scrolling.");
        composerScroll.push({
          top: input.y,
          visible: input.y >= scrollViewport.y - 1 && input.y + input.height <= scrollViewport.y + scrollViewport.height + 1
        });
      }
      await chatLocator.evaluate((element, height) => { element.style.minHeight = height; }, priorMinHeight);
      await scrollerLocator.evaluate((element) => { element.scrollTo({ top: 0 }); });
      if (composerScroll.some((sample) => !sample.visible) || Math.max(...composerScroll.map((sample) => sample.top)) - Math.min(...composerScroll.map((sample) => sample.top)) > 1) {
        throw new Error(`Official Composer did not remain fixed while Chat scrolled: ${JSON.stringify(composerScroll)}`);
      }
      if (pageErrors.length > 0) throw new Error(`Browser module raised errors: ${pageErrors.join("; ")}`);
    } finally {
      await browser.close();
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      dshVersion,
      architecture: "pure-plugin",
      sessionApi: true,
      skills: ohStorySkills.length,
      dramaSkills: dramaSkills.length,
      uiSlots: ["conversation.session.header.actions", "tool.call.toolview"],
      threeColumn: true
    })}\n`);
  } catch (error) {
    throw new Error(`${String(error)}\nDSH logs:\n${logs.join("").slice(-16_000)}`, { cause: error });
  } finally {
    if (child !== undefined) await stop(child);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
