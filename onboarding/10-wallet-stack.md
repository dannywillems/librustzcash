# 10 - The wallet stack

## Goal

The wallet stack is what most external consumers of `librustzcash`
actually interact with. It is a set of traits and helpers that:

- Define a storage-agnostic wallet model.
- Implement chain scanning (decryption + commitment-tree updates).
- Construct transaction proposals and high-level transactions.
- Talk to `lightwalletd` over gRPC.

The mathematics is largely confined to glue around the per-pool
cryptography we have already covered; the substance here is *systems*
and *protocol composition*. Still, you will need to know what each
piece does, because most of your work as a principal will touch
either this code or its callers.

## 1. Layered traits

`zcash_client_backend::data_api` defines a hierarchy of traits, in
roughly the order you discover them:

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

Each trait is parameterised by associated types:

- `Self::Error`: storage-specific error.
- `Self::AccountId`: opaque account identifier.
- `Self::Account`: the per-account record.
- `Self::NoteRef`: opaque per-note identifier.
- ...

This generic-over-storage design lets the same wallet logic run with
SQLite, in-memory, encrypted, or any other backing store.

Concrete implementations:

- `zcash_client_sqlite::WalletDb`: SQLite, the reference.
- `zcash_client_memory::MemoryWalletDb`: in-memory, for tests.
- Downstream: wallet apps implement their own where needed.

## 2. Chain scanning

The scan pipeline is in `zcash_client_backend::scanning`. The job:
for each block from a starting height, find every shielded output and
nullifier that affects the wallet's tracked accounts.

The algorithm:

1. Pull a block (or a `CompactBlock` from lightwalletd) which contains
   per-output commitments, ephemeral keys, and a 52-byte compact
   ciphertext prefix.
2. For each output, **trial-decrypt** with every $\mathsf{ivk}$ the
   wallet tracks (chapter 08). On success: record the note.
3. For each transparent output: check against tracked UFVK-derived
   transparent receivers.
4. For each shielded spend: extract the nullifier and check it
   against the wallet's set of unspent-note nullifiers.
5. Update the commitment-tree state (positions, frontier).
6. Update the wallet DB.

Scanning runs in batches. Implementation detail: trial decryption is
parallelised across outputs and accounts. The scanner uses a
**checkpoint** discipline: every $K$ blocks (configurable), the
commitment-tree state is snapshotted so that rollbacks (in case of a
chain reorg) only have to revert from a checkpoint.

The commitment-tree implementation is `shardtree`, an external crate
that stores a sharded checkpointed incremental Merkle tree on disk
efficiently.

## 3. Proposals and transactions

A wallet building a transaction goes through a two-phase pipeline:

1. **Proposal**: given a `TransactionRequest` (chapter 06: ZIP 321
   payment request) and a fee strategy, the wallet computes a
   `Proposal<Fee, NoteRef>` that lists the inputs (which notes to
   spend), the outputs (recipients and amounts), the fee, and the
   change output(s). This is **purely deterministic** given the
   wallet state: no randomness, no proofs.
2. **Build**: the proposal is fed into `Builder` (chapter 07) to
   produce the actual transaction, including proofs and signatures.

Why split? The proposal phase makes the user's intent reviewable: the
UI can show "you are about to spend these notes, this is the fee" and
ask for confirmation, before any expensive proving begins.

Read in code:

- `zcash_client_backend/src/proposal.rs`: the `Proposal` type.
- `zcash_client_backend/src/data_api/wallet.rs`:
  `propose_transfer`, `propose_shielding`, `create_proposed_transactions`.

## 4. Fee strategies

ZIP 317 is the default (chapter 07). The wallet exposes a `FeeRule`
trait that proposers consume. Concrete strategies:

- `zip317::FeeRule`: per-action ZIP 317.
- A "fixed" rule used historically (pre-NU5).
- Custom rules can be plugged in.

