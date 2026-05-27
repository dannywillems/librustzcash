---
sidebar_position: 19
title: ZIP catalog and reading order
description: "Curated index of the ZIPs you must know."
---

# 19 - ZIP catalog and reading order

## 1. Why this chapter exists

The Zcash Improvement Proposals (ZIPs) are the canonical
specification for everything beyond the core protocol PDF. They
are prescriptive: the wallet and node implementations must follow
them exactly. A contributor who edits a parser, a sighash, or a
key-derivation routine without locating the governing ZIP first is
guessing. This chapter is the curated index of ZIPs you should read,
grouped by topic with a reading order and the relevant files in
this workspace. It is a catalog, not a tutorial; use it as a
look-up table when a code path mentions a ZIP number you do not
recognise.

## 2. Definitions

**Definition (ZIP).** A Zcash Improvement Proposal. A versioned
specification document hosted at <https://zips.z.cash/>. ZIPs come
in several statuses: Draft, Proposed, Final, Implemented,
Active, Withdrawn, Replaced. Only Final or Implemented ZIPs are
safe to encode as consensus rules; Draft ZIPs can change.

**Definition (Network upgrade, NU).** A coordinated activation
height at which a set of ZIPs becomes consensus-binding. The
activation heights are wired into
[`components/zcash_protocol/src/consensus.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs).
Each NU has its own deployment ZIP (e.g. ZIP 251 for NU5, ZIP 252
for NU6) that lists the included ZIPs.

**Definition (Consensus ZIP vs application ZIP).** A consensus
ZIP changes the rules that determine whether a block is valid
(e.g. ZIP 216, ZIP 244). An application ZIP standardises an
interface that nodes do not enforce but interoperating wallets
share (e.g. ZIP 321 payment URIs). Both classes matter for
contributors; the distinction matters for what the test surface
covers.

**Definition (ZIP 32 hardened path).** The HD derivation path
used by Zcash wallets, in BIP-32 form
$m / 32' / \text{coin}_\text{type}' / \text{account}' / \ldots$,
with coin type $133$ for mainnet ZEC and $1$ for testnet. See
chapter 06 for derivation details.

All ZIPs cited below use the short form `ZIP-XXX`. The canonical
URL for any of them is `https://zips.z.cash/zip-NNNN`, with
leading zeros.

## 3. The code

### 3.1 The starter pack

The five ZIPs that touch almost every wallet code path:

| ZIP | Title | Why it matters first |
| --- | --- | --- |
| ZIP 32 | Shielded HD Wallets | Spending-key derivation for every pool |
| ZIP 244 | Transaction Identifiers and Signature Validation | v5 sighash and TxId |
| ZIP 316 | Unified Addresses and Viewing Keys | UA / UFVK / UIVK structure |
| ZIP 317 | Conventional Transaction Fee Mechanism | Default fee rule |
| ZIP 212 | Allow Recipient to Derive Sapling Ephemeral Secret | `rcm` and `esk` derivation |

Read these first. Every later ZIP assumes their context.

### 3.2 Encoding and addresses

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 32 | Shielded HD Wallets | `zcash_keys::keys`, `sapling-crypto::zip32` |
| ZIP 173 | Bech32 (cf. BIP 173) | `components/zcash_address/src` |
| ZIP 316 | Unified Addresses, F4Jumble | `zcash_keys::address`, `components/f4jumble` |
| ZIP 320 | TEX addresses | `components/zcash_address/src`, `zcash_transparent` |
| ZIP 48 | Transparent Account Keys | `zcash_transparent/src/zip48.rs` |

The transparent ZIP 48 layer lives here:

```rust reference title="zcash_transparent/src/zip48.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/zip48.rs#L1-L40
```

### 3.3 Transaction format

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 225 | Transaction Version 5 | `zcash_primitives/src/transaction/mod.rs` |
| ZIP 243 | v4 Sighash | `zcash_primitives/src/transaction/sighash_v4.rs` |
| ZIP 244 | v5 Sighash and TxId | `zcash_primitives/src/transaction/sighash_v5.rs`, `txid.rs` |
| ZIP 230 | Transaction v6 (NU7 in progress) | `zcash_primitives/src/transaction/sighash_v6.rs` |

The v6 work is gated behind `zcash_unstable = "nu7"`:

```rust reference title="zcash_primitives/src/transaction/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L80-L110
```

### 3.4 Shielded protocols

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 212 | Sapling `rcm`/`esk` derivation | `sapling-crypto` (external) |
| ZIP 215 | Ed25519 validity criteria | `zcash_primitives` callers |
| ZIP 216 | Canonical Jubjub encodings | `sapling-crypto` (external) |
| ZIP 221 | FlyClient History Tree | `zcash_history` |
| ZIP 224 | Orchard Shielded Protocol | `orchard` (external) |
| ZIP 226 | Transfer and burn of ZSAs | `orchard-zsa` (external, NU7-track) |
| ZIP 227 | Issuance of ZSAs | `orchard-zsa` (external, NU7-track) |
| ZIP 233 | Network Sustainability Mechanism | NU7-track |

The Sapling implementation lives in
[`sapling-crypto`](https://github.com/zcash/sapling-crypto); the
Orchard implementation in
[`orchard`](https://github.com/zcash/orchard). This workspace holds
the transaction-level integration of both.

### 3.5 PoW and consensus

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 200 | Network Upgrade Mechanism | `components/zcash_protocol/src/consensus.rs` |
| ZIP 207 | Founders' Reward (historical) | coinbase logic |
| ZIP 208 | Shorter Block Target Spacing (Blossom) | activation heights |
| ZIP 251 | Deployment of NU5 | activation heights |
| ZIP 252 | Deployment of NU6 | activation heights |
| ZIP 1014 | Establishing a Dev Fund | coinbase logic |

Activation heights:

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L485-L500
```

Equihash PoW lives in
[`components/equihash`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src).

### 3.6 Fees, payments, wallet UX

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 317 | Conventional Fees | `zcash_primitives/src/transaction/fees.rs` |
| ZIP 321 | Payment Request URIs | `components/zip321/src` |

The fee module is trait-based so alternative strategies can be
plugged in:

```rust reference title="zcash_primitives/src/transaction/fees.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs#L1-L40
```

### 3.7 PCZT

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 304 | Sign Message via Spending Authority | `pczt/` roles |
| (draft) ZIP-PCZT | Partially Created Zcash Transaction | `pczt/src` |

The PCZT structure in this repo lives in
[`pczt/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/lib.rs)
with per-component modules under `pczt/src/`. See chapter 22 of
this course for the role-based design.

### 3.8 Light client

| ZIP | Topic | Code |
| --- | --- | --- |
| ZIP 307 | Light Client Protocol | `zcash_client_backend/src/proto` |
| ZIP 308 | Sapling Compact Block Format | `zcash_client_backend/src/proto` |

### 3.9 Mapping ZIPs to a reading week

Pair the ZIPs with the chapter that uses them:

| Week | Chapter | ZIPs to read |
| --- | --- | --- |
| 1 | 01, 01b | ZIP 200, ZIP 173 |
| 3 | 04 | ZIP 32, ZIP 212, ZIP 215, ZIP 216 |
| 5 | 05 | ZIP 224, ZIP 225, ZIP 244 |
| 7 | 06 | ZIP 316, ZIP 48, ZIP 320 |
| 8 | 07 | ZIP 243, ZIP 244, ZIP 317 |
| 9 | 08 | ZIP 212 (re-read) |
| 10 | 10 | ZIP 307, ZIP 308, ZIP 321 |
| 11 | 09 | ZIP 221, ZIP 200 (re-read) |
| 12 | 21 | ZIP 226, ZIP 227, ZIP 230, ZIP 233 |

### 3.10 ZIPs that historically codified audit findings

When an audit finding becomes a consensus rule change, it usually
results in a new ZIP. Examples:

- ZIP 216 emerged from "Jubjub encoding inconsistencies"
  findings.
- ZIP 244 was driven by malleability concerns and the principle
  that TxId should be free of signature data.
- ZIP 215 codified Bitcoin-style canonical signature handling.

Reading a ZIP backwards (motivation -> change -> test vectors ->
rationale) is a fast way to learn what bug class motivated it.

### 3.11 Test vectors per ZIP

Most ZIPs ship with test vectors. Locations:

- Inline in the ZIP text for short vectors.
- In the spec appendix at <https://zips.z.cash/protocol>.
- In the relevant repo's `test_vectors/` directory.
- Centrally in the `zcash/zips` repo under `zip-XXXX/test-vectors/`
  for cross-implementation testing.

In this workspace, vectors typically live in
`<crate>/src/test_vectors.rs` or under
`<crate>/src/transaction/tests/`. Example: the transparent
test vectors are under
[`zcash_transparent/src/test_vectors`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/test_vectors).

### 3.12 Draft ZIPs

Draft ZIPs (status "Draft" or "Proposed") may change. When a draft
ZIP is implemented behind a feature flag (e.g.
`RUSTFLAGS='--cfg zcash_unstable="nu7"'`), the implementation
should track the latest draft and be ready to update before
activation. Always pin the ZIP version in the commit message
introducing the implementation.

## 5. Spec pointers

- [ZIP index](https://zips.z.cash/): the authoritative list of
  every ZIP with its current status. Start here when researching
  any rule.
- [ZIP 0](https://zips.z.cash/zip-0000): the meta-ZIP that
  defines ZIP structure, statuses, and the editorial process. Read
  this before drafting one.
- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf):
  the consolidated normative document. ZIPs amend sections of the
  spec; the spec PDF integrates the amendments.
- [`zcash/zips` GitHub repo](https://github.com/zcash/zips): the
  source of all ZIP markdown plus shared test vectors.
- [ZIP editors and authors](https://zips.z.cash/#editors): who to
  contact when drafting or reviewing.

## 6. Exercises

1. **Map a ZIP to code.** Pick ZIP 244. Locate the file in this
   workspace that implements the v5 sighash algorithm and the
   file that defines TxId. Cite line ranges. Then locate the test
   vector file that exercises both.
2. **Read a ZIP backwards.** Open ZIP 216 (Canonical Jubjub
   encodings). Read the motivation section first, then locate
   one place in `sapling-crypto` (external) where a canonical
   encoding check is enforced. State which class of bug the check
   prevents.
3. **Add a test vector.** In a checkout, pick a ZIP-321 payment
   URI example from the ZIP text, encode it as a test in
   [`components/zip321/src`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zip321/src),
   run the test, and confirm it passes. State the line number you
   inserted the test at.
4. **Locate an NU7 hook.** Use `git grep zcash_unstable` to find
   the v6 transaction hooks in
   [`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs).
   Identify which ZIP (or draft ZIP) governs the new fields and
   record the URL.

### Answers in the code

- ZIP 244 sighash:
  [`zcash_primitives/src/transaction/sighash_v5.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v5.rs).
- ZIP 244 TxId:
  [`zcash_primitives/src/transaction/txid.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs).
- ZIP 32 derivation entry point:
  [`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs).
- ZIP 48 transparent accounts:
  [`zcash_transparent/src/zip48.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/zip48.rs).
- Activation heights:
  [`components/zcash_protocol/src/consensus.rs#L485-L500`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L485-L500).

## 7. Further reading

- [ZIP 252](https://zips.z.cash/zip-0252): deployment-mechanics
  for NU6, including testnet activation heights you may need for
  local tests.
- [ZIP 1014](https://zips.z.cash/zip-1014): the dev fund. Not a
  consensus rule the wallet enforces directly, but it shapes the
  coinbase distribution that wallets display.
- The Zcash Foundation and ECC engineering blogs link new ZIPs as
  they are proposed; subscribing is the most reliable way to keep
  up.
