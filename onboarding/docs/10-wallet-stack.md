---
sidebar_position: 10
title: The wallet stack
description: "client_backend, scanning, fees, SQLite storage, PCZT pipeline."
---

# 10 - The wallet stack

## 1. Why this chapter exists

The wallet stack is what most external consumers of `librustzcash`
actually interact with: a set of traits and helpers that define a
storage-agnostic wallet model, implement chain scanning (trial
decryption plus commitment-tree updates), construct transaction
proposals, and talk to `lightwalletd` over gRPC. A contributor who
cannot point to the trait that owns each capability will struggle
to add a new database backend or change a fee policy without
breaking downstream wallets. By the end of this chapter you will be
able to identify the `WalletRead`/`WalletWrite`/
`WalletCommitmentTrees` triangle in
[`zcash_client_backend/src/data_api.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api.rs),
the scan pipeline in
[`zcash_client_backend/src/scanning.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs),
the proposal/builder split in
[`zcash_client_backend/src/data_api/wallet.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api/wallet.rs),
and the reference SQLite layout in
[`zcash_client_sqlite/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_sqlite).

The mathematics is largely confined to glue around the per-pool
cryptography we have already covered; the substance here is systems
and protocol composition.

## 2. Definitions

### 2.1 The trait triangle

**Definition (WalletRead).** A read-only query interface
parameterised by associated types `Error`, `AccountId`, `Account`,
`NoteRef`, etc. Implementors expose every state a wallet needs to
read without committing to a storage backend.

**Definition (WalletWrite).** A super-trait of `WalletRead` that
adds insertion and update methods. Concrete backends implement both
together (`WalletRead` separately, then `WalletWrite: WalletRead`).

**Definition (WalletCommitmentTrees).** The companion trait that
owns Sapling and Orchard commitment-tree state via the `shardtree`
crate. Separated from `WalletWrite` because tree updates have
distinct concurrency requirements.

### 2.2 Two-phase transaction construction

**Definition (Proposal).** Given a `zip321::TransactionRequest` and
a fee strategy, the proposal is a deterministic
`Proposal<FeeRule, NoteRef>` listing inputs (which notes to spend),
outputs (recipients and amounts), the fee, and the change
output(s). No randomness, no proofs.

**Definition (Build).** The proposal is fed into the builder of
chapter 07 to produce the actual transaction including proofs and
signatures.

**Invariant (proposal review).** The proposal phase makes the
user's intent reviewable: the UI can show "you are about to spend
these notes, this is the fee" and ask for confirmation before any
expensive proving begins.

### 2.3 Chain scanning

**Definition (scan).** For each block from a starting height, the
scanner finds every shielded output and nullifier that affects the
wallet's tracked accounts. The block arrives as a `CompactBlock`
(per-output commitment, ephemeral key, and 52-byte ciphertext
prefix) from `lightwalletd`. The scanner:

1. Trial-decrypts every output against every tracked
   $\mathsf{ivk}$ (chapter 08).
2. For each transparent output, checks tracked UFVK-derived
   transparent receivers.
3. For each shielded spend, extracts the nullifier and checks it
   against the wallet's unspent-note nullifier set.
4. Updates the commitment-tree state (positions, frontier).
5. Updates the wallet DB.

**Definition (checkpoint discipline).** Every $K$ blocks
(configurable), the commitment-tree state is snapshotted so that
rollbacks (chain reorgs) only have to revert from a checkpoint
rather than from genesis.

### 2.4 PCZT pipeline

**Definition (PCZT flow).** When the wallet uses an external prover
or signer, the bundle round-trips through PCZT serialised form,
with each role mutating only the slots it owns (chapter 07).

## 3. The code

### 3.1 The trait layering

```text
WalletRead       (read-only queries)
  ^
  |  super-trait
  |
WalletWrite      (insertions and updates)
  ^
  |
WalletCommitmentTrees  (commitment-tree state)
```

`WalletRead` is the largest API surface. Its associated types
encode the storage abstraction:

```rust reference title="zcash_client_backend/src/data_api.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api.rs#L1534-L1563
```

Concrete implementations:

- [`zcash_client_sqlite::WalletDb`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_sqlite/src/lib.rs):
  SQLite, the reference.
- [`zcash_client_memory::MemoryWalletDb`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_memory/src/lib.rs):
  in-memory, for tests.
- Downstream: wallet apps implement their own where needed.

`InputSource` (defined just above `WalletRead` in the same file) is
the read interface used during note selection; the trait split lets
proposals depend on `InputSource` without dragging in the full
write surface.

### 3.2 Chain scanning entry point

The public function is `scan_block`:

```rust reference title="zcash_client_backend/src/scanning.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs#L609-L630
```

