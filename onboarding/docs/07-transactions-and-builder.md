---
sidebar_position: 7
title: Transactions, sighash, builder, PCZT
description: "v4/v5/v6 layout, sighash trees, builder typestate, PCZT roles."
---

# 07 - Transactions, sighash, builder, PCZT

## 1. Why this chapter exists

A Zcash transaction is a tightly packed structure of versioned
bundles, digest trees, signatures, and proofs. The wire format
parses in
[`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs);
the sighash that ties everything together is computed in
[`zcash_primitives/src/transaction/sighash.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs);
the high-level builder lives in
[`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs).
A contributor who cannot describe the v5 TxId tree from memory will
produce silent signing failures the moment they touch the parser or
the sighash code. By the end of this chapter you will be able to map
each byte of a v5 transaction to a struct field, walk the digest
tree, follow the builder typestate from `Unauthorized` to
`Authorized`, and identify which PCZT role file under
[`pczt/src/roles/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/roles)
owns each transformation.

The math is lighter than in chapters 04 and 05; the rigour is in the
**structure** of the digests. A subtle bug here breaks signatures
or proofs without any loud failure.

## 2. Definitions

### 2.1 Transaction versions

**Definition (transaction version pair).** A transaction is
identified by the pair `(tx_version, version_group_id)`. The
relevant pairs:

