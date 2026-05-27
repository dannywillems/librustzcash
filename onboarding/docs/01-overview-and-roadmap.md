---
sidebar_position: 1
title: Overview and roadmap
description: "Crate graph and layering of the librustzcash workspace."
---

# 01 - Overview and roadmap

## 1. Why this chapter exists

`librustzcash` is a Cargo workspace of about twenty crates that
together implement Zcash wallets, transaction construction, and
zero-knowledge proving. A reader who jumps straight into a specific
crate without a map will repeatedly misattribute responsibility:
sighash math lives in `zcash_primitives`, key derivation lives in
`zcash_keys`, the shielded circuits live in external crates
(`sapling-crypto`, `orchard`). This chapter fixes the dependency
layering once so every subsequent chapter can refer to it by name.
By the end of it, you will be able to read the workspace declaration
in
[`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml)
and explain why each member is in the layer it is in.

## 2. Definitions

**Definition (workspace).** A Cargo workspace is a set of crates
that share a single `Cargo.lock`, a single `target/` directory, and
optionally common metadata declared under `[workspace.package]` and
`[workspace.dependencies]`. Membership is declared in the top-level
`[workspace] members` array.

**Definition (layer).** Throughout this course, a layer is a maximal
set of workspace crates such that no member of layer $L_i$ depends on
any member of layer $L_j$ with $j > i$. Layers are determined by the
directed dependency graph; the graph is acyclic by construction
(Cargo rejects cycles).

**Invariant (downward dependencies).** For any two workspace crates
$A$ and $B$, if $A$ depends on $B$ then `layer(A) >= layer(B)`. This
is what allows the wallet layer to reach for protocol types but not
the reverse.

**Definition (consensus boundary).** `librustzcash` is not a
consensus node. The
[README](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/README.md)
states: "The only way to check Zcash consensus validity is to use a
Zcash consensus node." Parsing in this repo is permissive on purpose;
the libraries focus on cryptographic correctness for wallet and
transaction-construction use cases.

## 3. The code

### 3.1 The workspace declaration

The full member list is at the top of the root `Cargo.toml`:

```toml reference title="Cargo.toml"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml#L1-L22
```

Rust edition is `2024`, MSRV is `1.85.1`, license is
`MIT OR Apache-2.0`. The resolver is `2`, which is required for the
feature unification semantics most chapters rely on.

### 3.2 Layer 0 - Standalone components (`components/`)

- `zcash_encoding`: Bitcoin-style varint, `Vector`, `Optional`,
  `Array` serialization helpers. Pure, no protocol logic.
- `zcash_protocol`: Constants and base types: `BlockHeight`,
  `BranchId`, `Zatoshis`, `ZatBalance`, network upgrade enum
  (`NetworkUpgrade`), memo types. Every other crate transitively
  depends on this.
- `equihash`: Verifier (and optionally solver) for the Equihash PoW.
  No Zcash-specific transaction logic.
- `f4jumble`: 4-round unkeyed Feistel construction over BLAKE2b used
  by unified addresses.
- `zcash_address`: Pure parser/serialiser for Zcash addresses and
  unified containers. Knows nothing about keys.
- `zip321`, `eip681`: Payment-request URI parsers.

`Zatoshis` is the most important newtype in this layer; it pins the
type-level invariant that no contributor can build a transaction
with a negative or out-of-range amount:

```rust reference title="components/zcash_protocol/src/value.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/value.rs#L262-L268
```

### 3.3 Layer 1 - Protocol primitives

- `zcash_transparent`: Bitcoin-derived transparent address, output,
  input, bundle, sighash. Houses the transparent half of PCZT.
- `zcash_primitives`: The Zcash transaction type itself
  (`Transaction`, `TransactionData`), the builder, sighash trees
  (v4/v5/v6), the Merkle-tree module.
- `zcash_proofs`: The Sprout circuit (a Groth16 SNARK encoded with
  `bellman`) and the bindings to Sapling proving parameters
  (`sapling-spend.params`, `sapling-output.params`,
  `sprout-groth16.params`).

External crates pulled in at this layer (separate repositories, but
load-bearing):

- `sapling-crypto`: the entire Sapling protocol (notes, commitments,
  value commitments, Spend, Output, the circuit). Previously a
  module inside `zcash_primitives`; extracted for separation of
  concerns.
- `orchard`: the entire Orchard protocol (Action description, Halo 2
  circuit, PCZT-orchard).
- `zcash_note_encryption`: a generic in-band secret distribution
  scheme parameterised by domain (used by both Sapling and Orchard).
- `zip32`: hierarchical-deterministic derivation, shared by all
  pools.
- `zcash_spec`: small helpers that encode primitives from the
  protocol specification (e.g. `PRF^{expand}`).

### 3.4 Layer 2 - Keys and addresses

- `zcash_keys`: Spending keys, viewing keys, unified spending /
  viewing keys, ZIP 32 derivation for Sapling/Orchard/transparent.
- `pczt`: The Partially Constructed Zcash Transaction format;
  defines the roles (Creator, Constructor, IO Finalizer, Prover,
  Signer, Spend Authoriser, Combiner, Transaction Extractor) and the
  data shape passed between them.

### 3.5 Layer 3 - Wallet stack

- `zcash_client_backend`: The wallet framework: chain-scanning, fee
  strategies, transaction proposals, light-client (lightwalletd)
  protocol, ZIP 321 payment-request handling.
- `zcash_client_memory`: In-memory backend implementation, mostly
  for testing.
- `zcash_client_sqlite`: SQLite implementation of the wallet storage
  trait family. The reference downstream.

### 3.6 Auxiliary crates

- `zcash_history`: ZIP 221 / Block Header Commitments tree (a
  recursive hash-tree of block metadata). Lives in this repo because
  the structure is consensus-defined but rarely touched in wallet
  contexts.
- `zcash_extensions`: Experimental "transaction extensions" (TZE),
  behind the `zfuture` cfg flag. Mostly of historical interest.
- `zcash`: meta-crate that re-exports the others; the most common
  dependency for downstream consumers.

### 3.7 Code conventions to remember

A short list of project-wide patterns. Each is justified in
[`AGENTS.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md);
read that file before contributing.

