import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frames = await mkdtemp(join(tmpdir(), "oh-story-dsh-demo-"));
const output = resolve(repositoryRoot, "docs/images/oh-story-dsh-demo.gif");

function run(command: string, args: readonly string[], env = process.env): void {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}

try {
  run("pnpm", ["test:dsh"], { ...process.env, OH_STORY_DEMO_FRAMES_DIR: frames });
  run("ffmpeg", [
    "-v", "error",
    "-framerate", "1/2",
    "-start_number", "1",
    "-i", join(frames, "story-%02d.png"),
    "-filter_complex",
    "scale=1200:-2:flags=lanczos,split[original][palette];[palette]palettegen=max_colors=128:stats_mode=diff[p];[original][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
    "-loop", "0",
    "-y",
    output
  ]);
  process.stdout.write(`Rendered ${output}\n`);
} finally {
  await rm(frames, { recursive: true, force: true });
}