It takes a `CompactBlock`, the set of `ScanningKeys`, and the
nullifier index, and returns a `ScannedBlock` with the matched
notes and spent nullifiers. Trial decryption runs in batches
internally via `scan_block_with_runners`.

The commitment-tree implementation is `shardtree`, an external
crate that stores a sharded checkpointed incremental Merkle tree on
disk efficiently.

### 3.3 Proposals and transactions

A wallet building a transaction goes through:

1. `propose_transfer` (or `propose_shielding` for coinbase or
   transparent funds) builds a `Proposal` from a
   `TransactionRequest`. This phase is deterministic.
2. `create_proposed_transactions` consumes the `Proposal`, runs
   the per-pool builders, the prover, the signer, and returns the
   final `Transaction`.

```rust reference title="zcash_client_backend/src/data_api/wallet.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api/wallet.rs#L628-L657
```

The proposal phase calls into note selection (`InputSelector`) and
change strategy (`ChangeStrategy`); the build phase calls the
crypto.

### 3.4 Fee strategies

ZIP 317 is the default (chapter 07). The wallet exposes a `FeeRule`
trait that proposers consume. Concrete strategies:

- `zip317::FeeRule`: per-action ZIP 317.
- A "fixed" rule used historically (pre-NU5).
- Custom rules can be plugged in.

Change-output selection is handled by `ChangeStrategy`; the default
policy keeps change in the same pool as the destination when
possible, to avoid cross-pool flows that simplify analysis.

### 3.5 ZIP 321 payment requests

ZIP 321 is a URI format:

```text
zcash:address?amount=N.MMMMMMMM&memo=...&label=...
```

Multi-output requests are also supported. Parsing and building
live in
[`components/zip321/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zip321).

The wallet takes a `TransactionRequest` (one or more outputs from a
ZIP 321 URI) and feeds it through the proposal pipeline.

### 3.6 The light-wallet protocol

`zcash_client_backend::proto::service` (generated protobufs)
defines the gRPC interface to `lightwalletd`:

- `GetLatestBlock`, `GetBlock`, `GetBlockRange`: chain access.
- `GetCompactBlock`, `GetCompactBlockRange`: stripped-down blocks
  containing only the data needed for trial decryption.
- `GetTransaction`: fetch a full transaction by TxId.
- `SendTransaction`: relay a built transaction.
- `GetTaddressTxids`: enumerate transparent-address activity (for
  shielding).

The wallet drives this via `zcash_client_backend::lightwalletd_tonic`
behind a feature flag.

### 3.7 Storage layout (SQLite)

The SQLite backend uses a small set of tables (paraphrased):

- `accounts`: one row per account, UFVK metadata.
- `addresses`: one row per derived address.
- `transactions`: one row per known transaction.
- `sapling_received_notes`, `orchard_received_notes`: received
  notes.
- `sent_notes`: outgoing payments (from the sender's POV).
- `sapling_witnesses`, `orchard_witnesses`: per-note Merkle paths
  (efficient witness updates).
- `blocks`, `block_metadata`: chain state.
- `nullifier_map`: maps spent-nullifier -> note-id for fast
  spent-detection.

The schema is migrated via SQL files in
[`zcash_client_sqlite/src/wallet/init/migrations/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_sqlite/src/wallet/init/migrations).
Each migration is a UUID-named module; the system records which
UUIDs have run, so upgrades are idempotent.

When you read `zcash_client_sqlite`, start from `lib.rs::WalletDb`,
follow trait implementations into `wallet.rs`, then the migration
modules.

### 3.8 PCZT flow inside the wallet

When the wallet uses an external prover or signer:

```text
WalletWrite -> Builder -> PCZT (constructor stage)
                          -> [over the wire] -> PCZT (prover stage)
                          -> [over the wire] -> PCZT (signer stage)
                          -> Tx Extractor -> Transaction
                          -> WalletWrite::store_decrypted_tx(...)
```

The `pczt` crate is the wire format. The wallet records the PCZT
itself in storage (so that it can resume from a partial state) and
the final transaction once extracted.

### 3.9 The `tor` feature

`zcash_client_backend::tor` provides a Tor-tunnelled HTTP client
for fetching parameters and connecting to lightwalletd. This is a
privacy feature, not a cryptographic one, but it lives here
because the client backend orchestrates network calls.

### 3.10 The serialization module

`zcash_client_backend::serialization` is a vendored copy of the
wire format for `Proposal`s and other wallet data types, with
version gates. This is the data the wallet emits to its UI or to
peer wallets; do not confuse it with the consensus wire format.

### 3.11 The `zcash` umbrella crate

There is a top-level `zcash/` crate in the workspace that
re-exports common types from the lower crates with friendly names.
It is intentionally thin; you almost never need to touch it.

