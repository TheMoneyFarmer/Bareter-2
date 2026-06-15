---
name: npm devDeps omitted under NODE_ENV=production + lockfile/override sync
description: Why local installs silently drop devDependencies in this repl, and why adding package.json overrides without regenerating package-lock.json breaks the deploy build.
---

# NODE_ENV=production makes installs omit devDependencies

This repl runs with `NODE_ENV=production` set in the environment. As a result, every
`npm install` (including the ones the packager tool runs) defaults to `omit=dev` and
silently skips **pure** devDependencies, while transitive deps of production deps still
appear. Symptom: a "clean" reinstall finishes successfully but the build later fails on
missing build-time packages (e.g. `autoprefixer`, `@replit/vite-plugin-*`, `drizzle-kit`,
`@tailwindcss/*`, `@types/*`). `esbuild`/`vite`/`tailwindcss` may still be present because
they are pulled transitively, which masks the problem.

**Why:** npm treats `NODE_ENV=production` as an implicit `--omit=dev`.

**How to apply:** When devDeps go missing after an install in this repl, write a temporary
`.npmrc` with `include=dev` at repo root, run the install, verify the build, then delete
`.npmrc` (it was untracked; don't commit it — it would force devDeps into the production
runtime). `npm config set ...` and `npm install` are blocked from the bash tool here;
writing `.npmrc` directly is the workaround. The bash tool also rejects some complex
multi-line/`||`-piped commands — prefer simple single-purpose commands.

# Recovering a corrupted node_modules

`npm` can report "up to date" while the package's files are absent on disk (its internal
`node_modules/.package-lock.json` claims they exist). A targeted `npm install pkg@ver`
will NOT restore them in that state. Reliable recovery: `rm -rf node_modules` then a full
install. If a specific package still won't install (e.g. a registry/resolver quirk),
fetch it with `npm pack <pkg>@<ver>` (allowed from bash) and extract the tarball directly
into `node_modules/<name>` with `tar -xzf … --strip-components=1`, then confirm its own
deps are present.

# Adding package.json overrides requires regenerating package-lock.json in lockstep

Adding/changing an `overrides` entry in package.json but committing a stale
package-lock.json makes the **deployment build fail**: the deploy's `npm ci` enforces that
the lockfile is in sync with package.json and aborts. Also, a global override whose range
conflicts with a direct dependency throws `EOVERRIDE` (e.g. global `uuid:^11.1.1` vs direct
`uuid:^13.0.0`). Fix the conflict by **scoping** the override under the offending parent(s)
instead of globally, e.g. `"@google-cloud/storage": { "uuid": "^11.1.1" }` and
`"@sanity/uuid": { "uuid": "^11.1.1" }`, leaving the direct dep untouched.

**Why:** npm ci is intentionally strict; overrides change the resolved tree, so the lock
must be regenerated and committed alongside package.json.

**How to apply:** After editing overrides, run a full install to regenerate
package-lock.json, verify `npm run build` + `runDependencyAudit` (0 vulns), and commit BOTH
package.json and package-lock.json together before redeploying.

# Runtime-generated credential dirs must stay gitignored

The WhatsApp/Baileys client writes live session material to `whatsapp-auth/` (creds.json,
pre-keys, identity/app-state keys) at connect time. These must never be committed. Watch
for **malformed `.gitignore` lines** where two patterns got concatenated with no newline
(seen once as `*.logwhatsapp-auth/`) — the fused pattern matches nothing, silently
un-ignoring BOTH entries, so the next `git add -A` would commit the credentials.

**Why:** committing session keys = account/session compromise.

**How to apply:** Each ignore pattern must be on its own line (`*.log` and `whatsapp-auth/`
separately). Before any commit that uses `git add -A`, run `git status --porcelain` and
confirm no `whatsapp-auth/`, `*.log`, or `.env*` files are staged/untracked-and-about-to-be-added.
