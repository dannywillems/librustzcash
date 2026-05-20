# 01 - Overview and roadmap

## Goal

This chapter is the bird's-eye view of `librustzcash`. It explains what each
crate is for, why the crates are split the way they are, and the order in
which to study them. Read this first; come back to it when you forget which
crate owns what.

## What is `librustzcash`?

`librustzcash` is a Rust workspace of cryptographic libraries that implement
the Zcash protocol. It is the canonical Rust implementation of:

- Zcash transaction parsing, construction, signing, and ZK-proof generation.
- Key derivation and address management (ZIP 32, ZIP 316, unified addresses).
- A wallet framework (`zcash_client_backend`) and reference storage backends.
- Auxiliary primitives: Equihash PoW verifier, F4Jumble, Bitcoin-style
  encoding, the Sprout circuit.

It is consumed by light wallets (Zashi, Nighthawk, Zingo), by `zcashd` (for
some functions), by Zebra, and increasingly by hardware wallets via the PCZT
(Partially Constructed Zcash Transaction) flow.

It deliberately does **not** implement a consensus node. As the top-level
`README.md` warns:

> The only way to check Zcash consensus validity is to use a Zcash consensus
> node.

Parsing is permissive on purpose; the libraries focus on cryptographic
correctness for wallet and transaction-construction use cases.

## Layering

The workspace divides into four conceptual layers, from low to high:

### Layer 0 - Standalone components

In `components/`:

- `zcash_encoding`: Bitcoin-style varint, `Vector`, `Optional`, `Array`
  serialization helpers. Pure, no protocol logic.
- `zcash_protocol`: Constants and base types: `BlockHeight`, `BranchId`,
  `Zatoshis`, `ZatBalance`, network upgrade enum (`NetworkUpgrade`), memo
  types. Every other crate transitively depends on this.
- `equihash`: Verifier (and optionally solver) for the Equihash PoW. No
  Zcash-specific transaction logic.
- `f4jumble`: 4-round unkeyed Feistel construction over BLAKE2b used by
  unified addresses.
- `zcash_address`: Pure parser/serialiser for Zcash addresses and unified
  containers. Knows nothing about keys.
- `zip321`, `eip681`: Payment request URI parsers.

### Layer 1 - Protocol primitives

- `zcash_transparent`: Bitcoin-derived transparent address, output, input,
  bundle, sighash. Houses the transparent half of PCZT.
- External: `sapling-crypto`, `orchard`, `zcash_note_encryption`, `zip32`,
  `zcash_spec`. These are separate repos but you must understand them; the
  shielded cryptography lives there.
- `zcash_primitives`: The Zcash transaction type itself (`Transaction`,
  `TransactionData`), the builder, sighash trees (v4/v5/v6), the Merkle tree
  module.
- `zcash_proofs`: The Sprout circuit (a Groth16 SNARK encoded with
  `bellman`) and the bindings to Sapling proving parameters
  (`sapling-spend.params`, `sapling-output.params`,
  `sprout-groth16.params`).

### Layer 2 - Keys and addresses

- `zcash_keys`: Spending keys, viewing keys, unified spending/viewing keys,
  ZIP 32 derivation for Sapling/Orchard/transparent.
- `pczt`: The Partially Constructed Zcash Transaction format; defines the
  five roles (Creator, Constructor, Signer, Prover, Combiner, Spend
  Authoriser, Transaction Extractor) and the data shape passed between them.

### Layer 3 - Wallet stack

- `zcash_client_backend`: The wallet framework: chain-scanning, fee
  strategies, transaction proposals, light-client (lightwalletd) protocol,
  ZIP 321 payment-request handling.
- `zcash_client_memory`: In-memory backend implementation, mostly for
  testing.
- `zcash_client_sqlite`: SQLite implementation of the wallet storage trait
  family. The reference downstream.

### A note on `zcash_history` and `zcash_extensions`

- `zcash_history`: ZIP 221 / Block Header Commitments tree (a recursive
  hash-tree of block metadata). Lives in this repo because the structure is
  consensus-defined but rarely touched in wallet contexts.
- `zcash_extensions`: Experimental "transaction extensions" (TZE), behind
  the `zfuture` cfg flag. Mostly historical interest.

## The dependency graph in one glance

If you only remember one thing, remember **dependencies flow downward**.
`zcash_client_sqlite` depends on `zcash_client_backend`, which depends on
`zcash_primitives`, which depends on `zcash_protocol`, etc. The reverse
never happens.

