# Downstream maintenance policy

This repository is the Workbench-owned downstream of
[`nicobailon/pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter).
It exists to give Workbench users a reviewed, reversible release lane while
keeping the adapter close to its active upstream.

## Provenance

| Item | Value |
| --- | --- |
| Upstream | `https://github.com/nicobailon/pi-mcp-adapter.git` |
| Upstream license | MIT (`LICENSE`) |
| Upstream default branch | `main` |
| Downstream owner | `h1057399903-web` |
| Downstream integration branch | `main` |
| Downstream release/default branch | `stable` |
| Bootstrap base | `a42ff1e35e402d7887f450d4367777cbfe76ff84` (`v2.32.0`) |
| Last reviewed upstream commit | `a42ff1e35e402d7887f450d4367777cbfe76ff84` |

## Intentional downstream changes

Downstream-only files are kept separate from adapter implementation code:

- `UPSTREAM.md` — provenance, synchronization, release, and rollback policy.
- `.github/workflows/downstream-compat.yml` — upstream tests plus disposable
  install validation on the public downstream.
- `downstream/verify-pi-compat.mjs` — starts Pi with both packages and verifies
  their command surfaces coexist; the private Workbench repository invokes it
  from its pilot workflow because a fork token cannot read the private sibling.
- `downstream/verify-distribution.mjs` — exercises fresh install, update,
  commit-pinned rollback, and return to the stable lane in an isolated Pi home.

Do not carry implementation patches without recording their purpose, upstream
issue or PR, and removal condition in this section.

## Branch and consumer contract

- `main` receives reviewed upstream synchronization PRs.
- `stable` is the default branch and only moves to a `main` commit after all
  required checks and a compatibility review pass.
- Routine users install the unqualified owned source:

  ```sh
  pi install git:github.com/h1057399903-web/pi-mcp-adapter
  ```

  Because no ref is present, `pi update --extensions` follows the repository's
  default `stable` branch.
- A qualified Git ref is a hard pin, not a moving channel. Use a full reviewed
  commit for rollback:

  ```sh
  pi install git:github.com/h1057399903-web/pi-mcp-adapter@<reviewed-commit>
  ```

  Pi reconciles pinned refs but intentionally does not advance them during
  `pi update --extensions`. Reinstall the unqualified source to return to the
  moving stable lane.

## Synchronizing upstream

For each upstream release or selected commit:

1. Fetch upstream and identify the exact old and new upstream SHAs.
2. Create `sync/upstream-<version>` from downstream `main`.
3. Merge the selected upstream commit. Do not squash it; preserving upstream
   ancestry makes later synchronization and auditing simpler.
4. Update the provenance table's **Last reviewed upstream commit**.
5. Record upstream range, release notes, conflicts, security/audit findings,
   compatibility result, and rollback SHA in the PR.
6. Run `npm ci`, `npm run typecheck`, `npm test`, and the downstream compatibility
   workflow. Run the disposable distribution job when changing the release lane
   or installation procedure.
7. Obtain review, then merge the sync PR into `main`.
8. Fast-forward `stable` to that reviewed `main` commit and verify the stable
   workflow before announcing the update.

Example:

```sh
git fetch upstream main --tags
git fetch origin main stable
git switch -c sync/upstream-vX.Y.Z origin/main
git merge --no-ff <upstream-sha>
# update this file, run checks, push, and open a PR targeting main
```

## Compatibility baseline

The bootstrap baseline is:

- adapter `v2.32.0` / `a42ff1e35e402d7887f450d4367777cbfe76ff84`;
- Workbench `f52fb17421d6183618d1475cc3257d3ab3ccffb4`;
- Pi `0.84.4`;
- upstream CI runtime Node.js `22`.

The compatibility check starts an isolated Pi RPC process with both extension
entry points, excludes user MCP configuration, and requires all of these
commands: `mcp`, `pi-mcp`, `mcp-auth`, `web`, `goal`, and `plan`.

## Rollback

Preferred rollback is non-destructive:

1. Identify the last known-good commit from the promotion PR.
2. Pin affected users immediately with the full commit command above.
3. Revert the bad synchronization or downstream patch on `main` through a PR.
4. After checks pass, promote the revert commit to `stable`.
5. Reinstall the unqualified source and run `pi update --extensions` to return
   users to the moving lane.

If `stable` itself must be moved back before a revert PR can land, an owner may
reset it to the last known-good reviewed commit with `--force-with-lease`.
Record the incident and old/new SHAs in the tracking issue. Pi's Git package
reconciliation resets and cleans its managed clone, so the next unqualified
update converges on the restored stable commit.
