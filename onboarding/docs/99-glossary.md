---
sidebar_position: 99
title: "Glossary"
description: "Domain abbreviations used throughout the librustzcash workspace, anchored to definitions in the code."
---

# Glossary

Every term used internally that is not in the index of a standard
cryptography textbook. Each entry links to the file in
[`zcash/librustzcash`](https://github.com/zcash/librustzcash) (or an
upstream crate) where the term is defined.

## A

- **Action**: the Orchard analogue of a Sapling Spend + Output pair.
  One Action encodes a single nullifier, a single new note
  commitment, and a value contribution. Defined in
  [`orchard::action::Action`](https://github.com/zcash/orchard/blob/main/src/action.rs).
- **`ak`**: Orchard authorising key. Pallas point. Derived from `ask`.
- **Anchor**: the Merkle root of the note-commitment tree at the
  block height the transaction commits to. Verifies note membership.

## B

- **`bsk` / `bvk`**: Sapling and Orchard binding signing / verifying
  keys. They tie the value commitments to the rest of the
  transaction.

## C

- **`cv`**: value commitment of a Spend, Output, or Action. Hides the
  note value.
- **`cmu`**: note-commitment u-coordinate (Sapling); the value
  inserted into the Merkle tree.
- **Coinbase**: the first transaction in a block. Special validity
  rules. See [ZIP 213](https://zips.z.cash/zip-0213).

## D

- **`d`**: diversifier byte string (11 bytes). Used to derive a
  diversified payment address.
- **DCO**: Developer Certificate of Origin. The sign-off some
  contributions require (`git commit -s`).

## E

- **`epk`**: ephemeral public key (Sapling) / equivalent in Orchard.
  Used in note encryption.
- **Equihash**: the proof-of-work scheme used by Zcash. Defined in
  [`components/equihash`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash).

## F

- **F4Jumble**: invertible mixing function applied to Unified
  Addresses. Implemented in
  [`components/f4jumble`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble).
  See [ZIP 316](https://zips.z.cash/zip-0316).
- **FVK**: Full Viewing Key. Decrypts incoming notes and observes
  outgoing transactions without spend authority.

## G

- **Groth16**: the zk-SNARK system used by Sapling. Defined in
  `bellman` crate.

## H

- **`hSig`**: Sprout transaction-level random value tying JoinSplits
  together.

## I

- **IPA**: Inner Product Argument. The polynomial commitment scheme
  underneath Halo 2.
- **IVK**: Incoming Viewing Key. Derived from FVK; can decrypt
  received notes only.

## J

- **JoinSplit**: legacy Sprout transfer primitive.
- **Jubjub**: Edwards curve over the BLS12-381 scalar field. Sapling
  in-circuit curve.

## L

- **LL**: "Low-level". `zcash_client_backend::data_api::ll` is the
  low-level data API.

## M

- **Memo**: 512-byte field accompanying a shielded note, encrypted to
  the recipient.

## N

- **`nf`**: nullifier. Spent-note marker, public.
- **`nsk`**: nullifier-deriving secret key.
- **Note**: a shielded UTXO. Carries value, diversified address,
  randomness.

## O

- **OVK**: Outgoing Viewing Key. Lets the sender decrypt their own
  outgoing notes after the fact.
- **`out_ciphertext`**: the OutCiphertext field of a shielded
  output, encrypted under `ovk`.

## P

- **Pallas**: Pasta-curve cycle partner of Vesta. Orchard in-circuit
  curve. Defined in
  [`pasta_curves/src/pallas.rs`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs).
- **PCZT**: Partially Created Zcash Transaction. Lives in
  [`pczt/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt).
- **PoW**: Proof of Work. Equihash for Zcash.
- **`prf_expand`**: domain-separated key-expansion PRF used widely
  across the protocol.

## R

- **RedDSA / RedJubjub / RedPallas**: re-randomisable signature
  scheme used for spend authorisations and binding signatures.
- **`rcm`**: note commitment randomness.

## S

- **Sapling**: the second shielded pool. Jubjub + BLS12-381 + Groth16.
- **Sinsemilla**: Pedersen-hash variant used inside Halo 2. Cheap
  with lookup tables.
- **Sprout**: the first shielded pool. JoinSplit-based, BCTV14-then
  -Groth16. Deprecated for new transactions.
- **`ssk`**: spend authorising secret key.

## T

- **t-address**: transparent address (P2PKH or P2SH).
- **Test vector**: stored expected outputs that cross-implementation
  tests are checked against. Lives next to the code or in
  `test-data/`.

## U

- **UA**: Unified Address. Encoding combining multiple receiver
  types (transparent, Sapling, Orchard).
- **UFVK / UIVK**: Unified Full / Incoming Viewing Key.

## V

- **Vesta**: Pasta-curve cycle partner of Pallas. Defined in
  [`pasta_curves/src/vesta.rs`](https://github.com/zcash/pasta_curves/blob/main/src/vesta.rs).
- **`vsk` / `vvk`**: value-balance signing / verifying keys
  (alternative names for `bsk` / `bvk` in some contexts).

## Z

- **z-address**: shielded address (Sapling or Orchard).
- **ZIP**: Zcash Improvement Proposal. Indexed at
  <https://zips.z.cash/>.