The Mermaid diagram in the top-level `README.md` is the authoritative source
of truth. Open it; it is the most important diagram in the repository.

Important external crates (separate repos but central):

- `sapling-crypto` ($\sim$ `sapling::*` imports): the entire Sapling
  protocol (notes, commitments, value commitments, Spend, Output, the
  circuit). Was previously a module inside `zcash_primitives`, was extracted
  for separation of concerns.
- `orchard`: the entire Orchard protocol (Action description, Halo 2
  circuit, PCZT-orchard).
- `zcash_note_encryption`: a generic in-band secret distribution scheme
  parameterised by domain (used by both Sapling and Orchard).
- `zip32`: hierarchical-deterministic derivation, shared by all pools.
- `zcash_spec`: small helpers that encode primitives from the protocol
  specification (e.g. `PRF^{expand}`).

## Reading order

A senior cryptographer joining the project can profitably read the source in
this order:

1. **Chapter 02**: protocol foundations - skim the protocol PDF
   sections 3-4 first.
2. **Chapter 03**: cryptography primer - calibrate your notation with mine.
3. **Chapter 04**: Sprout and Sapling - this is where you spend the most
   time. Sapling is mature, well-specified, mathematically clean, and the
   bulk of historical shielded value lives there.
4. **Chapter 05**: Orchard and Halo 2 - the modern shielded pool, which
   uses a different proof system and curve choice.
5. **Chapter 06-09**: keys, transactions, note encryption, Equihash.
6. **Chapter 10**: wallet stack (read last; it consumes everything above).
7. **Chapter 11**: study plan with exercises.

If you only have a week, focus on chapters 03, 04, 05, 08. They contain
$\approx 90\%$ of the cryptographic substance.

## Useful entry points in the code

When in doubt, start reading from these files:

| Goal | File |
| --- | --- |
| What is a transaction made of? | `zcash_primitives/src/transaction/mod.rs` |
| How is a transaction built? | `zcash_primitives/src/transaction/builder.rs` |
| How is a TxId computed? | `zcash_primitives/src/transaction/txid.rs` |
| What is the Sprout circuit? | `zcash_proofs/src/circuit/sprout/mod.rs` |
| What does a Zcash address look like? | `components/zcash_address/src/kind/unified.rs` |
| What does F4Jumble do? | `components/f4jumble/src/lib.rs` |
| How does the wallet scan a block? | `zcash_client_backend/src/scanning.rs` |
| What does Equihash verify? | `components/equihash/src/verify.rs` |
| How do we derive Sapling keys? | `zcash_keys/src/keys.rs` (and `sapling-crypto` repo) |

## Conventions in the code

A short list of project-wide patterns. Each is justified in `AGENTS.md`,
read that file before contributing.

- `#![no_std]` by default. Most crates use `extern crate alloc`. Anything
  needing `std` lives behind a `std` feature flag.
- Bundles use the authorization typestate pattern: a `Bundle<A>` is
  parameterised by an `Authorization` associated type so that the type
  system can distinguish "I have spend authorisations" from "I have a
  partially-built bundle that still needs signing/proving". Look for
  `MapAuth` and `InProgress` markers.
- Struct fields are private. Construction goes through `from_parts(...)`
  that returns `Result<_, Error>` and enforces invariants.
- All error types are non-exhaustive enums.
- Newtypes are aggressively preferred over bare integers. `Zatoshis`,
  `ZatBalance`, `BlockHeight`, `TxId`, ...
- Side effects (clocks, RNGs, network calls) are passed as explicit trait
  arguments. This pattern is sometimes called "capability-oriented".

## Build and test

From `AGENTS.md` (paraphrased):

```sh
cargo check  --workspace --all-features
cargo build  --workspace --all-features
cargo test   --workspace --all-features
cargo clippy --all-features --all-targets -- -D warnings
cargo fmt    --all -- --check
```

CI runs across multiple feature combinations. Tests are slow because the
default profile uses `opt-level = 3` (Sapling/Orchard proofs are
expensive). For pure compile-error iteration, use `--profile=dev`.

## What you should know after this chapter

- Where each piece of functionality lives.
- That `zcash_protocol` is the floor and `zcash_client_sqlite` is the
  ceiling.
- That Sapling and Orchard are external crates pulled in here.
- That `librustzcash` is not a consensus node.

The next chapter introduces what Zcash actually does at the protocol level
before any cryptography.
