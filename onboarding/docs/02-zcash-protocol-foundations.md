---
sidebar_position: 2
title: Zcash protocol foundations
description: "Consensus, value pools, network upgrades, transaction shape."
---

# 02 - Zcash protocol foundations

## Goal

Before any cryptography, you need a working model of what a Zcash node and
wallet do. This chapter introduces consensus, the transaction model, value
pools, and network upgrades. The pace is brisk but the math is light;
chapters 03-05 fill in the cryptographic content.

## What Zcash is, in one paragraph

Zcash is a UTXO-style cryptocurrency descended from Bitcoin. It extends the
transparent UTXO model with **shielded value pools** in which transaction
inputs and outputs are commitments instead of plaintext addresses and
amounts. Every shielded transaction is accompanied by a **zero-knowledge
proof** that the inputs are unspent, the outputs are well-formed, and the
input value equals the output value (modulo public flows between pools).
The set of unspent shielded outputs is represented as commitments in an
**incremental Merkle tree**, and spends are proved by demonstrating
knowledge of a tree path without revealing which one.

## The four value pools

A Zcash transaction can move value between four pools:

| Pool | Mechanism | Active since |
| --- | --- | --- |
| Transparent | Bitcoin-style UTXOs | Genesis |
| Sprout | Original Zerocash, BCTV14 SNARKs, Groth16 after Sapling | Genesis |
| Sapling | Jubjub + BLS12-381 + Groth16 | Sapling NU (Oct 2018) |
| Orchard | Pallas/Vesta + Halo 2 | NU5 (May 2022) |

Sprout has been disabled for new outputs since NU5 (Sprout-to-anything is
allowed, but nothing can be sent into Sprout). Sapling and Orchard coexist
and are the active shielded pools.

Each transaction carries an explicit signed balance:

$$
v_{\text{balance}} \;=\; v_{\text{transparent}}^{\text{in}}
\;+\; v_{\text{sprout}}^{\text{in}} \;+\; v_{\text{sapling}}^{\text{in}}
\;+\; v_{\text{orchard}}^{\text{in}}
\;-\; (\text{all outputs}),
$$

and consensus requires $v_{\text{balance}} \geq 0$, with the surplus going
to the miner as a fee. The per-pool balances $v_{\text{sapling}}^{\text{balance}}$
and $v_{\text{orchard}}^{\text{balance}}$ are public scalars announced in
the transaction header and constrained both by ZK proofs (inside the bundle)
and by binding signatures (so that the published balance matches the
implicit balance inside the proofs). See chapter 04 for the math.

The unit of value is the **zatoshi**: $1 \text{ ZEC} = 10^8 \text{ zatoshi}$.
In the code this is `Zatoshis` (unsigned) and `ZatBalance` (signed) in
`components/zcash_protocol/src/value.rs`. Use these newtypes; never raw
integers.

## Anatomy of a transaction (high level)

A v5 Zcash transaction (since NU5) carries:

1. **Header**: version (5), version group ID, consensus branch ID,
   lock time, expiry height.
2. **Transparent bundle**: vector of `TxIn` (each a `(prevout, scriptSig,
   sequence)`) and vector of `TxOut` (each a `(value, scriptPubKey)`).
   Bitcoin-style.
3. **Sapling bundle**: a vector of **Spend descriptions**, a vector of
   **Output descriptions**, a value-balance scalar
   $v_{\text{sapling}}^{\text{balance}}$, and a **binding signature**.
4. **Orchard bundle**: a vector of **Action descriptions**, a value-balance
   $v_{\text{orchard}}^{\text{balance}}$, flags, an anchor, a proof, and a
   binding signature. Each Action description bundles one spend and one
   output. Output-only and spend-only Actions use dummy notes.

The Sprout bundle is empty in practice for new transactions but the format
still permits up to one `JsDescription` (JoinSplit description). v4 also
exists and is still used for some Sapling-only transactions.

Read this in the code:

- `zcash_primitives/src/transaction/mod.rs` defines `TxVersion`,
  `TransactionData`, `Authorization`, etc.
