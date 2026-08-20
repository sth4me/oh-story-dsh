import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { build, type Plugin } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const packageRoot = resolve(root, "packages/dsh-plugin");
const outputRoot = resolve(packageRoot, "lib");
const vendorRoot = resolve(root, "packages/knowledge/vendor");
const dramaVendorRoot = resolve(root, "packages/knowledge/drama");
const platformGlue = [
  "skills/story/assets/",
  "skills/story/scripts/",
  "skills/browser-cdp/scripts/setup-cdp-chrome.js",
  "skills/story-setup/references/codex/",
  "skills/story-setup/references/generic/",
  "skills/story-setup/references/openclaw/",
  "skills/story-setup/references/opencode/",
  "skills/story-setup/references/reasonix/",
  "skills/story-setup/references/templates/",
  "skills/story-setup/references/zcode/",
  "skills/story-setup/scripts/merge-claude-settings.py",
  "skills/story-setup/scripts/merge-codex-hooks.py",
  "skills/story-setup/UPGRADING.md"
] as const;

const inlineCss: Plugin = {
  name: "inline-css",
  setup(builder) {
    builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -"?inline".length)),
      namespace: "inline-css"
    }));
    builder.onLoad({ filter: /.*/, namespace: "inline-css" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text"
    }));
  }
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(outputRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  treeShaking: true,
  packages: "bundle",
  external: ["@deepseek-ai/*"]
});

const hostEntry = resolve(outputRoot, "index.js");
await writeFile(hostEntry, (await readFile(hostEntry, "utf8")).replace(/[\t ]+$/gmu, ""));

await build({
  entryPoints: [resolve(packageRoot, "src/client/index.tsx")],
  outfile: resolve(outputRoot, "client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["chrome120", "safari17"],
  sourcemap: true,
  treeShaking: true,
  external: ["react", "react/jsx-runtime", "react-dom/client"],
  plugins: [inlineCss],
  banner: { js: "window.__ModuleLoader__.load({id:\"@oh-story/dsh\",factory:(require)=>{var module={exports:{}};var exports=module.exports;" },
  footer: { js: ";return module.exports;}});" }
});

await cp(vendorRoot, resolve(outputRoot, "knowledge"), {
  recursive: true,
  filter: (source) => {
    const normalized = source.replaceAll("\\", "/");
    const bundledPath = relative(vendorRoot, source).replaceAll("\\", "/");
    return !normalized.includes("/__pycache__/")
      && !normalized.endsWith("/__pycache__")
      && !normalized.endsWith(".pyc")
      && !normalized.endsWith("/.DS_Store")
      && !platformGlue.some((entry) => bundledPath === entry.replace(/\/$/u, "") || bundledPath.startsWith(entry));
  }
});

await cp(dramaVendorRoot, resolve(outputRoot, "drama"), {
  recursive: true,
  filter: (source) => {
    return !source.includes("/__pycache__/")
      && !source.endsWith("/__pycache__")
      && !source.endsWith(".pyc")
      && !source.endsWith("/.DS_Store");
  }
});

const hostBundle = await readFile(hostEntry, "utf8");
for (const forbidden of ["dsh-sdk-jsonrpc", "DeepSeekHarness", "FakeRuntimeAdapter", "NativeDshRuntimeAdapter", "EventSource"]) {
  if (hostBundle.includes(forbidden)) {
    throw new Error(`Native DSH plugin bundle retained forbidden parallel runtime code: ${forbidden}`);
  }
}
