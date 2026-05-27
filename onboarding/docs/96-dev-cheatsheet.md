---
sidebar_position: 96
title: "Developer cheat sheet"
description: "Every command you need, in one page, anchored to the workspace."
---

# Developer cheat sheet

Single-page reference. Open it in a tab while you work.

## Toolchain

| Tool | Pinned by | Command to install / check |
| --- | --- | --- |
| Rust 1.85.1 | [`rust-toolchain.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/rust-toolchain.toml) | `rustup show` |
| `cargo-vet` | `supply-chain/` | `cargo install cargo-vet` |
| `cargo-mutants` (optional) | `mutants.yml` | `cargo install cargo-mutants` |

## Build

```bash
# Full workspace.
cargo build --workspace --all-features

# Release mode.
cargo build --workspace --all-features --release

# One crate.
cargo build -p zcash_client_sqlite --all-features

# Documentation locally.
cargo doc --workspace --no-deps --all-features --open
```

## Test

```bash
# All tests.
cargo test --workspace --all-features

# One crate.
cargo test -p zcash_primitives --all-features

# One test (substring match).
cargo test -p zcash_primitives roundtrip

# Show stdout from passing tests.
cargo test -p zcash_primitives -- --nocapture

# Single thread (helpful when tests share filesystem state).
cargo test -p zcash_client_sqlite -- --test-threads=1
```

## Lint and format

```bash
cargo fmt --all                      # write
cargo fmt --all -- --check           # CI mode
cargo clippy --workspace --all-features --all-targets -- -D warnings
```

## Supply chain

```bash
cargo vet                  # audit
cargo vet diff <crate>     # diff vs prior approved version
cargo vet certify <crate>  # add a certification (requires policy match)
```

## Mutation testing

```bash
cargo mutants --in-place --no-shuffle --package zcash_primitives
```

A surviving mutant means a test is not exercising that branch.

## Docs site (this course)

```bash
cd onboarding
make install   # npm install
make dev       # local server with hot reload
make build     # production build
make preview   # serve the production build locally
```

## Common debugging recipes

```bash
# Print the resolved dependency graph for one crate.
cargo tree -p zcash_client_sqlite --all-features

# Find which crate pulls in a specific transitive dependency.
cargo tree -i <crate-name>

# Re-run tests with backtraces.
RUST_BACKTRACE=1 cargo test -p zcash_primitives -- --nocapture

# Re-run a single test with logging visible.
RUST_LOG=debug cargo test -p zcash_client_sqlite some_test -- --nocapture
```

## Git workflow

```bash
# Create a feature branch from main.
git switch -c <issue-N>-<short-slug>

# Squash changelog entry into its own commit (keep code separate).
git commit --interactive

# Rebase on main before opening the PR (no merge commits).
git fetch upstream main
git rebase upstream/main

# DCO sign-off (if required).
git commit -s
```

## Workflow files in `.github/workflows/`

| File | What it runs | Triggered on |
| --- | --- | --- |
| `ci.yml` | build + tests + fmt + clippy | push, PR |
| `audits.yml` | `cargo vet` | push, PR |
| `aggregate-audits.yml` | aggregate vet metadata | scheduled |
| `book.yml` | mdBook build (not this course) | push to main |
| `mutants.yml` | `cargo mutants` | scheduled |
| `zizmor.yml` | lint workflows themselves | push, PR |
| `onboarding-docs.yml` | this course's deploy | push to `onboarding` |