- `#![no_std]` by default. Most crates use `extern crate alloc`.
  Anything needing `std` lives behind a `std` feature flag.
- Bundles use the authorization typestate pattern: a `Bundle<A>` is
  parameterised by an `Authorization` associated type so the type
  system distinguishes "I have spend authorisations" from "I have a
  partially-built bundle that still needs signing/proving". Look for
  `MapAuth` and `InProgress` markers.
- Struct fields are private. Construction goes through
  `from_parts(...)` which returns `Result<_, Error>` and enforces
  invariants.
- All error types are non-exhaustive enums.
- Newtypes are aggressively preferred over bare integers:
  `Zatoshis`, `ZatBalance`, `BlockHeight`, `TxId`, etc.
- Side effects (clocks, RNGs, network calls) are passed as explicit
  trait arguments ("capability-oriented" style).

## 4. Failure modes

A contributor who modifies the workspace layering without
understanding it can produce three kinds of damage:

- **Cycle introduction.** Adding a wallet-layer dependency to a
  protocol-layer crate breaks compilation across every consumer.
  Cargo will refuse to resolve.
- **Feature-flag breakage.** The repo CI matrix exercises specific
  feature combinations
  ([`ci.yml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows/ci.yml)).
  Adding a feature that pulls `std` into a `no_std` crate will pass
  locally and fail in CI under `--no-default-features`.
- **Cross-crate version skew.** When two workspace crates depend on
  the same external crate at different versions (e.g. `sapling` vs
  `sapling-crypto`), the resolver may pick a single resolution that
  silently downgrades a security fix. `cargo tree -d` exposes such
  duplicates. The CI runs `cargo vet` against
  [`supply-chain/audits.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/supply-chain/audits.toml)
  to flag this.

The test most often broken by careless layering changes is
`cargo check --workspace --all-features --no-default-features`,
which the CI runs in matrix form. Always run it locally before
pushing.

## 5. Spec pointers

- Top-level
  [`README.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/README.md):
  contains the authoritative crate-graph diagram and the explicit
  "this is not a consensus node" disclaimer.
- [`AGENTS.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md):
  PR compliance gate (the change must be tied to an open GitHub
  issue acknowledged by a team member) and the canonical local
  command list. Read it before opening a PR.
- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf):
  sections 3 and 4 give the abstract protocol that the
  `zcash_protocol` and `zcash_primitives` crates encode. Section 5
  gives the concrete protocol that drives every shielded crate.
- [ZIP index](https://zips.z.cash/): every consensus rule the
  workspace implements is anchored to a ZIP number; the crate
  README files cite them directly.

## 6. Exercises

1. **Read the workspace.** Open the root
   [`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml)
   and list every workspace member alongside one sentence on what
   it owns. Compare your list to Section 3 of this chapter and
   identify any crate you misclassified.

2. **Draw the local dependency graph.** Run
   `cargo tree --workspace --depth 1 --no-default-features` and
   confirm that no Layer 0 crate depends on a Layer 1+ crate.
   Identify the one workspace crate with the highest fan-in (most
   crates depending on it).

3. **Touch the code.** Pick the
   [`Zatoshis`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/value.rs#L262-L268)
   newtype. Add a private helper method `pub fn is_dust(&self) -> bool`
   that returns `true` when the value is below the relay-rule dust
   threshold ($\geq 0$ and $\leq 54$ zatoshis, per ZIP 317).
   Build with `cargo check -p zcash_protocol` and add one unit test
   covering both branches. Do not commit; this is a scratch exercise
   to confirm the build loop works.

### Answers in the code

- Workspace members:
  [`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml#L1-L22).
- Highest-fan-in crate:
  [`components/zcash_protocol`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol).
- `Zatoshis` definition and arithmetic:
  [`components/zcash_protocol/src/value.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/value.rs).

## 7. Further reading

- Reading order for the rest of this course: chapter 02 covers
  protocol foundations; chapter 03 calibrates cryptographic
  notation; chapter 04 enters Sprout and Sapling; chapter 05 covers
  Orchard and Halo 2; chapter 10 finally re-uses every layer above
  inside the wallet stack. The
  [study plan](./11-study-plan-and-exercises.md) gives a week-by-week
  read order with associated exercises.
- For a quick file-to-purpose lookup when you forget which crate
  owns what:

| Question | File |
| --- | --- |
| What is a transaction made of? | `zcash_primitives/src/transaction/mod.rs` |
| How is a transaction built? | `zcash_primitives/src/transaction/builder.rs` |
| How is a TxId computed? | `zcash_primitives/src/transaction/txid.rs` |
| What is the Sprout circuit? | `zcash_proofs/src/circuit/sprout/mod.rs` |
| What does a Zcash address look like? | `components/zcash_address/src/kind/unified.rs` |
| What does F4Jumble do? | `components/f4jumble/src/lib.rs` |
| How does the wallet scan a block? | `zcash_client_backend/src/scanning.rs` |
| What does Equihash verify? | `components/equihash/src/verify.rs` |
| How do we derive Sapling keys? | `zcash_keys/src/keys.rs` plus the `sapling-crypto` repo |
