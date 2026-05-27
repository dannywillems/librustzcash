---
sidebar_position: 2
title: Zcash protocol foundations
description: "Consensus, value pools, network upgrades, transaction shape."
---

# 02 - Zcash protocol foundations

## 1. Why this chapter exists

Before any cryptography, a reader needs a working model of what a
Zcash node and wallet actually do: where value lives, how the
transaction format is structured, what a "network upgrade" implies
for parser dispatch, and how the four value pools relate. Without
this model, the type `Transaction` in
[`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs)
is just an opaque tag-union. By the end of this chapter you will be
able to map every field of that struct onto a consensus rule and
explain why
[`txid.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs)
does not hash the wire bytes directly.

## 2. Definitions

**Definition (UTXO).** An unspent transaction output. In Zcash the
transparent pool inherits Bitcoin's UTXO model verbatim: an output
is an amount plus a `scriptPubKey`, and an input references an
earlier output by `(txid, vout)`.

**Definition (shielded value pool).** A pool in which outputs are
cryptographic *commitments* rather than plaintext addresses and
amounts. Membership is tested through a Merkle inclusion proof
against a per-pool *note commitment tree*; spending is proven in
zero knowledge.

**Definition (zatoshi).** The base unit of Zcash value:
$1\ \text{ZEC} = 10^{8}\ \text{zatoshi}$. The total supply ceiling
is $21\,000\,000 \cdot 10^{8}$ zatoshi
([`MAX_MONEY`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/value.rs#L13-L14)).

**Definition (network upgrade).** A change to consensus rules
identified by a `BranchId` (a 32-bit constant) and an activation
height. The `BranchId` value is hashed into every sighash and TxId,
so the same wire bytes produce different identifiers under different
network upgrades. This is two-way replay protection (ZIP 200).

**Definition (anchor).** A historical root of a note-commitment
tree. A shielded spend references an anchor instead of a specific
output; the zero-knowledge proof certifies that *some* note in the
tree with that root is being spent without disclosing which one.

**Definition (nullifier).** A deterministic, per-note tag revealed
on spend. The mapping note $\to$ nullifier is a PRF keyed by the
spending key, so an outside observer cannot link the two; consensus
rejects any duplicate nullifier.

**Invariant (transaction balance).** A Zcash transaction is valid
only if

$$
v_{\text{transparent}}^{\text{in}}
\;+\; v_{\text{sprout}}^{\text{in}}
\;+\; v_{\text{sapling}}^{\text{in}}
\;+\; v_{\text{orchard}}^{\text{in}}
\;-\; \sum (\text{all outputs}) \;\geq\; 0,
$$

with the surplus going to the miner as a fee. Per-pool balances
$v_{\text{sapling}}^{\text{balance}}$ and
$v_{\text{orchard}}^{\text{balance}}$ are public scalars in the
transaction header and are enforced both by ZK proofs (inside the
bundle) and by binding signatures (so that the published balance
matches the implicit balance inside the proofs). Chapter 04 derives
the math.

**Definition (TxId).** The transaction identifier. Since v5 (NU5)
it is the root of a small BLAKE2b tree of personalised digests, not
a flat hash of the serialised bytes. See Section 3.3.

## 3. The code

### 3.1 The four value pools

| Pool | Mechanism | Active since |
| --- | --- | --- |
| Transparent | Bitcoin-style UTXOs | Genesis |
| Sprout | Original Zerocash, BCTV14 SNARKs, Groth16 after Sapling | Genesis |
| Sapling | Jubjub + BLS12-381 + Groth16 | Sapling NU (Oct 2018) |
| Orchard | Pallas / Vesta + Halo 2 | NU5 (May 2022) |

Sprout has been disabled for new outputs since NU5: Sprout-to-any
is allowed, but nothing can be sent into Sprout. Sapling and Orchard
coexist and are the active shielded pools.

### 3.2 The transaction shape

A v5 Zcash transaction carries:

1. **Header**: version (5), version group ID, consensus branch ID,
   lock time, expiry height.
2. **Transparent bundle**: vector of `TxIn` (each a
   `(prevout, scriptSig, sequence)`) and vector of `TxOut` (each a
   `(value, scriptPubKey)`). Bitcoin-style.
3. **Sapling bundle**: vector of **Spend descriptions**, vector of
   **Output descriptions**, a value-balance scalar
   $v_{\text{sapling}}^{\text{balance}}$, and a **binding
   signature**.
4. **Orchard bundle**: vector of **Action descriptions**, a
   value-balance $v_{\text{orchard}}^{\text{balance}}$, flags,
   anchor, proof, and binding signature. Each Action description
   bundles one spend and one output; output-only and spend-only
   Actions use dummy notes.

The Sprout bundle is empty in practice for new transactions but the
format still permits up to one `JsDescription` (JoinSplit
description). v4 also exists and is still used for some
Sapling-only transactions.

Where this lives in the code:

- [`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs)
  defines `TxVersion`, `TransactionData`, and the `Authorization`
  trait family.
- [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs)
  defines the Sapling serialization format and the v4/v5 split:

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L168-L189
```

- [`zcash_primitives/src/transaction/components/orchard.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/orchard.rs)
  is the analogous file for Orchard.
- [`zcash_transparent/src/bundle.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/bundle.rs)
  defines the transparent bundle.

### 3.3 TxId is not a hash of the wire bytes

The TxId is computed by
[`to_txid`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L435-L452)
from per-bundle BLAKE2b sub-digests:

```rust reference title="zcash_primitives/src/transaction/txid.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L33-L40
```

```rust reference title="zcash_primitives/src/transaction/txid.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L435-L452
```

Concretely:

$$
\mathsf{txid} \;=\; \mathsf{BLAKE2b\text{-}256}\bigl(
\text{ZcashTxHash\_} \mathbin{\|} C_{\text{branch}};\;
H_{\text{header}} \mathbin{\|} H_{\text{transparent}}
\mathbin{\|} H_{\text{sapling}} \mathbin{\|} H_{\text{orchard}}
\bigr),
$$

where each sub-digest $H_{\bullet}$ is itself a BLAKE2b hash with a
domain-separator personalisation
(`ZTxIdHeadersHash`, `ZTxIdTranspaHash`, `ZTxIdSaplingHash`,
`ZTxIdOrchardHash`). The personalisation includes the consensus
branch ID, so the same wire bytes have different TxIds in different
network upgrades.

The motivation is twofold:

1. Replay protection across forks.
2. Cheap sighashes: a sighash is computed by replacing one sub-leaf
   of the TxId tree with a per-input commitment, far cheaper than
   recomputing a flat hash. See ZIP 244.

### 3.4 Network upgrades and `BranchId`

The canonical types live in
[`components/zcash_protocol/src/consensus.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs):

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L568-L614
```

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L701-L728
```

Almost every consensus rule is parameterised by `BranchId`. Sighash
code forks on it. Block-header commitment rules fork on it. When you
read
[`sighash_v4`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v4.rs)
versus
[`sighash_v5`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v5.rs),
the branch ID is the discriminator. The match arms in
`Transaction::read` route to different parsers based on
`(version, version_group_id)`, which encode the branch.

### 3.5 Anchors, Merkle trees, nullifiers

The set of unspent shielded outputs is **not** a UTXO set in the
transparent sense. It is the set of commitments included in a
global note-commitment tree (one per shielded pool):

- Sprout tree: depth 29, SHA-256 hashes.
- Sapling tree: depth 32, Pedersen-hash over Jubjub (chapter 04).
- Orchard tree: depth 32, Sinsemilla over Pallas (chapter 05).

A Spend in a shielded transaction does not point to a specific
commitment; it points to an *anchor*, the root of the commitment
tree as of some past block. The ZK proof certifies that there
exists a leaf in the tree whose path leads to that anchor and whose
spending key is known.

Spending a shielded note produces a nullifier $\mathsf{nf}$ that is
revealed in the transaction. The mapping note $\to$ nullifier is
deterministic in the note and the spending key, but a third party
cannot link them. Two valid spends of the same note would produce
the same nullifier, so consensus simply requires that no nullifier
appears twice.

Concretely, for Sapling:

$$
\mathsf{nf} \;=\; \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}\!\bigl(\rho\bigr),
$$

where $\mathsf{nk}$ is the *nullifier-deriving key* derived from
the spending key and $\rho$ is a unique per-note value derived from
the commitment position. Orchard is similar but uses a
Poseidon-based PRF.

The incremental Merkle tree library lives in
[`incrementalmerkletree`](https://github.com/zcash/incrementalmerkletree)
(a separate crate). The wallet uses
[`shardtree`](https://github.com/zcash/incrementalmerkletree)
for efficient checkpointed state.

### 3.6 How a wallet "sees" its money

Because outputs are commitments and recipients are not directly
tagged, wallets must *trial-decrypt* every shielded output to find
the ones addressed to them. The note encryption scheme (chapter 08)
is designed so that trial decryption is fast and only succeeds for
the intended recipient.

`zcash_client_backend::scanning` is the loop that does this. For
each block, for each shielded output, the wallet attempts
decryption with each of its incoming viewing keys. On success it
has the cleartext note (value, recipient diversifier, $\rho$,
randomness), which it can use to construct a spend later.

### 3.7 PCZT in one paragraph

Constructing a shielded transaction combines capabilities that may
live in different trust domains: key custody, proving parameters,
chain view, and the user-facing UI. The
[`pczt`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt)
crate generalises Bitcoin's PSBT to Zcash. A partially constructed
transaction flows through roles: Creator, Constructor, IO
Finalizer, Prover, Signer, Spend Authoriser, Combiner, Transaction
Extractor. Each role only needs its own slice of the data; this is
why hardware wallets, threshold signing, air-gapped signers, and
MPC are all supported.

## 4. Failure modes

A contributor changing transaction parsing or sighash code without
understanding the layering can produce subtle, hard-to-catch bugs:

- **Wrong `BranchId` routing.** Treating a v5 transaction with the
  Sapling `BranchId` as if it were under NU5 leads to silently
  wrong sighashes; signatures verify nowhere and transactions get
  rejected after broadcast. The test vectors in
  [`zcash_primitives/src/transaction/tests.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/tests.rs)
  exercise every supported branch; run them before touching
  `Transaction::read` or `to_txid`.
- **Flat-hash TxId.** Re-introducing a hash of the wire bytes
  removes the personalisation-based replay protection. ZIP 244 is
  the law here; the TxId tree is not a refactoring opportunity.
- **Mismatched value-balance signs.** `v_balance` is signed; the
  sign convention is "input minus output". Builders that flip the
  sign produce bundles that pass internal checks but fail the
  binding signature at the consensus node. See
  [`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs)
  for the canonical sign handling, and the historical Sprout
  counterfeiting bug
  ([CVE-2019-7167](https://nvd.nist.gov/vuln/detail/CVE-2019-7167))
  documented in
  [chapter 12](./12-historical-bugs.md) for the most expensive
  consequence of getting balance math wrong.
- **Anchor staleness.** The wallet must pick a recent-enough anchor
  (currently 10 blocks deep for Sapling/Orchard) but not so recent
  that a reorg can invalidate it. Tests in
  [`zcash_client_backend/src/data_api`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api)
  cover the boundary.

## 5. Spec pointers

- [ZIP 200](https://zips.z.cash/zip-0200): network upgrade
  mechanism, definition of `BranchId`, two-way replay protection.
- [ZIP 225](https://zips.z.cash/zip-0225): the v5 transaction
  format introduced at NU5.
- [ZIP 244](https://zips.z.cash/zip-0244): the TxId / sighash tree
  whose layout
  [`txid.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs)
  implements. Read it before changing any sub-digest.
- [ZIP 317](https://zips.z.cash/zip-0317): the fee algorithm. The
  default fee is $0.00005\ \text{ZEC}$ plus per-action increments;
  see
  [`zcash_primitives/src/transaction/fees.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs).
- [Zcash Protocol Specification, sections 3 and 4](https://zips.z.cash/protocol/protocol.pdf):
  abstract protocol covering transactions, blocks, value pools,
  trees, and nullifiers; the source from which `zcash_protocol` and
  `zcash_primitives` are derived.

## 6. Exercises

1. **Identify the parser dispatch.** Read `Transaction::read` in
   [`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs)
   and list every `(version, version_group_id)` pair the function
   accepts. State which `BranchId` each maps to.
2. **Trace a sighash.** Pick `signature_hash` in
   [`zcash_primitives/src/transaction/sighash.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs)
   and follow the call chain until you reach the BLAKE2b
   personalisation constant used. Confirm that swapping the
   constant changes the sighash but not the wire format.
3. **Modify and test.** In a checkout, add a new debug-only
   `print!` statement at the top of `to_txid` that logs the
   incoming `consensus_branch_id`. Run
   `cargo test -p zcash_primitives txid` and confirm at least one
   test vector exercises a non-default branch. Remove the print
   before committing.

### Answers in the code

- TxId construction:
  [`zcash_primitives/src/transaction/txid.rs#L435-L452`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L435-L452).
- Sighash dispatch by version:
  [`zcash_primitives/src/transaction/sighash.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash.rs).
- `BranchId` enum:
  [`components/zcash_protocol/src/consensus.rs#L701-L728`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L701-L728).

## 7. Further reading

- [chapter 07](./07-transactions-and-builder.md): the builder API
  and how it wires together every bundle.
- [chapter 12](./12-historical-bugs.md): the Sprout
  counterfeiting CVE, dummy-note misuse, and Sapling InternalH;
  each is a real example of how getting Section 4 wrong cost
  real money.
