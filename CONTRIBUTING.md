# Contributing

## Required CI status checks

This repo ships a GitHub Actions workflow at `.github/workflows/upload-auth.yml`
that runs the upload-auth security check on every push and pull request. The
workflow itself runs automatically, but GitHub will **not** block merges on a
failing run until a maintainer marks it as a *required* status check in the
protected branch settings.

This step has to be done from the GitHub UI by a user with admin access to the
repository — it can't be configured from within the repo. Re-do these steps any
time the default branch is renamed (e.g. `main` → `trunk`), because branch
protection rules are scoped to a branch name.

### Job name to require

When GitHub asks which status check to require, pick:

```
Verify /api/uploads/request-url requires auth
```

This matches the `jobs.upload-auth.name` field in
`.github/workflows/upload-auth.yml`. If that `name:` value is ever changed, the
required-status-check entry in branch protection has to be updated to match —
GitHub matches on the displayed job name, not the job id.

### Steps to enable in GitHub branch protection

1. Open the repository on GitHub and go to **Settings → Branches**.
2. Under **Branch protection rules**, click **Add rule** (or **Edit** on the
   existing rule for the default branch, e.g. `main`).
3. In **Branch name pattern**, enter the branch you want to protect (e.g.
   `main`).
4. Tick **Require status checks to pass before merging**.
5. Tick **Require branches to be up to date before merging** (recommended, so
   the check runs against the merge commit).
6. In the **Status checks that are required** search box, type
   `Verify /api/uploads/request-url requires auth` and select it from the
   dropdown. The check only appears in the dropdown after it has run at least
   once on the repo, so if you don't see it, push a commit (or open a PR) first
   and then come back to this screen.
7. (Optional but recommended) Also tick **Do not allow bypassing the above
   settings** so admins can't merge around a failing check.
8. Click **Create** (or **Save changes**).

After this is in place, any PR where the upload-auth job fails will be blocked
from merging until the job passes on the latest commit.

### Re-enabling after a branch rename

Branch protection rules are tied to the branch name pattern. If the default
branch is renamed:

1. Go to **Settings → Branches**.
2. Either edit the existing rule and update the **Branch name pattern** to the
   new name, or add a new rule for the new branch name and delete the stale
   one.
3. Re-confirm that **Verify /api/uploads/request-url requires auth** is still
   listed under required status checks — renaming the branch can drop the
   required-checks selection in some cases, so verify it's still ticked.