- `zcash_primitives/src/transaction/components/sapling.rs` and
  `.../components/orchard.rs` define the serialization formats.
- `zcash_transparent/src/bundle.rs` defines the transparent bundle.

## TxId is not a hash of the wire bytes

A subtle but critical point. Since v5, the **TxId** is the root of a
small BLAKE2b tree of personalised digests, not a hash of the serialized
bytes. Concretely (paraphrasing
`zcash_primitives/src/transaction/txid.rs`):

$$
\mathsf{txid} \;=\; \mathsf{BLAKE2b\text{-}256}\bigl(
\text{ZcashTxHash\_}\| C_{\text{branch}};
H_{\text{header}} \| H_{\text{transparent}} \| H_{\text{sapling}} \| H_{\text{orchard}}
\bigr),
$$

where each sub-digest $H_{\bullet}$ is itself a BLAKE2b hash with a domain
separator personalisation tag (`ZTxIdHeadersHash`, `ZTxIdTranspaHash`,
`ZTxIdSaplingHash`, `ZTxIdOrchardHash`). The personalisation includes the
**consensus branch ID** so that the same wire bytes have different TxIds in
different network upgrades, which makes replay-across-forks impossible.

The motivation: this tree shape allows constructing the **sighash** as the
TxId tree with one sub-leaf replaced by a per-input commitment, which is
much cheaper than recomputing a flat hash. Sighash design is ZIP 244.

Reference: ZIP 244 https://zips.z.cash/zip-0244.

## Network upgrades and BranchId

Zcash mutates by **network upgrades** (NU). Each NU is identified by a
`BranchId` (a 32-bit constant) and an activation height. The canonical
types live in `components/zcash_protocol/src/consensus.rs`:

<!-- CODE_REFERENCE: components/zcash_protocol/src/consensus.rs#L18-L20 -->

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/main/components/zcash_protocol/src/consensus.rs#L18-L20
```

<!-- CODE_REFERENCE: components/zcash_protocol/src/consensus.rs#L568-L614 -->

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/main/components/zcash_protocol/src/consensus.rs#L568-L614
```

