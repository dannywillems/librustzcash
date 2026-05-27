---
sidebar_position: 95
title: "PR checklist"
description: "Pre-flight checks every PR must pass before pushing."
---

# PR checklist

Verbatim from
[`AGENTS.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md)
and
[`CONTRIBUTING.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/CONTRIBUTING.md).
Run through this list before pushing. The order matters: the gate
checks come before the code checks because failing a gate check
means the PR will be closed without anyone running your tests.

## 1. Gate

- [ ] A GitHub issue exists describing the change.
- [ ] A `librustzcash` team member has acknowledged the issue.
- [ ] The PR description links the issue (`Fixes #N` or
      `Closes #N` for issue-closing PRs).

## 2. Scope

- [ ] One concern per PR. Refactors, formatting fixes, and code
      changes go in separate PRs.
- [ ] One crate per PR when possible. Cross-crate changes need a
      stronger justification in the PR description.

## 3. Local build and test

- [ ] `cargo build --workspace --all-features` passes.
- [ ] `cargo test --workspace --all-features` passes.
- [ ] `cargo fmt --all -- --check` passes.
- [ ] `cargo clippy --workspace --all-features --all-targets
      -- -D warnings` passes.

## 4. Changelog

- [ ] User-facing changes have an entry in the affected crate's
      `CHANGELOG.md`.
- [ ] The changelog entry is in its **own commit**, separate from
      the code change.
- [ ] The entry follows the conventions of recent merged entries
      (check `git log --oneline -- <crate>/CHANGELOG.md`).

## 5. Dependencies (only if you touched `Cargo.toml`)

- [ ] `cargo vet` passes locally. Update
      [`supply-chain/audits.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/supply-chain/audits.toml)
      or
      [`supply-chain/imports.lock`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/supply-chain/imports.lock)
      as required.
- [ ] New dependencies are justified in the PR description.
- [ ] No dependency downgrade unless explicitly motivated.

## 6. Commit hygiene

- [ ] Commit titles are under 80 characters.
- [ ] Each commit builds and tests pass at that commit (bisect
      safety).
- [ ] No "WIP", "fixup", or "squash" commits.
- [ ] If the repo requires DCO sign-off, every commit has it
      (`git commit -s`).

## 7. Documentation

- [ ] Public APIs have rustdoc comments.
- [ ] Breaking changes are flagged in both the changelog entry
      and the PR description.

## 8. Re-read before pushing

- [ ] `AGENTS.md` "MUST READ FIRST" section.
- [ ] The diff once more, slowly. Reviewers' time is the bottleneck;
      a self-review pass catches most surface issues.
