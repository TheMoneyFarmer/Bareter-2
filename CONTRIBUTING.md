# Contributing

## Security gate (runs on every merge)

The post-merge script at `scripts/post-merge.sh` automatically runs the
security regression suite (`npm run test:security`, defined in `package.json`,
which executes `vitest run tests/security.test.ts`) after dependencies are
installed and the schema is pushed. A non-zero exit from the suite aborts the
script with `set -e`, so the merge is gated on the tests passing. The suite
finishes in well under a minute on a clean container, and a failure prints a
clear `SECURITY TESTS FAILED — merge gate blocking.` summary pointing
contributors at `tests/security.test.ts`.

The same suite also runs in CI as a separate GitHub Actions job named
`Security regression suite (npm run test:security)` inside
`.github/workflows/upload-auth.yml`, so PRs surface failures before merge as
well. Add this job to the required status checks list (see steps below) so
GitHub itself blocks merges when the suite fails.

When adding a new security regression, add the test to `tests/security.test.ts`
(or another file picked up by `npm run test:security`) — both the post-merge
hook and the CI job will pick it up automatically with no further wiring.

## Required CI status checks

This repo ships a GitHub Actions workflow at `.github/workflows/upload-auth.yml`
that runs **two** security jobs on every push and pull request:

1. The upload-auth security check (`scripts/test-upload-auth.ts`).
2. The full security regression suite (`npm run test:security`,
   i.e. `vitest run tests/security.test.ts`).

The workflow itself runs automatically, but GitHub will **not** block merges on
a failing run until a maintainer marks **both** jobs as *required* status checks
in the protected branch settings.

This step has to be done from the GitHub UI by a user with admin access to the
repository — it can't be configured from within the repo. Re-do these steps any
time the default branch is renamed (e.g. `main` → `trunk`), because branch
protection rules are scoped to a branch name.

### Job names to require

When GitHub asks which status checks to require, pick **both** of:

```
Verify /api/uploads/request-url requires auth
Security regression suite (npm run test:security)
```

These match the `jobs.upload-auth.name` and `jobs.security-tests.name` fields
in `.github/workflows/upload-auth.yml`. If either `name:` value is ever
changed, the corresponding required-status-check entry in branch protection has
to be updated to match — GitHub matches on the displayed job name, not the job
id.

### Steps to enable in GitHub branch protection

1. Open the repository on GitHub and go to **Settings → Branches**.
2. Under **Branch protection rules**, click **Add rule** (or **Edit** on the
   existing rule for the default branch, e.g. `main`).
3. In **Branch name pattern**, enter the branch you want to protect (e.g.
   `main`).
4. Tick **Require status checks to pass before merging**.
5. Tick **Require branches to be up to date before merging** (recommended, so
   the checks run against the merge commit).
6. In the **Status checks that are required** search box, add **both** of the
   following one at a time and select each from the dropdown:
   - `Verify /api/uploads/request-url requires auth`
   - `Security regression suite (npm run test:security)`

   Checks only appear in the dropdown after they have run at least once on the
   repo, so if you don't see one, push a commit (or open a PR) first and then
   come back to this screen.
7. (Optional but recommended) Also tick **Do not allow bypassing the above
   settings** so admins can't merge around a failing check.
8. Click **Create** (or **Save changes**).

After this is in place, any PR where either the upload-auth job or the
security regression suite fails will be blocked from merging until both jobs
pass on the latest commit.

### Re-enabling after a branch rename

Branch protection rules are tied to the branch name pattern. If the default
branch is renamed:

1. Go to **Settings → Branches**.
2. Either edit the existing rule and update the **Branch name pattern** to the
   new name, or add a new rule for the new branch name and delete the stale
   one.
3. Re-confirm that **both**
   `Verify /api/uploads/request-url requires auth` and
   `Security regression suite (npm run test:security)` are still listed under
   required status checks — renaming the branch can drop the required-checks
   selection in some cases, so verify both are still ticked.