- **v4**: Sapling-era. Sprout + Sapling + transparent bundles.
  Sighash defined by [ZIP 243](https://zips.z.cash/zip-0243). Used
  until NU5.
- **v5**: NU5 onwards. Adds Orchard. Sighash defined by
  [ZIP 244](https://zips.z.cash/zip-0244). Sprout removed.
- **v6**: NU7 (in development, behind `zcash_unstable = "nu7"`).
  Adds support for new components such as ZIP 233 burn and asset
  issuance hooks.

The constants are defined in
[`components/zcash_protocol/src/constants.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/constants.rs).

### 2.2 v5 wire layout

```text
nVersion (with overwinter bit) : 4 bytes
nVersionGroupId                : 4 bytes
nConsensusBranchId             : 4 bytes
lock_time                      : 4 bytes
expiry_height                  : 4 bytes
transparent_bundle:
    vin  : varint count then TxIn structs
    vout : varint count then TxOut structs
sapling_bundle (compact form):
    n_spends_sapling   : varint
    n_outputs_sapling  : varint
    [if either > 0]:
        value_balance_sapling : 8 bytes (signed)
        anchor_sapling        : 32 bytes
        sapling_spends...
        sapling_outputs...
        binding_sig_sapling   : 64 bytes (only if any spends/outputs)
orchard_bundle:
    n_actions : varint
    [if > 0]:
        flags             : 1 byte (spends_enabled, outputs_enabled, ...)
        value_balance     : 8 bytes
        anchor_orchard    : 32 bytes
        actions...
        size_proof + proof bytes (Halo 2 proof)
        spend_auth_sigs (one per action)
        binding_sig_orchard
```

A Sapling SpendDescription on the wire (v5):

```text
cv             : 32 bytes (Jubjub point compressed)
nullifier      : 32 bytes
rk             : 32 bytes
zkproof        : 192 bytes (Groth16)
spend_auth_sig : 64 bytes
```

In v5, the anchor lives once at the bundle level rather than per
spend, since all spends share an anchor.

A Sapling OutputDescription:

```text
cv             : 32 bytes
cmu            : 32 bytes  (u-coordinate only)
ephemeral_key  : 32 bytes
enc_ciphertext : 580 bytes
out_ciphertext : 80 bytes
zkproof        : 192 bytes
```

An Orchard Action:

```text
cv             : 32 bytes
nullifier      : 32 bytes
rk             : 32 bytes
cmx            : 32 bytes
ephemeral      : 32 bytes
enc_ciphertext : 580 bytes
out_ciphertext : 80 bytes
```

The Halo 2 proof and spend-auth signatures are bundle-level in
Orchard, not per-action.

### 2.3 v5 TxId tree

**Definition (v5 TxId).** The TxId of a v5 transaction is the root
of a small BLAKE2b tree with domain-separated nodes:

$$
\mathsf{txid} \;=\; \mathsf{BLAKE2b\text{-}256}\!\bigl(
  \text{pers}=\text{"ZcashTxHash\_"} \mathbin{\|} C_{\text{branch}}; \;
  H_{\text{header}} \mathbin{\|} H_{\text{transparent}} \mathbin{\|}
  H_{\text{sapling}} \mathbin{\|} H_{\text{orchard}}
\bigr),
$$

with each sub-digest using its own personalisation. The
personalisation is exactly 16 bytes (BLAKE2b uses 16-byte
personalisations); the literal `"ZcashTxHash_"` plus the 4-byte
branch ID $C_{\text{branch}}$ fills the 16 bytes.

Nesting structure: $H_{\text{transparent}}$ is itself
$\mathsf{BLAKE2b}(\text{prevouts\_hash} \mathbin{\|}
\text{sequence\_hash} \mathbin{\|} \text{outputs\_hash})$ under its
own personalisation; $H_{\text{sapling}}$ is a tree over spends,
outputs, and the value balance; $H_{\text{orchard}}$ is similar.

**Lemma (sighash reuse).** When the sender hashes "this transaction
except for input $i$'s scriptSig", they only need to recompute one
sub-tree, not the whole transaction. Signing $n$ inputs costs $O(n)$
BLAKE2b calls rather than $O(n^2)$.

### 2.4 Authorising data vs identity

**Definition (TxId vs authorising data hash).** A v5 transaction
has two digests:

- **TxId**: root of the digest tree over non-authorising data
  (commitments, anchors, value balances, proofs). Signature
  malleation cannot change the TxId.
- **Authorising data hash**: a hash of the signatures and proofs.
  The block header's `hashAuthDataRoot` commits to it.

This is what makes Zcash transactions non-malleable without
segwit-style witness rollup.

### 2.5 ZIP 317 fees

**Definition (ZIP 317 logical action count).** The fee per
transaction is

$$
\text{fee} \;=\; \texttt{MARGINAL\_FEE} \times \max\!\bigl(
\texttt{GRACE\_ACTIONS},\; n_{\text{logical}}\bigr),
$$

with the constants `MARGINAL_FEE = 5000 zatoshi`,
`GRACE_ACTIONS = 2`, giving a `MINIMUM_FEE = 10000 zatoshi`. The
logical action count combines transparent and shielded components
with specific weights (see
[ZIP 317](https://zips.z.cash/zip-0317) for the exact formula).

## 3. The code

### 3.1 Version constants and the parser dispatch

```rust reference title="components/zcash_protocol/src/constants.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/constants.rs#L16-L44
```

The parser at `Transaction::read` switches on these constants and
dispatches to `read_v4`, `read_v5`, or `read_v6`:

```rust reference title="zcash_primitives/src/transaction/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L816-L830
```

Adding a new version means: define the constants, add a `TxVersion`
variant, implement `read`/`write`, implement the new sighash code,
plumb the new bundle types.

### 3.2 The v5 TxId tree in code

The digest tree lives in
[`zcash_primitives/src/transaction/txid.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs).
The root combiner is `to_txid`:

```rust reference title="zcash_primitives/src/transaction/txid.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L435-L452
```

The sub-digesters are `hash_transparent_txid_data`,
`hash_sapling_txid_data`, plus the orchard digester (delegated to
the `orchard` crate). Each accepts a parsed bundle and produces a
32-byte BLAKE2b output under a per-tree personalisation.

### 3.3 Sighash dispatch

The signature hash is what gets signed by transparent ECDSA inputs
and what Sapling spend-auth and binding signatures both sign. The
dispatch is parameterised by version:

```rust reference title="zcash_primitives/src/transaction/sighash.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs#L45-L70
```

The per-version implementations are in:

- `sighash_v4.rs`: ZIP 243 (v4 Sapling).
- `sighash_v5.rs`: ZIP 244 (v5 Orchard).
- `sighash_v6.rs`: NU7 in-flight.

For transparent inputs, the sighash adds an "input subdigest" leaf
that includes the prevout being spent, the scriptPubKey being spent
(from the previous transaction), the amount being spent, and the
current input's sequence. This is the generalised BIP-143 segwit
sighash. For shielded signatures, `SIGHASH_ALL` is the only valid
value.

### 3.4 The Builder

The high-level builder type:

```rust reference title="zcash_primitives/src/transaction/builder.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs#L339-L359
```

Usage shape:

```rust
let mut builder = Builder::new(consensus_branch_id, target_height);

builder.add_transparent_input(...)?;
builder.add_transparent_output(addr, amount)?;
builder.add_sapling_spend(extsk, diversifier, note, merkle_path)?;
builder.add_sapling_output(ovk, to, value, memo)?;
builder.add_orchard_spend(...)?;
builder.add_orchard_output(...)?;

let (tx, _meta) = builder.build(&prover, &mut rng, fee_rule)?;
```

Internally:

1. Per-pool builders accumulate notes and outputs into
   `sapling_builder::Builder` and `orchard::builder::Builder` (both
   external crates), which know how to do the per-pool dance
   (sample randomness, compute commitments, prepare circuits).
2. The high-level builder computes the signature hash in a
   pre-signature form (with placeholder zero signatures) to obtain
   the digests needed by the proofs.
3. The Sapling and Orchard provers run, producing proofs.
4. Transparent and shielded signatures are computed.
5. The bundle is "authorised": its `Authorization` type parameter
   transitions from `Unauthorized` to `Authorized`.

The typestate transition, conceptually:

```text
sapling::Bundle<Unauthorized, V>
    --[ apply prover ]-->
sapling::Bundle<InProgress<Proven, Unsigned>, V>
    --[ apply signer ]-->
sapling::Bundle<Authorized, V>
```

You will see `MapAuth` trait implementations everywhere; that is
the machinery that walks a bundle and converts each authorisation
slot from one type to another, with the type system enforcing that
you cannot skip a step.

### 3.5 Fees in code

ZIP 317 is the default since NU5. The constants live in
[`zcash_primitives/src/transaction/fees/zip317.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees/zip317.rs):

```rust reference title="zcash_primitives/src/transaction/fees/zip317.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees/zip317.rs#L15-L60
```

The `FeeRule` trait is what proposers consume. Implementations
include `zip317::FeeRule` and the "fixed" rule used historically
(pre-NU5). Change-output selection is handled by `ChangeStrategy`;
the default policy keeps change in the same pool as the destination
when possible (to avoid cross-pool flows that make analysis easier).

### 3.6 PCZT roles

PCZT generalises Bitcoin's PSBT to Zcash. The `Pczt` type holds all
data needed to construct a transaction across roles, with per-role
typestate:

```rust reference title="pczt/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/lib.rs#L60-L82
```

Role modules live under
[`pczt/src/roles/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/roles).
The role flow for a typical hardware-wallet-assisted spend:

```text
Creator (chooses version, expiry)
  -> PCZT v0
Constructor (adds inputs/outputs, picks anchors)
  -> PCZT v1
IO Finalizer (locks input/output set)
  -> PCZT v2
Prover (off-line, fast machine)
  -> PCZT v3 (proofs filled in)
Signer (online, with secret keys)
  -> PCZT v4 (spend-auth and transparent sigs filled in)
Tx Extractor (emits the wire transaction)
  -> Transaction
```

Each role only mutates the slots it owns. The crate uses
serde-derived serialisation, which is one of the few explicitly
approved uses of serde in the workspace (per `AGENTS.md`).

The motivation: split the prover from the signer. Proving is
CPU-bound but does not require secret keys; signing is fast but
does require them. A hardware wallet wants to sign without proving.

### 3.7 From wallet to wire

```text
[wallet UI] -> [TransactionRequest] -> [Proposal]
   |
   v
[fee selection / note selection] (zcash_client_backend::data_api::wallet)
   |
   v
[create_proposed_transactions]
   |
   +-- single-key flow:
   |     local secret keys; Builder builds directly.
   |
   +-- PCZT flow:
         Builder builds the Constructor stage, then PCZT serialises;
         external Prover and Signer roles fill in;
         Tx Extractor produces the wire transaction.
```

A wallet that handles both single-key and hardware-signer setups
should prefer the PCZT pipeline even for the single-key case, for
uniformity.

## 4. Failure modes

- **BranchId vs version mismatch.** A transaction is bound to a
  consensus branch ID. Using the wrong branch makes the sighash
  wrong, which silently produces invalid signatures. The sighash
  dispatch in
  [`sighash.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs)
  takes the branch ID via `TxDigests`; passing inconsistent data
  through is a quiet failure.
- **Anchor age.** Anchors must come from blocks at least
  `MIN_CONFIRMATIONS = 10` deep; using a too-recent anchor causes
  rejection by the node. Wallets enforce this in the proposal
  phase.
- **Expiry height.** `expiry_height = 0` means "no expiry". Most
  wallets set it to current height + 40 or so. Forgetting to set
  it leaves transactions in the mempool indefinitely.
- **Dummy spends/outputs.** Shielded bundles can contain dummy
  spends (zero-value, circuit-allowed special-case path) to
  obscure the true count of inputs. The builder must enforce
  $v = 0$ for dummies; non-zero dummies silently corrupt
  $v_{\text{bal}}$ and break the binding signature.
- **Sapling value balance sign convention.** Negative when more
  value flows out of Sapling; positive when more flows in.
  Off-by-one-sign is a common bug.
- **Skipping the `MapAuth` step.** The typestate enforces that you
  cannot transition `Bundle<Unauthorized>` directly to
  `Bundle<Authorized>` without going through the proven-unsigned
  middle state. Bypassing this with `unsafe` or unchecked casts
  loses the safety property; any change to the bundle types must
  preserve this invariant.
- **TxId vs authorising hash confusion.** For deposit detection and
  wallet bookkeeping, always use the TxId. For mempool/pool
  deduplication and propagation, the wtxid-like "authorising hash"
  matters. Mixing them up was a documented historical issue.

## 5. Spec pointers

- [ZIP 225 - Version 5 Transaction Format](https://zips.z.cash/zip-0225):
  the v5 wire layout the parser in `transaction/mod.rs` implements.
- [ZIP 243 - Transaction Signature Validation for Sapling](https://zips.z.cash/zip-0243):
  the v4 sighash construction in `sighash_v4.rs`.
- [ZIP 244 - Transaction Identifier Non-Malleability](https://zips.z.cash/zip-0244):
  the v5 TxId tree and ZIP 244 sighash; cited by `txid.rs` and
  `sighash_v5.rs`.
- [ZIP 317 - Proportional Transfer Fee Mechanism](https://zips.z.cash/zip-0317):
  the fee formula implemented in `transaction/fees/zip317.rs`.
- [BIP 174 - Partially Signed Bitcoin Transactions](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki):
  the conceptual parent of PCZT.
- [Zcash Protocol Specification, section 7](https://zips.z.cash/protocol/protocol.pdf):
  encodings, sighash trees, and version-group IDs.

## 6. Exercises

1. **Parse a real v5 transaction.** Take a v5 mainnet transaction
   (hex bytes from `zcashd getrawtransaction`), feed it to
   `Transaction::read`, and identify which field consumed which
   bytes. Match each byte range against the layout in Section 2.2.
2. **Trace a sighash for a transparent spend.** For a v5 transaction
   with one transparent input, identify the call chain from
   `signature_hash` down to the BLAKE2b that produces the final
   32-byte digest. Cite the call sites in
   [`sighash.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs)
   and `sighash_v5.rs`.
3. **Modify and test (code change).** Add a unit test under
   `zcash_primitives/src/transaction/tests.rs` that builds a v5
   transaction with one Sapling output, then re-parses it and
   asserts that the wire bytes round-trip exactly. Then mutate one
   byte in `cmu` and confirm the round-trip mismatch.
4. **Walk the PCZT roles.** Open
   [`pczt/src/roles/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/roles)
   and write a one-sentence summary of the public entry function in
   each of `creator`, `constructor`, `prover`, `signer`, and
   `tx_extractor`. Cite the file and line of each entry.

### Answers in the code

- Version constants:
  [`components/zcash_protocol/src/constants.rs#L16-L44`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/constants.rs#L16-L44).
- Parser dispatch:
  [`zcash_primitives/src/transaction/mod.rs#L816-L830`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L816-L830).
- TxId root:
  [`zcash_primitives/src/transaction/txid.rs#L435-L452`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L435-L452).
- Sighash dispatch:
  [`zcash_primitives/src/transaction/sighash.rs#L45-L70`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs#L45-L70).
- Builder struct:
  [`zcash_primitives/src/transaction/builder.rs#L339-L359`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs#L339-L359).
- ZIP 317 constants:
  [`zcash_primitives/src/transaction/fees/zip317.rs#L15-L60`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees/zip317.rs#L15-L60).
- PCZT type:
  [`pczt/src/lib.rs#L60-L82`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/lib.rs#L60-L82).

## 7. Further reading

- [chapter 08](./08-note-encryption.md): how the OutputDescription
  ciphertexts are computed and decrypted.
- [chapter 10](./10-wallet-stack.md): how the proposal phase feeds
  into the builder.
- Hopwood, Bowe, Hornby, Wilcox.
  [Sapling protocol design notes](https://github.com/zcash/zips/blob/main/protocol/sapling.pdf):
  background on the binding signature design.
