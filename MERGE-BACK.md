# Merging client copies back

Some clients run a private copy of this extension (a plain private repo, not a GitHub fork, so it
stays private) in which their own agent adds features. Once a month the maintainer reviews that
work and brings the generic parts back here. The copy never pushes to this repo.

Setup in a client copy's clone: `origin` = the client repo, `upstream` = this repo.

## Monthly routine

1. Fetch the client copy: `git fetch origin` in the client clone, then list what is new:
   `git log --oneline upstream/main..origin/main`.
2. Review every commit as code that will run on our own workstation. Read the full diff, including
   scripts, hooks, build files, `package.json` changes and anything that executes a command or
   makes a network call. Never auto-merge, never run the client's build before reading it.
3. Check commit messages, code, comments, test data and file names for client details (names,
   hostnames, addresses, paths, tickets, credentials, customer data). Anything found: do not take
   the commit as is; rewrite the change without it.
4. Cherry-pick the generic features into `main` here (`git cherry-pick -x` or re-implement).
   Client-specific changes stay in the client copy. Commit messages here describe the feature only.
5. Bump the version, push `main` here.
6. Merge `main` back into the client copy: `git merge upstream/main` in the client clone, resolve
   conflicts (cherry-picked commits usually merge cleanly), push to `origin`.

Which client copies exist is kept in a private place, not in this repo.
