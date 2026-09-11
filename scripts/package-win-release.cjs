const { spawnSync } = require("node:child_process");

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(packageManager, ["package:win"], {
  env: {
    ...process.env,
    SUYAN_PUBLISH_RELEASE: "1",
  },
  // Windows exposes pnpm as a .cmd shim; Node requires shell dispatch for
  // spawnSync to execute that shim reliably across installed Node versions.
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(`无法启动发布打包命令：${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
