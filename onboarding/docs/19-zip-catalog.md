---
sidebar_position: 19
title: ZIP catalog and reading order
description: "Curated index of the ZIPs you must know."
---

# 19 - ZIP catalog and reading order

## Goal

The Zcash Improvement Proposals (ZIPs) are the canonical
specification for everything beyond the core protocol PDF. They
are *prescriptive*: the wallet and node must implement them
exactly. This chapter is a curated index of ZIPs you should read,
grouped by topic with a suggested reading order and the relevant
files in this workspace.

All ZIPs are at https://zips.z.cash/. References below use the
short form ZIP-XXXX.

## 1. The starter pack

If you only read five ZIPs, read these:

1. **ZIP 32** - HD key derivation (Sapling, Orchard, Unified).
2. **ZIP 244** - Transaction sighash algorithm v5.
3. **ZIP 316** - Unified Addresses and viewing keys.
4. **ZIP 317** - Default conventional fees.
5. **ZIP 212** - Note plaintext semantics fix (rcm derivation).

These five touch almost every wallet code path.

## 2. Encoding and addresses

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 32 | Shielded HD Wallets | Sapling derivation; updated for Orchard |
| ZIP 173 | Bech32 Format | Sapling address encoding |
| ZIP 316 | Unified Addresses and Viewing Keys | UA/UFVK structure, F4Jumble |
| ZIP 320 | Use of TEX Addresses in PCZT | Transparent receivers in UAs |
| ZIP 48 | Transparent Account Keys | Used by `zcash_transparent::zip48` |
| ZIP 173 / BIP 173 | Bech32 | Generic encoding |

Code: `components/zcash_address/src/`,
`components/f4jumble/src/lib.rs`, `zcash_transparent/src/zip48.rs`.

## 3. Transaction format

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 225 | Transaction Version 5 | Wire format post-NU5 |
| ZIP 243 | Transaction Signature Validation for Sapling | v4 sighash |
| ZIP 244 | Transaction Identifiers and Signature Validation | v5 sighash and TxId |
| ZIP 230 | Transaction v6 | NU7 (in progress) |

Code: `zcash_primitives/src/transaction/`, `sighash_v4.rs`,
`sighash_v5.rs`, `sighash_v6.rs`, `txid.rs`.

## 4. Shielded protocols

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 212 | Allow Recipient to Derive Sapling Ephemeral Secret | rcm derivation |
| ZIP 215 | Explicitly Defining and Modifying Ed25519 Validity Criteria | Signature rules |
| ZIP 216 | Require Canonical Jubjub Point Encodings | Subgroup/canonical |
| ZIP 221 | FlyClient History Tree | History MMR |
| ZIP 224 | Orchard Shielded Protocol | Orchard spec |
| ZIP 226 | Transfer and Burn of Zcash Shielded Assets | ZSA proposal |
| ZIP 227 | Issuance of Zcash Shielded Assets | ZSA issuance |
| ZIP 233 | Network Sustainability Mechanism | Burn ZEC mechanism |

Code: `zcash_history/`, `sapling-crypto` (external),
`orchard` (external).

## 5. PoW and consensus

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 200 | Network Upgrade Mechanism | Branch ID, activation |
| ZIP 207 | Founders' Reward Subsidy | Historical |
| ZIP 208 | Shorter Block Target Spacing | Blossom |
| ZIP 1014 | Establishing a Dev Fund | Funding stream |
| ZIP 251 | Deployment of the NU5 Network Upgrade | NU5 specifics |
| ZIP 252 | Deployment of the NU6 Network Upgrade | NU6 specifics |

Code: `components/zcash_protocol/src/consensus.rs`,
`components/equihash/src/`.

## 6. Fees, payments, wallet UX

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 317 | Conventional Transaction Fee Mechanism | Default fee rule |
| ZIP 321 | Payment Request URIs | URI format |

Code: `zcash_primitives/src/transaction/fees.rs`,
`components/zip321/`.

