---
sidebar_position: 1.5
title: "Build, test, contribute"
description: "Toolchain setup, test loop, CI mapping, the AGENTS.md PR compliance gate, hot files."
---

# Build, test, contribute

## 1. Why this chapter exists

This is the chapter you return to every day. It documents the
toolchain, the test commands, the CI graph as mirrored locally, and
the **PR compliance gate** that gates every contribution to
[`zcash/librustzcash`](https://github.com/zcash/librustzcash). Reading
the rest of the course teaches you the protocol; this chapter teaches
you how to ship a patch the maintainers will accept.

If you open a PR without satisfying the gate in section 4 it will be
closed, regardless of how good the code is.

## 2. Definitions

**Workspace** (Cargo): a set of crates sharing a single
`Cargo.toml` at the repository root. See
[`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml)
for the member list (18 crates as of the discovery pin).

**MSRV** (Minimum Supported Rust Version): `1.85.1`, pinned by
[`rust-toolchain.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/rust-toolchain.toml).
The toolchain file forces `rustup` to install this exact version, so
running `cargo` inside the repo gives you the same compiler the CI
uses.

**`cargo-vet`**: supply-chain auditing tool. The repository carries
audit metadata under
[`supply-chain/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/supply-chain).
PRs that add or upgrade dependencies must update this metadata.

## 3. The code

### 3.1 Setup

```bash
rustup show              # rustup auto-installs 1.85.1 per the toolchain file
cargo --version          # cargo 1.85.x
cargo install cargo-vet  # only if you touch dependencies
```

### 3.2 The local test loop

```bash
# Build every crate in the workspace.
cargo build --workspace --all-features

# Run unit + integration tests across the workspace.
cargo test --workspace --all-features

# Focused: a single crate.
cargo test -p zcash_client_sqlite

# Focused: a single test function.
cargo test -p zcash_primitives transaction::tests::roundtrip
```

### 3.3 Lint and format

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-features --all-targets -- -D warnings
```

The CI workflow
[`.github/workflows/ci.yml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows/ci.yml)
runs the same commands on a build matrix. Reproducing CI locally
means running these four commands; if all four pass, the most common
CI failures are gone.

### 3.4 Other workflows

- [`audits.yml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows/audits.yml)
  runs `cargo vet`. Any dependency change must update
  `supply-chain/audits.toml` or `supply-chain/imports.lock`.
- [`mutants.yml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows/mutants.yml)
  runs `cargo mutants`. Mutation surviving the test suite is a hint
  the tests are weak.
- [`zizmor.yml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows/zizmor.yml)
  lints the workflow files themselves for known
  CI-supply-chain pitfalls.

## 4. PR compliance gate (mandatory)

Read this verbatim. It comes from
[`AGENTS.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md).
The gate applies to human contributors and AI agents alike.

Before opening a PR:

1. **Discuss the change on a GitHub issue first.** Drive-by PRs are
   closed.
2. **Wait for a `librustzcash` team member to acknowledge the issue.**
   An issue existing is not enough. The team must respond.
3. **Link the issue from the PR description.**

Additional rules from
[`CONTRIBUTING.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/CONTRIBUTING.md):

- Each crate has its own `CHANGELOG.md`. User-facing changes
  require a changelog entry in the affected crate, **in a dedicated
  commit**.
- The PR title should match the convention of recent merged PRs in
  the same area; check `git log --oneline` of the touched crate.
- Sign commits with DCO if the repo requires it (`git commit -s`).

## 5. Failure modes

- **Skipping the issue gate.** The PR will be closed without review.
  Trying to bypass by opening "draft" PRs counts as skipping.
- **Bundling a changelog entry with the code change.** Splits the
  reviewer's attention and breaks the rule above. Use two commits.
- **Touching multiple crates in one PR without justification.**
  Reviewers prefer small, single-crate PRs because the test surface
  is smaller.
- **Forgetting `cargo vet` after adding a dependency.** The
  `audits.yml` workflow fails and blocks merge.
- **Editing generated files** (e.g.
  [`supply-chain/imports.lock`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/supply-chain/imports.lock))
  by hand instead of regenerating them with the tool.

## 6. Spec pointers

- [`AGENTS.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md):
  the contribution gate and agent-facing policy. Read in full
  before the first PR.
- [`CONTRIBUTING.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/CONTRIBUTING.md):
  the human-facing contribution guide. Section "Coding Style" lists
  the rules `cargo fmt` and `clippy` cannot catch.
- [Zcash R&D Discord](https://discordapp.com/channels/809218587167293450/876655911790321684)
  `#libraries` channel: where to ask before opening the issue.

## 7. Hot files (last 6 months)

The 10 files that have seen the most churn are listed in
[`onboarding/discovery.md`](https://github.com/dannywillems/librustzcash/blob/onboarding/onboarding/discovery.md#7-recent-activity-last-6-months).
Summary:

1. `zcash_client_backend/CHANGELOG.md` (62 touches)
2. `supply-chain/imports.lock` (59)
3. `zcash_client_sqlite/CHANGELOG.md` (50)
4. `zcash_client_sqlite/src/wallet.rs` (49)
5. `Cargo.lock` (49)
6. `zcash_client_sqlite/src/lib.rs` (38)
7. `components/eip681/src/parse.rs` (36)
8. `zcash_transparent/CHANGELOG.md` (33)
9. `zcash_primitives/CHANGELOG.md` (31)
10. `zcash_client_backend/src/data_api/ll/wallet.rs` (29)

The pattern: most contribution activity targets the wallet layer
(`zcash_client_sqlite` + `zcash_client_backend`) and the transparent
pool. If your goal is to ship a PR fast, find an open issue in those
areas, follow the gate, and you will land in a familiar review path.

## 8. Exercises

1. Clone the repository fresh, run `cargo build --workspace
   --all-features`, and report the total build time on your machine.
   Compare with the `ci.yml` matrix; identify which target your
   machine matches.
2. Pick a single test in `zcash_client_sqlite` and reproduce it with
   the focused-test command from section 3.2. Modify the assertion
   so it fails, re-run, then restore. The goal is to confirm your
   test loop is wired.
3. Open the
   [`issues`](https://github.com/zcash/librustzcash/issues) tab and
   find an open issue labelled "good first issue" (or, if none, any
   small open issue). Write down which chapter of this course
   prepares you to solve it.
4. Read
   [`CONTRIBUTING.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/CONTRIBUTING.md)
   front to back. Then re-read section 4 above and confirm in your
   own words how the issue + ack rule applies to a one-line typo
   fix.

### Answers in the code

- Build time: depends on machine; the GitHub Actions runners take
  ~25 minutes for the full matrix.
- Focused-test pattern: `cargo test -p <crate> <module>::<test>` per
  section 3.2.
- Good first issues: filtered list at
  <https://github.com/zcash/librustzcash/labels/good%20first%20issue>.
- Typo rule: the gate applies. Even a typo fix should reference an
  issue. The maintainers' reasoning is in `AGENTS.md` under "MUST
  READ FIRST".

## 9. Further reading

- [The Cargo Book - Workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html)
  to understand the workspace dependency surface.
- [cargo-vet documentation](https://mozilla.github.io/cargo-vet/) for
  the supply-chain auditing model used here.
