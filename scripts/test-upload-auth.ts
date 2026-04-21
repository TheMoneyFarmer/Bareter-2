import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const TEST_PORT = Number(process.env.TEST_PORT ?? 5151);
const READY_TIMEOUT_MS = 60_000;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? "admin@bartergram.ae";
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? "password123";

type Result = { ok: boolean; name: string; detail?: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  const line = `[${tag}] ${name}${detail ? ` — ${detail}` : ""}`;
  if (ok) console.log(line);
  else console.error(line);
}

async function waitForReady(child: ChildProcessWithoutNullStreams): Promise<boolean> {
  const startedAt = Date.now();
  let ready = false;

  const onData = (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(`[server] ${text}`);
    if (text.includes(`serving on port ${TEST_PORT}`)) ready = true;
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", (chunk) => process.stderr.write(`[server-err] ${chunk}`));

  while (!ready && Date.now() - startedAt < READY_TIMEOUT_MS) {
    await wait(250);
  }
  return ready;
}

function extractSessionCookie(headers: Headers): string | null {
  const cookies =
    typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  for (const header of cookies) {
    const first = header.split(";")[0];
    if (first && /sid|connect|sess/i.test(first)) return first;
  }
  return cookies[0]?.split(";")[0] ?? null;
}

// Session cookies are flagged `secure: true`, so on plain HTTP express-session
// only emits `Set-Cookie` when the request looks like HTTPS via trust-proxy.
const PROXY_HEADERS = { "x-forwarded-proto": "https" } as const;

async function runTests(baseUrl: string) {
  // 1) Anonymous request must be rejected with 401.
  {
    const res = await fetch(`${baseUrl}/api/uploads/request-url`, {
      method: "POST",
      headers: { "content-type": "application/json", ...PROXY_HEADERS },
      body: JSON.stringify({ name: "anon.png", size: 100, contentType: "image/png" }),
    });
    record(
      "POST /api/uploads/request-url without session returns 401",
      res.status === 401,
      `status=${res.status}`,
    );
  }

  // 2) Log in as a seeded user, then request an upload URL with the cookie.
  let cookie: string | null = null;
  {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...PROXY_HEADERS },
      body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
    });
    cookie = extractSessionCookie(res.headers);
    record(
      "Login with seeded admin returns 200 and a session cookie",
      res.status === 200 && !!cookie,
      `status=${res.status} cookie=${cookie ? "present" : "missing"}`,
    );
  }

  if (cookie) {
    const res = await fetch(`${baseUrl}/api/uploads/request-url`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...PROXY_HEADERS },
      body: JSON.stringify({ name: "ok.png", size: 100, contentType: "image/png" }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore; we'll still report on status alone
    }
    const hasUrl =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { uploadURL?: unknown }).uploadURL === "string";
    record(
      "POST /api/uploads/request-url with session returns 200 + uploadURL",
      res.status === 200 && hasUrl,
      `status=${res.status} hasUploadURL=${hasUrl}`,
    );
  } else {
    record("POST /api/uploads/request-url with session returns 200 + uploadURL", false, "skipped — no cookie");
  }
}

async function main() {
  console.log(`[test] booting server on port ${TEST_PORT}`);
  const child = spawn("npx", ["tsx", "server/index.ts"], {
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const cleanup = () => {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
        // tsx wraps node in a way that ignores SIGTERM in some setups, so
        // escalate to SIGKILL shortly after to avoid hanging the script.
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
        }, 500).unref();
      } catch {
        // ignore
      }
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  try {
    const ready = await waitForReady(child);
    if (!ready) {
      record("server boots within timeout", false, `did not see "serving on port ${TEST_PORT}" within ${READY_TIMEOUT_MS}ms`);
      throw new Error("server failed to start");
    }
    record("server boots within timeout", true);
    await runTests(`http://127.0.0.1:${TEST_PORT}`);
  } finally {
    cleanup();
    // Give the child a moment to exit cleanly before we report.
    await wait(250);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`[test] summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[test] unexpected error:", err);
  process.exit(1);
});
