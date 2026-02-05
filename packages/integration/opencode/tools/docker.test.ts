import { test, expect } from "bun:test";

test("opencode docker image runs", async () => {
  // Some environments (sandboxes/CI) don't support Docker networking.
  const info = Bun.spawn(["docker", "info"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const infoCode = await info.exited;
  if (infoCode !== 0) return;

  const image = "spall-opencode-test:local";

  const build = Bun.spawn(
    ["docker", "build", "-t", image, "packages/integration/opencode"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const buildOut = await new Response(build.stdout).text();
  const buildErr = await new Response(build.stderr).text();
  const buildLog = buildOut + "\n" + buildErr;
  const buildCode = await build.exited;
  if (buildCode !== 0) {
    if (
      buildLog.includes("operation not supported") ||
      buildLog.includes("failed to create endpoint")
    ) {
      return;
    }
    expect(buildCode, `docker build failed: ${buildLog}`).toBe(0);
  }

  const run = Bun.spawn(
    ["docker", "run", "--rm", image, "opencode", "--help"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const out = await new Response(run.stdout).text();
  const err = await new Response(run.stderr).text();
  const code = await run.exited;
  expect(code, `docker run failed: ${err}`).toBe(0);
  expect(out.toLowerCase()).toContain("opencode");

  // Exercise the custom tools without calling any AI model.
  // This uses OpenCode's debug command to execute a tool directly.
  const toolRun = Bun.spawn(
    [
      "docker",
      "run",
      "--rm",
      image,
      "opencode",
      "debug",
      "agent",
      "build",
      "--tool",
      "spall",
      "--params",
      '{"mode":"list","path":"workers"}',
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const toolOut = await new Response(toolRun.stdout).text();
  const toolErr = await new Response(toolRun.stderr).text();
  const toolCode = await toolRun.exited;
  expect(toolCode, `tool exec failed: ${toolErr}`).toBe(0);
  expect(toolOut).toContain("SPALLM_STUB list workers");

  // Also exercise opencode run; ensure we pin the model.
  // This may be skipped in environments without model availability.
  const runMsg = Bun.spawn(
    [
      "docker",
      "run",
      "--rm",
      image,
      "opencode",
      "run",
      "--model",
      "opencode/big-pickle",
      "--format",
      "json",
      "Use the spall tool with mode=list and path=workers.",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const runMsgOut = await new Response(runMsg.stdout).text();
  const runMsgErr = await new Response(runMsg.stderr).text();
  const runMsgCode = await runMsg.exited;
  if (runMsgCode === 0) {
    expect(runMsgOut).toContain("spall");
  } else {
    // If opencode/big-pickle isn't available in the environment, don't fail this test.
    if (!runMsgErr.toLowerCase().includes("big-pickle")) {
      expect(runMsgCode, `opencode run failed: ${runMsgErr}`).toBe(0);
    }
  }
}, 120_000);