## 4. Failure modes

- **Trait surface bloat.** `WalletRead` has grown over time; adding
  new query methods without thinking about the
  `zcash_client_memory` and `zcash_client_sqlite` implementations
  produces an asymmetric API. New methods should always be added
  with default implementations or with concrete backings in both
  backends.
- **Checkpoint loss after reorg.** The scanner relies on
  checkpoints to bound rollback cost. A bug that fails to record a
  checkpoint at the configured interval makes a reorg silently
  expensive (full re-scan from genesis in the worst case).
- **Witness-update efficiency.** The commitment tree is the largest
  hot data structure. Inefficient witness updates have been a
  recurring bug source. Read `shardtree` before you touch this.
  Adding a new query that retrieves witnesses must use the sharded
  layout, not the legacy whole-tree path.
- **Proposal phase determinism violations.** Adding randomness to
  proposal generation breaks UI confirmation flows: the user sees
  one proposal, the build phase produces a different transaction.
  All randomness belongs in the build phase.
- **Fee strategy as policy hook.** The fee strategy is almost the
  only place in the codebase where network-economic policy is
  encoded. Changing it changes behaviour for every downstream
  consumer; any modification should be accompanied by a clear note
  in the PR description and CHANGELOG entry.
- **Migration UUID collision.** SQLite migrations are keyed by
  UUID. Two PRs that each add a migration with overlapping
  dependencies must be coordinated; missing this produces a
  database that records contradictory migration states.
- **Transaction-request injection.** A malicious ZIP 321 URI with
  unusual amount strings or memo bytes must round-trip safely
  through the parser. Fuzz coverage of `zip321::parse` is
  essential before changing the grammar.

## 5. Spec pointers

- [ZIP 32 - Shielded HD wallets](https://zips.z.cash/zip-0032):
  the account derivation cited throughout `WalletRead::Account`.
- [ZIP 316 - Unified Addresses and Viewing Keys](https://zips.z.cash/zip-0316):
  the UFVK/UIVK container types stored in the `accounts` table.
- [ZIP 317 - Proportional Transfer Fee Mechanism](https://zips.z.cash/zip-0317):
  the default `FeeRule` used by proposers.
- [ZIP 321 - Payment Request URIs](https://zips.z.cash/zip-0321):
  the URI grammar parsed by `components/zip321`.
- [ZIP 307 - Light Client Protocol for Payment Detection](https://zips.z.cash/zip-0307):
  the compact-decryption optimisation that motivates
  `CompactBlock`.
- [lightwalletd protobuf service](https://github.com/zcash/lightwalletd/blob/master/walletrpc/service.proto):
  the upstream `.proto` definitions for the gRPC surface listed in
  Section 3.6.

## 6. Exercises

1. **Map a wallet query.** For the query "what is the total
   spendable balance of account $A$?", trace the call chain from
   the public `WalletRead` method, through the `zcash_client_sqlite`
   implementation, down to the SQL query that runs. Cite each file
   and line.
2. **Identify the checkpoint policy.** Locate where the scanner
   decides to record a checkpoint. State the configurable parameter
   and its default value. Cite the file and line.
3. **Modify and test (code change).** Add a new `FeeRule`
   implementation under `zcash_primitives/src/transaction/fees`
   that returns a flat 12,500 zatoshi fee for any transaction and
   add a unit test demonstrating that proposals built with this
   rule produce the expected fee. Then re-run the existing fee
   tests with the default ZIP 317 rule to confirm they still pass.
4. **Read a migration.** Pick one migration UUID under
   `zcash_client_sqlite/src/wallet/init/migrations` and write a
   one-paragraph summary of what it does, what state it produces,
   and what state it requires as a precondition.

### Answers in the code

- `WalletRead` trait:
  [`zcash_client_backend/src/data_api.rs#L1534-L1563`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api.rs#L1534-L1563).
- `scan_block`:
  [`zcash_client_backend/src/scanning.rs#L609-L630`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs#L609-L630).
- `propose_transfer`:
  [`zcash_client_backend/src/data_api/wallet.rs#L628-L657`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api/wallet.rs#L628-L657).
- SQLite migration registry:
  [`zcash_client_sqlite/src/wallet/init/migrations`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_sqlite/src/wallet/init/migrations).

## 7. Further reading

- [chapter 11](./11-study-plan-and-exercises.md): the study plan
  that converges on a contribution to this layer.
- [shardtree](https://github.com/zcash/incrementalmerkletree):
  the external crate that backs the commitment-tree state.
- [zcash-light-client-ffi](https://github.com/Electric-Coin-Company/zcash-light-client-ffi):
  the Swift/Kotlin downstream FFI that consumes this stack.