<!-- CODE_REFERENCE: components/zcash_protocol/src/consensus.rs#L701-L728 -->

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/main/components/zcash_protocol/src/consensus.rs#L701-L728
```

Almost every consensus rule is parameterised by `BranchId`. Sighash code
forks on it. Block-header commitment rules fork on it. When you read
`zcash_primitives::transaction::sighash_v4` versus `..._v5` versus
`..._v6`, the branch ID is the discriminator. The match arms in
`Transaction::read` route to different parsers based on `(version,
version_group_id)`, which encode the branch.

A `BranchId` is computed from a string label hashed in a standardised way;
the values are encoded in
`components/zcash_protocol/src/consensus.rs`. Test vectors in
`zcash_primitives/src/transaction/tests/` exercise every supported
branch.

## Anchors and Merkle trees

The set of unspent shielded outputs is **not** a UTXO set in the
transparent sense. It is the set of commitments included in a global
**note commitment tree** (one per shielded pool). The Sapling tree has
depth 32, the Orchard tree has depth 32, the Sprout tree has depth 29.

A Spend in a shielded transaction does not point to a specific commitment;
it points to an **anchor**, which is the root of the commitment tree as of
some past block (the wallet may choose any sufficiently recent root). The
ZK proof certifies that there exists a leaf in the tree whose path leads
to that anchor and whose spending key is known.

This decoupling between *which note is spent* and *which anchor is used* is
what gives Zcash strong unlinkability: two spends of the same note from
different anchors look identical to an outside observer (because of
**nullifiers**, see below).

The Merkle tree itself is computed using protocol-specific hashes:

- Sprout: SHA-256.
- Sapling: a **Pedersen hash** over Jubjub (chapter 04 for the math).
- Orchard: **Sinsemilla**, a Pedersen-hash variant tuned for in-circuit
  cost over Pallas (chapter 05).

The incremental Merkle tree library lives in `incrementalmerkletree` (a
separate crate). The wallet uses `shardtree` for efficient checkpointed
state.

## Nullifiers and double-spend prevention

Spending a shielded note produces a **nullifier** $\mathsf{nf}$ that is
revealed in the transaction. The mapping note $\to$ nullifier is
deterministic in the note and the spending key, but a third-party observer
cannot link them. Two valid spends of the same note would produce the same
nullifier, so consensus simply requires that no nullifier appear twice.

Concretely (Sapling):

$$
\mathsf{nf} \;=\; \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}\!\bigl(\rho\bigr),
$$

where $\mathsf{nk}$ is the **nullifier deriving key** derived from the
spending key, and $\rho$ is a unique per-note value derived from the
commitment position. Orchard is similar but uses a Poseidon-based PRF.

The nullifier set is the only consensus-significant state derived from
shielded spends. Wallets that track their own spending only need to
remember which of their nullifiers have appeared on-chain to know which
notes are spent.

## How a wallet "sees" its money

Because outputs are commitments and recipients are not directly tagged,
wallets must **trial-decrypt** every shielded output to find the ones
addressed to them. The note encryption scheme (chapter 08) is designed so
that trial decryption is fast and only succeeds for the intended
recipient.

This is what `zcash_client_backend`'s scanning code does. For each block,
for each shielded output, the wallet attempts decryption with each of its
incoming viewing keys. On success it has the cleartext note (value,
recipient diversifier, $\rho$, randomness), which it can use to construct
a spend later.

## The PCZT abstraction

Constructing a shielded transaction requires combining several
capabilities that may live in different trust domains:

- **Knowledge of the spending keys** (signs).
- **Knowledge of the random secrets and proving parameters** (proves).
- **A reliable view of the chain** (selects anchors, picks notes).
- **A user-facing UI** (specifies recipient, amount, memo).

The `pczt` crate generalises Bitcoin's PSBT to Zcash. It defines a
**partially constructed transaction** that goes through roles:

1. **Creator** - decides version, branch, expiry.
2. **Constructor** - adds inputs/outputs without proofs/signatures.
3. **IO Finalizer** - finalises the input/output set.
4. **Prover** - computes zk-proofs for shielded components.
5. **Signer** - signs transparent inputs and spend-authorising
   signatures.
6. **Spend Authoriser** - actually performs spend-authorisation for
   shielded inputs (separate from Signer because of re-randomisation).
7. **Combiner** - merges parallel PCZTs.
8. **Transaction Extractor** - emits the final wire format.

The reason for this baroque design: hardware wallets, threshold signing,
air-gapped signers, multi-party computation. Each role only needs its own
slice of the data.

## Consensus rules from a wallet's point of view

`librustzcash` does not enforce consensus, but several consensus rules
affect what a wallet must construct correctly:

- **Transaction fee**: positive integer in zatoshis (post-ZIP 317 the
  default fee is $0.00005 \text{ ZEC}$ plus per-action increments). See
  ZIP 317 and `zcash_primitives/src/transaction/fees.rs`.
- **Expiry height**: a transaction is invalid after this block height.
- **Coinbase rules**: coinbase outputs must be either transparent (with
  certain restrictions on which addresses can receive miner pays) or
  shielded.
- **Anchor depth**: anchors must be from blocks of a certain minimum
  depth on the chain (currently 10 blocks for Sapling/Orchard).
- **Output uniqueness**: per-pool nullifiers cannot be reused.
- **Banded value balance**: the `value_balance` scalar published in the
  transaction must equal the implicit balance inside the proofs.

A wallet that emits transactions failing these rules will produce
unspendable garbage that a node will reject.

## What you should know after this chapter

- That a Zcash transaction is a tuple of header + four bundles (one per
  pool) plus a TxId tree.
- That value moves through pools subject to a public balance equation.
- That shielded spends prove membership in a commitment tree and reveal a
  nullifier.
- That network upgrades are routed via `BranchId`, which everything
  consensus-relevant is parameterised on.
- Why PCZT exists.

The next chapter introduces the mathematical machinery you need before
reading the Sapling and Orchard chapters.