Change-output selection is handled by a separate trait
(`ChangeStrategy`); the default policy is to keep change in the same
pool as the destination when possible (to avoid cross-pool flows that
make analysis easier).

## 5. ZIP 321 payment requests

ZIP 321 is a URI format:

```text
zcash:address?amount=N.MMMMMMMM&memo=...&label=...
```

Multi-output requests are also supported. Parsing and building lives
in `components/zip321`.

The wallet can take a `TransactionRequest` (one or more outputs from a
ZIP 321 URI) and feed it through the proposal pipeline.

## 6. The light-wallet protocol

`zcash_client_backend::proto::service` (generated protobufs) defines
the gRPC interface to `lightwalletd`:

- `GetLatestBlock`, `GetBlock`, `GetBlockRange`: chain access.
- `GetCompactBlock`, `GetCompactBlockRange`: stripped-down blocks
  containing only the data needed for trial decryption.
- `GetTransaction`: fetch a full transaction by TxId.
- `SendTransaction`: relay a built transaction.
- `GetTaddressTxids`: enumerate transparent-address activity (for
  shielding).

The wallet drives this via `zcash_client_backend::lightwalletd_tonic`
behind a feature flag.

## 7. Storage layout (SQLite)

The SQLite backend uses a small set of tables (paraphrased):

- `accounts`: one row per account, UFVK metadata.
- `addresses`: one row per derived address.
- `transactions`: one row per known transaction.
- `sapling_received_notes`, `orchard_received_notes`: received notes.
- `sent_notes`: outgoing payments (from the sender's POV).
- `sapling_witnesses`, `orchard_witnesses`: per-note Merkle paths
  (efficient witness updates).
- `blocks`, `block_metadata`: chain state.
- `nullifier_map`: maps spent-nullifier -> note-id for fast spent
  detection.

The schema is migrated via SQL files in `zcash_client_sqlite/src/wallet/init/migrations/`.
Each migration is a UUID-named module; the system records which UUIDs
have run so upgrades are idempotent.

When you read `zcash_client_sqlite`, start from `lib.rs::WalletDb`,
follow trait implementations into `wallet.rs`, then the migration
modules.

## 8. The `pczt` flow inside the wallet

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

## 9. The "tor" feature

`zcash_client_backend::tor` provides a tor-tunnelled HTTP client for
fetching parameters and connecting to lightwalletd. This is a privacy
feature, not a cryptographic one, but it lives here because the
client backend orchestrates network calls.

## 10. The serialization module

`zcash_client_backend::serialization`: a vendored copy of the wire
format for `Proposal`s and other wallet data types, with version
gates. This is the data the wallet emits to its UI or to peer
wallets; do not confuse it with the consensus wire format.

## 11. Things to know as a principal

- The wallet model is **append-only** at the chain level: blocks are
  scanned forward; rollbacks are handled by reverting to a
  checkpoint and re-scanning.
- The commitment tree is the largest hot data structure. Inefficient
  witness updates have been a recurring bug source. Read `shardtree`
  before you touch this.
- Light clients often have access to the **CompactBlock** wire
  format but not full transactions, so the wallet must do trial
  decryption from minimal data and fetch the full tx only when a
  note is found.
- The fee strategy is *almost* the only place in the codebase where
  network-economic policy is encoded. Changing it changes behaviour
  for every downstream consumer.

## 12. The `zcash` umbrella crate

There is a top-level `zcash/` crate in the workspace that just
re-exports common types from the lower crates with friendly names.
It is intentionally thin; you almost never need to touch it.

## What you should know after this chapter

- The trait layering of `WalletRead/WalletWrite/WalletCommitmentTrees`.
- The scan pipeline and checkpoint discipline.
- The split between Proposal (no crypto) and Build (crypto).
- The light-wallet gRPC surface.
- The SQLite schema at a glance.

You have now finished the substantive part of the course. Last
chapter: study plan and exercises.