## 7. PCZT

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 304 | Sign Message - Spending Authority Signatures | Spend-auth design |
| ZIP-Y for PCZT | (draft) Partially Created Zcash Transaction | The PCZT spec |

Code: `pczt/`.

## 8. Light client

| ZIP | Title | Notes |
| --- | --- | --- |
| ZIP 307 | Light Client Protocol | lightwalletd interface |
| ZIP 308 | Sapling Compact Block Format | Compact block contents |

Code: `zcash_client_backend/src/proto/`.

## 9. Reading order, by week

A practical reading order to pair with the study plan in chapter 11:

### Week 1
- ZIP 200 (network upgrades).
- ZIP 173 (bech32).

### Week 3 (paired with Sapling chapter)
- ZIP 32 (HD wallets).
- ZIP 215 (signature validation).
- ZIP 216 (canonical encoding).
- ZIP 212 (rcm derivation).

### Week 5 (paired with Orchard chapter)
- ZIP 224 (Orchard).
- ZIP 225 (transaction v5).
- ZIP 244 (sighash v5).

### Week 7 (paired with keys/addresses)
- ZIP 316 (Unified Addresses).
- ZIP 48 (transparent account keys).
- ZIP 320 (TEX addresses).

### Week 8 (paired with transactions)
- ZIP 243 (sighash v4).
- ZIP 244 (re-read).
- ZIP 317 (fees).

### Week 9 (paired with note encryption)
- ZIP 212 (re-read).

### Week 10 (paired with wallet stack)
- ZIP 307 (light client protocol).
- ZIP 308 (compact block).
- ZIP 321 (payment request).

### Week 11 (paired with consensus)
- ZIP 221 (history tree).
- ZIP 200 (re-read).

### Bonus
- ZIP 226 / 227 / 233 (active research; see chapter 21).

## 10. ZIPs and audit findings

When an audit finding becomes a consensus rule change, it usually
results in a new ZIP. Examples:

- ZIP 216 emerged from "Jubjub encoding inconsistencies" findings.
- ZIP 244 was driven by malleability concerns and "TxId should be
  free of signature data".
- ZIP 215 codified Bitcoin-style canonical signature handling.

Reading a ZIP backwards (motivation $\to$ change $\to$ test
vectors $\to$ rationale section) is a fast way to learn what bug
class motivated it.

## 11. Test vectors per ZIP

Most ZIPs ship with test vectors. Locations:

- In the ZIP text itself (for short vectors).
- In the spec's appendix (https://zips.z.cash/protocol).
- In the relevant external repo's `test_vectors/`.

In this workspace, test vectors typically live in
`<crate>/src/test_vectors.rs` or under
`<crate>/src/transaction/tests/`.

Adding a test vector to a ZIP is a contribution that maintainers
welcome; it directly improves cross-implementation testing.

## 12. ZIP authors and contacts

The Zcash ZIP editors are listed at https://zips.z.cash/#editors.
Major authors of historical and current ZIPs include Daira Hopwood,
Sean Bowe, Kris Nuttycombe, Jack Grigg, Str4d (Jack Grigg again),
Ying Tong, ying tong.

When drafting a ZIP, follow ZIP 0 (the meta-ZIP) for structure.

## 13. ZIPs that may surprise you

A few ZIPs that are not obviously "cryptography" but matter:

- ZIP 252: deployment-mechanics, including testnet activation
  heights you might need for tests.
- ZIP 207: Founders' Reward (historical) shapes some of the
  coinbase rules in the code; understanding the legacy is useful.
- ZIP 1014: the dev fund: not a code change per se, but it
  parameterises some block-reward distribution that wallet apps
  might display.

## 14. A note on draft ZIPs

Draft ZIPs (status "Draft" or "Proposed") may change. When a draft
ZIP is implemented behind a feature flag (e.g. `zcash_unstable =
"nu7"`), the implementation should track the latest draft and be
ready to update before activation.

## What you should know after this chapter

- Where to find any ZIP.
- The five must-read ZIPs.
- The mapping from ZIP to code module.
- The discipline of reading ZIPs alongside the protocol spec.

Next: external audits, cross-implementation testing.
