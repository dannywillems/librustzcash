---
sidebar_position: 7
title: Transactions, sighash, builder, PCZT
description: "v4/v5/v6 layout, sighash trees, PCZT roles."
---

# 07 - Transactions, sighash, builder, PCZT

## Goal

Cover the wire format of a Zcash transaction, the sighash construction
(critical for the signature schemes to compose with the proofs
correctly), the high-level builder API, and the PCZT data flow.

The math is lighter than in chapters 04-05; the rigour is in the
**structure** of the digests. A subtle bug here breaks signatures or
proofs without any "loud" failure.

## 1. Transaction versions

The relevant versions:

- **v4**: Sapling-era. Has Sprout + Sapling + transparent bundles.
  Used until NU5. Sighash by ZIP 243.
- **v5**: NU5 onwards. Adds Orchard. Sighash by ZIP 244. Sprout removed.
- **v6**: NU7 (in development, behind `zcash_unstable = "nu7"`).
  Adds support for new components (e.g. ZIP 233 burn,
  asset issuance hooks).

Each version is uniquely identified by `(tx_version, version_group_id)`.
Defined in `components/zcash_protocol/src/constants.rs`:

<!-- CODE_REFERENCE: components/zcash_protocol/src/constants.rs#L16-L44 -->

```rust reference title="components/zcash_protocol/src/constants.rs"
https://github.com/zcash/librustzcash/blob/main/components/zcash_protocol/src/constants.rs#L16-L44
```

The parser at `zcash_primitives/src/transaction/mod.rs::Transaction::read`
switches on these constants. Adding a new version means: define
constants, add a `TxVersion` variant, implement `read`/`write`,
implement the new sighash code, plumb the new bundle types.

## 2. The v5 wire format (concrete)

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

(In v5 the anchor lives once at the bundle level, not per spend, since
all spends must use the same anchor.)

A Sapling OutputDescription:

```text
cv             : 32 bytes
cmu            : 32 bytes  (just the u-coordinate)
ephemeral_key  : 32 bytes
enc_ciphertext : 580 bytes
out_ciphertext : 80 bytes
zkproof        : 192 bytes
```

An Orchard Action:

```text
cv          : 32 bytes
nullifier   : 32 bytes
rk          : 32 bytes
cmx         : 32 bytes
ephemeral   : 32 bytes
enc_ciphertext : 580 bytes
out_ciphertext : 80 bytes
```

The proof and spend-auth sigs are *bundle-level* in Orchard.

You should be able to skim
`zcash_primitives/src/transaction/components/sapling.rs` and
`components/orchard.rs` and verify these layouts byte-for-byte.

## 3. The v5 TxId tree

The TxId of a v5 transaction is the root of a small BLAKE2b tree with
domain-separated nodes:

$$
\mathsf{txid} \;=\; \mathsf{BLAKE2b\text{-}256}\!\bigl(
  \text{pers}=\text{"ZcashTxHash\_"} \,\|\, C_{\text{branch}}; \;
  H_{\text{header}} \,\|\, H_{\text{transparent}} \,\|\, H_{\text{sapling}} \,\|\, H_{\text{orchard}}
\bigr),
$$

with each sub-digest using its own personalisation. The personalisation
is *exactly* 16 bytes (BLAKE2b uses 16-byte personalisations); when the
spec writes `"ZcashTxHash_"` it implies a $C_{\text{branch}}$
concatenation that produces a full 16-byte string with the branch ID
appended.

Reading `zcash_primitives/src/transaction/txid.rs`:

- `tx_data_digest_v5(tx)` computes the four sub-digests and the root.
- Each sub-digest has nested structure: e.g. $H_{\text{transparent}}$
  is itself a BLAKE2b of `prevouts_hash || sequence_hash || outputs_hash`
  with their own personalisations.
- For sapling, $H_{\text{sapling}}$ is a tree over spends, outputs, and
  the value balance.

The reason for this nesting: **sighash reuse**. When the sender hashes
"this transaction except for input $i$'s scriptSig" to compute a
sighash, they only need to recompute one sub-tree, not the whole
transaction. This makes signing $n$ inputs cost $O(n)$ instead of
$O(n^2)$.

## 4. Sighash construction (ZIP 244)

The **sighash** is what gets signed by transparent ECDSA inputs *and*
what Sapling spend-auth signatures and binding signatures both sign.

For v5 transactions, the sighash structure is the TxId tree with the
relevant *per-input* leaf replaced. Sighash types (`SIGHASH_ALL`,
`SIGHASH_SINGLE`, `SIGHASH_NONE`, optionally `SIGHASH_ANYONECANPAY`)
parameterise what is included.

For transparent inputs, the sighash adds an "input subdigest" leaf
that includes:

- The prevout being spent.
- The scriptPubKey being spent (taken from the previous transaction).
- The amount being spent.
- The current input's sequence.

This is the equivalent of Bitcoin's BIP-143 segwit sighash, generalised.

For shielded signatures, `SIGHASH_ALL` is the only valid value; the
spend-auth sig signs the sighash directly, and the binding sig signs
the sighash using its implicit verification key.

Read in code:

- `zcash_primitives/src/transaction/sighash.rs`: dispatch by version.
- `sighash_v4.rs`: ZIP 243 (v4 Sapling).
- `sighash_v5.rs`: ZIP 244 (v5 Orchard).
- `sighash_v6.rs`: NU7 in-flight.

## 5. The builder

`zcash_primitives::transaction::builder::Builder` orchestrates the
construction of a transaction. The public API is something like:

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
   from external crates), which know how to do the per-pool dance
   (sample randomness, compute commitments, prepare circuits).
2. The high-level builder computes the **signature hash** in a
   pre-signature form (with placeholder signatures of zero) to compute
   the digests needed for proofs.
3. The Sapling and Orchard provers run, producing proofs.
4. Transparent and shielded signatures are computed.
5. The bundle is "authorised" - its `Authorization` type parameter
   transitions from `Unauthorized` to `Authorized`.

The authorisation typestate is described in `AGENTS.md`; conceptually:

```text
sapling::Bundle<Unauthorized, V>
    --[ apply prover ]-->
sapling::Bundle<InProgress<Proven, Unsigned>, V>
    --[ apply signer ]-->
sapling::Bundle<Authorized, V>
```

You will see `MapAuth` trait implementations everywhere; that is the
machinery that walks a bundle and converts each authorisation slot from
one type to another, with the type system enforcing that you cannot
skip a step.

## 6. Fees

Fee strategies live in `zcash_primitives/src/transaction/fees.rs` and
`zcash_client_backend/src/fees/`.

ZIP 317 specifies the default since NU5:

$$
\text{fee} = 0.00001 \, \text{ZEC} \times \max\!\bigl(
2, \; n_{\text{logical}}\bigr),
$$

where $n_{\text{logical}}$ is a **logical action count** that combines
transparent and shielded components with specific weights:

$$
n_{\text{logical}} \;=\; \max\!\bigl(n_{\text{vin}},\, n_{\text{vout}}\bigr) + 2 \cdot \max\!\bigl(n_{\text{sapling\_spends}} + n_{\text{sapling\_outputs}},\, n_{\text{orchard\_actions}}\bigr).
$$

(The exact formula is in ZIP 317; this is the spirit.) The strategy
trait is `FeeRule`; implementations include `zip317::FeeRule` and the
"standard" fee rule used by the wallet.

## 7. PCZT (Partially Constructed Zcash Transaction)

PCZT generalises Bitcoin's PSBT to Zcash. The `pczt` crate defines:

- A `Pczt` type that holds *all* of the data needed to construct a
  transaction across roles, with per-role typestate.
- Role modules under `pczt/src/roles/`: `creator`, `constructor`,
  `io_finalizer`, `prover`, `signer`, `spend_finalizer`,
  `redactor`, `tx_extractor`, `combiner`, `verifier`,
  `updater`.

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

Each role only mutates the slots it owns. The crate uses serde-derived
serialisation, which is one of the **few** explicitly approved uses of
serde in the workspace (per `AGENTS.md`).

The motivation: split the **prover** from the **signer**. Proving is
CPU-bound but does not require secret keys; signing is fast but does
require them. A hardware wallet wants to sign without proving.

## 8. From wallet to wire

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

A wallet that handles both single-key and hardware-signer setups should
prefer the PCZT pipeline even for the single-key case, just for
uniformity. That is one of the architectural directions of the
codebase.

## 9. Auxiliary digests: TxId vs Authorizing Data Hash

A v5 transaction has *two* digests:

- **TxId**: the root of the digest tree over *non-authorising* data
  (commitments, anchors, value balances, proofs). It is consensus-
  invariant: malleating signatures does not change the TxId.
- **Authorizing data hash**: a hash of the signatures and proofs. The
  block header's commitment combines both.

This separation is what makes Zcash transactions
**non-malleable** without segwit-style witness rollup: the TxId itself
does not depend on signatures, so signature malleability cannot change
the TxId.

For deposit detection and wallet bookkeeping, always use the TxId. For
mempool/pool deduplication and propagation, the wtxid-like
"authorising hash" matters.

## 10. Things that bite

- **BranchId vs version**: a transaction is bound to a branch. Using
  the wrong branch makes the sighash wrong, which silently produces
  invalid signatures.
- **Anchor age**: anchors must come from blocks at least 10 deep;
  using a too-recent anchor causes rejection.
- **Expiry height**: 0 means "no expiry" but most wallets set it to
  current height + 40 or so.
- **Dummy spends/outputs**: shielded bundles can contain dummy spends
  (zero-value, with circuit-allowed special-case path) to obscure
  the true count of inputs. The builder generates dummies if needed
  to meet a minimum.
- **Sapling value balance** sign: negative when more value flows out
  of Sapling, positive when more flows in. Track the convention; off
  by one sign is a common bug.

## What you should know after this chapter

- v4 vs v5 wire layout and how to parse them.
- The TxId tree shape and why sub-digests are domain-separated.
- The sighash flow for transparent vs shielded inputs.
- The Builder typestate and `MapAuth`.
- The PCZT roles and what each does.
- ZIP 317 fee math at a high level.

Next: the **note encryption** scheme, which we have referenced many
times.
