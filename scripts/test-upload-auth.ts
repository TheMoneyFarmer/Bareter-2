import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { createServer } from "node:net";

const EXPLICIT_PORT = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : null;
const READY_TIMEOUT_MS = 60_000;
let TEST_PORT = EXPLICIT_PORT ?? 5151;

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "0.0.0.0");
  });
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "0.0.0.0", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not determine port")));
      }
    });
  });
}

async function resolveTestPort(): Promise<number> {
  if (EXPLICIT_PORT !== null) {
    const free = await isPortFree(EXPLICIT_PORT);
    if (!free) {
      console.error(
        `[FAIL] TEST_PORT=${EXPLICIT_PORT} is already in use. Free it (e.g. \`fuser -k ${EXPLICIT_PORT}/tcp\`) or unset TEST_PORT to auto-pick a free port.`,
      );
      process.exit(1);
    }
    return EXPLICIT_PORT;
  }
  return pickFreePort();
}
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? "admin@bareter.com";
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
  let fatal = false;

  const onData = (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(`[server] ${text}`);
    if (text.includes(`serving on port ${TEST_PORT}`)) ready = true;
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(`[server-err] ${text}`);
    // Fail fast on port conflict instead of waiting the full READY_TIMEOUT_MS
    if (text.includes("EADDRINUSE")) fatal = true;
  });
  child.once("exit", () => { fatal = true; });

  while (!ready && !fatal && Date.now() - startedAt < READY_TIMEOUT_MS) {
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
// `origin` is set to baseUrl so the Day-5 origin-CSRF middleware accepts the
// state-changing requests below — this script's job is to exercise the AUTH
// gate, not the CSRF gate (which has its own coverage in tests/security.test.ts).
function commonHeaders(baseUrl: string) {
  return { "x-forwarded-proto": "https", origin: baseUrl } as const;
}

async function runTests(baseUrl: string) {
  const PROXY_HEADERS = commonHeaders(baseUrl);
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

  // 1b) Other AI cost endpoints must also reject anonymous requests with 401.
  {
    const res = await fetch(`${baseUrl}/api/generate-image`, {
      method: "POST",
      headers: { "content-type": "application/json", ...PROXY_HEADERS },
      body: JSON.stringify({ prompt: "anon test" }),
    });
    record(
      "POST /api/generate-image without session returns 401",
      res.status === 401,
      `status=${res.status}`,
    );
  }
  {
    const res = await fetch(`${baseUrl}/api/conversations`, {
      method: "GET",
      headers: { ...PROXY_HEADERS },
    });
    record(
      "GET /api/conversations without session returns 401",
      res.status === 401,
      `status=${res.status}`,
    );
  }
  {
    const res = await fetch(`${baseUrl}/api/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json", ...PROXY_HEADERS },
      body: JSON.stringify({ title: "anon" }),
    });
    record(
      "POST /api/conversations without session returns 401",
      res.status === 401,
      `status=${res.status}`,
    );
  }
  // The audio blueprint is mounted under `/voice` so its auth gate is
  // independently observable (the chat blueprint registers identical
  // `/api/conversations` paths and would otherwise shadow it).
  {
    const res = await fetch(`${baseUrl}/voice/api/conversations`, {
      method: "GET",
      headers: { ...PROXY_HEADERS },
    });
    record(
      "GET /voice/api/conversations (audio) without session returns 401",
      res.status === 401,
      `status=${res.status}`,
    );
  }
  {
    const res = await fetch(`${baseUrl}/voice/api/conversations/1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", ...PROXY_HEADERS },
      body: JSON.stringify({ audio: "" }),
    });
    record(
      "POST /voice/api/conversations/:id/messages (audio) without session returns 401",
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

    // In CI we typically don't have access to the Replit object-storage sidecar
    // (http://127.0.0.1:1106) that signs upload URLs, so the authenticated call
    // can legitimately fail with a 5xx for infrastructure reasons. The point
    // of *this* script is to guard the auth gate, so when running in
    // auth-only mode we just assert the request was NOT rejected as
    // unauthenticated (i.e. status is not 401/403). The full-stack assertion
    // (200 + uploadURL) still runs locally / via post-merge where the
    // sidecar is available.
    const authOnly = process.env.UPLOAD_AUTH_TEST_MODE === "auth-only";
    if (authOnly) {
      const passedAuthGate = res.status !== 401 && res.status !== 403;
      record(
        "POST /api/uploads/request-url with session is not rejected by the auth gate",
        passedAuthGate,
        `status=${res.status} (auth-only mode)`,
      );
    } else {
      record(
        "POST /api/uploads/request-url with session returns 200 + uploadURL",
        res.status === 200 && hasUrl,
        `status=${res.status} hasUploadURL=${hasUrl}`,
      );
    }
  } else {
    record("POST /api/uploads/request-url with session returns 200 + uploadURL", false, "skipped — no cookie");
  }
}

async function main() {
  TEST_PORT = await resolveTestPort();
  console.log(
    `[INFO] using port ${TEST_PORT}${EXPLICIT_PORT === null ? " (auto-picked)" : " (TEST_PORT env override)"}`,
  );
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
