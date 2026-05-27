---
sidebar_position: 9
title: Equihash and consensus rules
description: "Generalised birthday, history tree, PoW math, wallet-side consensus."
---

# 09 - Equihash and consensus structures

## 1. Why this chapter exists

Wallets and node implementations need to agree on the same view of
the chain, even when the wallet does not personally verify proof of
work. The non-shielded but consensus-significant cryptographic
structures live in two small crates:
[`components/equihash/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash)
implements the proof-of-work verifier, and
[`zcash_history/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_history)
implements the ZIP 221 MMR tree. A contributor who plans to bump the
codebase across a network upgrade (NU) must understand both. By the
end of this chapter you will be able to explain why the Generalised
Birthday Problem chooses the Equihash $(n, k)$ parameters, identify
the entry point `is_valid_solution` in
[`components/equihash/src/verify.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/verify.rs),
and locate the history-tree append path in
[`zcash_history/src/tree.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_history/src/tree.rs).

## 2. Definitions

### 2.1 Generalised Birthday Problem

**Definition (GBP).** Given $f \colon \{0,1\}^* \to \{0,1\}^n$ and
a parameter $k$, find $2^k$ distinct inputs $X_1, \ldots, X_{2^k}$
with

$$
f(X_1) \;\oplus\; f(X_2) \;\oplus\; \cdots \;\oplus\; f(X_{2^k}) \;=\; 0.
$$

**Lemma (Wagner's algorithm).** The best known algorithm builds $k$
collision lists pairwise and runs in time and memory

$$
T \;\approx\; \frac{2^{n/(k+1)}}{k+1}, \qquad
M \;\approx\; 2^{n/(k+1)}.
$$

Memory is the limiting factor. Equihash chooses $(n, k)$ so the
memory is in the gigabyte range, making custom ASICs less profitable
than general-purpose memory-bandwidth hardware.

### 2.2 Zcash Equihash parameters

**Definition (parameters).** Mainnet uses $(n, k) = (200, 9)$, so a
solution is a set of $2^9 = 512$ distinct 32-bit indices. Testnet
uses $(n, k) = (96, 5)$: much smaller, faster to test.

**Definition (the hash function $f$).** Built from BLAKE2b with
personalisation `"ZcashPoW"`,

$$
f(I, V, i) \;=\; \text{first } n \text{ bits of }
\mathsf{BLAKE2b}_{\,n_{\text{BLAKE}}}\!\bigl(
\text{pers}=\text{"ZcashPoW"} \mathbin{\|} n_{\text{LE}}
\mathbin{\|} k_{\text{LE}};\;
I \mathbin{\|} V \mathbin{\|} i_{\text{LE}}
\bigr),
$$

where $I$ is the block header up to the nonce, $V$ is the 32-byte
nonce, and $i$ is a 32-bit index.

**Invariant (solution constraints).** A 512-index Wagner-style
solution must satisfy:

1. All 512 indices are distinct.
2. The Wagner pairing structure is encoded in the solution order
   (in pairs, then in pairs-of-pairs, etc., for $k$ levels).
3. At each level $\ell$, the two halves of a pair must satisfy a
   collision condition on a specific 20-bit segment of $f$: the
   leading $\ell \cdot (n/(k+1))$ bits should match exactly (so the
   XOR has them cancel).
4. At each level the left half has the smaller minimum index,
   forcing a canonical ordering and preventing permutations of an
   existing solution into a different one.

### 2.3 Merkle Mountain Range

**Definition (MMR).** A Merkle tree variant that supports efficient
append: adding a leaf creates one new leaf plus at most
$O(\log n)$ new internal nodes. The "mountain range" is the picture
of a sequence of perfect Merkle trees of decreasing height that get
merged as more leaves arrive.

**Lemma (MMR shape).** At $n$ leaves the MMR has $n +
\mathsf{popcount}(n) - 1$ total nodes; the "peaks" are the roots of
the perfect subtrees, one per set bit of $n$. The root of the MMR
is a hash of the peaks combined.

### 2.4 Zcash history-tree leaf

**Definition (per-leaf data, ZIP 221).** For each block:

- The block hash.
- The Sapling commitment-tree root at the block.
- The Orchard commitment-tree root at the block.
- The block's cumulative chain-work.
- Reserved fields for future upgrades.

The hash function combining leaves is BLAKE2b with a
per-network-upgrade personalisation; the tree forks at NU
boundaries.

### 2.5 Block-header commitments (NU5)

**Definition.** Since NU5 the block-header field
`hashBlockCommitments` is

$$
\mathsf{hashBlockCommitments}
=
\mathsf{BLAKE2b}\!\bigl(
\text{pers},\,
\mathsf{hashChainHistory} \mathbin{\|}
\mathsf{hashAuthDataRoot} \mathbin{\|}
\mathsf{hashFinalSaplingRoot}
\bigr).
$$

The chain-history hash binds the MMR root; the auth-data root binds
the per-transaction authorising data; the final Sapling root binds
the per-block Sapling commitment-tree state.

### 2.6 Difficulty adjustment

**Definition.** Zcash uses a Dark Gravity Wave (DGW)-style
retargeting algorithm: the target adjusts based on the average
block time over the last 17 blocks plus a moving exponential
window. The target is encoded as `nBits` in the block header in
compact form. Expected block interval since Blossom is 75 seconds.
This is implemented in the node, not in `librustzcash`.

## 3. The code

### 3.1 Equihash verification

The public entry point is `is_valid_solution`:

```rust reference title="components/equihash/src/verify.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/verify.rs#L241-L255
```

It calls `is_valid_solution_recursive`, which initialises a BLAKE2b
state with the input and nonce, then validates the Wagner pairing
tree:

```rust reference title="components/equihash/src/verify.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/verify.rs#L221-L239
```

Verification is $\sim 500$ BLAKE2b's worth of work. Finding a
solution requires gigabytes of memory and minutes; verifying takes
milliseconds.

### 3.2 Minimal encoding

The solution is encoded as a packed bit-string of the 512 21-bit
indices, so $512 \times 21 = 10752$ bits $= 1344$ bytes. The
"minimal encoding" lives in
[`components/equihash/src/minimal.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/minimal.rs).
The verifier calls `indices_from_minimal` to unpack the encoded
bytes into the 512 `u32` indices, then validates them.

### 3.3 Why care, for librustzcash purposes?

You will not implement an Equihash solver in this workspace (the
`tromp` solver is for testing and is feature-gated). You will use
the verifier to validate block headers if you ever need
consensus-adjacent checks. Wallets do not verify PoW directly; they
trust the node.

### 3.4 The history tree (ZIP 221)

The history tree is a Merkle Mountain Range committed to in every
block header since Heartwood. The `zcash_history` crate provides
append and proof verification. The core `Tree` type:

```rust reference title="zcash_history/src/tree.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_history/src/tree.rs#L138-L165
```

`append_leaf` is what every block adds to the tree. It returns the
new node links (peaks may merge), and the new MMR root is
`Tree::root`. The per-leaf node data lives in
[`zcash_history/src/node_data.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_history/src/node_data.rs);
the leaf fields are versioned via the `Version` trait, with `V1`
(Heartwood) and `V2` (Canopy+) variants.

The wallet does not normally use this; full nodes (Zebra, `zcashd`)
do. We mention it because adding new fields to the history tree
(which has happened at most network upgrades) requires touching
this crate.

### 3.5 Consensus rules a wallet must respect

We listed these in chapter 02; the consolidated list:

1. Anchors must be at least 10 blocks deep (after Sapling/Orchard
   activation; specifically `MIN_CONFIRMATIONS = 10`).
2. `expiry_height` must be in the future or zero.
3. The transaction fee must be positive and at least the ZIP 317
   minimum (10,000 zatoshi).
4. The value balance equation must hold:
   $\sum v_{\text{in}} = \sum v_{\text{out}} + \text{fee}$, with
   the shielded sides accounted for by the bundle value balances.
5. Spends from coinbase outputs must obey coinbase maturity rules
   ($\geq 100$ blocks).
6. Coinbase transactions cannot have shielded spends with a value
   balance other than zero, and cannot have transparent outputs
   except to a permitted address policy.
7. Per-pool nullifier uniqueness within the transaction (caught by
   the node, not the wallet).

The wallet code in
[`zcash_client_backend/src/data_api/wallet.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api/wallet.rs)
and the fee/Proposal pipeline implement these as construction-time
checks.

## 4. Failure modes

- **Skipping the index-distinctness check.** Equihash's correctness
  argument relies on all 512 indices being distinct. Verifier code
  that omits this check would accept trivially-padded solutions
  with repeated indices. The recursive verifier walks the indices
  in order; do not refactor away the distinctness invariant.
- **Wrong personalisation for the BLAKE2b state.** The
  personalisation depends on both $n$ and $k$. Hard-coding the
  mainnet $(200, 9)$ values in a verifier that is supposed to be
  parametric (e.g. for tests) will reject all testnet blocks. The
  parameter table is in
  [`components/equihash/src/params.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/params.rs).
- **History-tree leaf-format drift.** Each network upgrade may
  extend the leaf data. The `Version` trait enables per-upgrade
  serialisation; adding a new NU means adding a new `Version`
  implementation, not mutating the existing one. Cross-version
  leaves must never be combined under the same root.
- **Difficulty-adjustment confusion.** Wallets that try to estimate
  fee timing by reading `nBits` are sensitive to network-upgrade
  changes in the DGW window. This is not in `librustzcash`; if a
  contributor adds DGW logic here, it belongs in a node, not a
  wallet.
- **MIN_CONFIRMATIONS = 10 invariant.** Lowering this constant to
  accommodate testnet edge cases without isolating the change
  behind a network parameter is a documented source of consensus
  drift.

The equihash test vectors in
[`components/equihash/src/test_vectors/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/test_vectors)
exercise both valid and known-invalid solutions and run via
[`components/equihash/src/verify.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/verify.rs#L257-L317).

## 5. Spec pointers

- [Biryukov, Khovratovich, *Equihash: Asymmetric Proof-of-Work Based on the Generalized Birthday Problem*, NDSS 2016](https://www.cs.cmu.edu/~dga/crypto/equihash.pdf):
  the original paper. Section 4 is the algorithm verifier code
  follows.
- [Wagner, *A Generalized Birthday Problem*, CRYPTO 2002](https://www.cs.berkeley.edu/~daw/papers/genbday.html):
  the underlying combinatorial problem.
- [Zcash Protocol Specification, section 7.6.1 (Equihash)](https://zips.z.cash/protocol/protocol.pdf):
  the concrete parameter choice and personalisation strings.
- [ZIP 221 - FlyClient Proof-of-Work Evidence](https://zips.z.cash/zip-0221):
  the chain-history MMR `zcash_history` implements.
- [ZIP 244 - Transaction Identifier Non-Malleability](https://zips.z.cash/zip-0244):
  defines `hashAuthDataRoot` cited in Section 2.5.
- [ZIP 317 - Proportional Transfer Fee Mechanism](https://zips.z.cash/zip-0317):
  the fee invariant in the wallet-side consensus list.

## 6. Exercises

1. **Compute a verification cost.** For a mainnet $(200, 9)$
   solution, count how many BLAKE2b compressions
   `is_valid_solution_recursive` performs in the worst case. Show
   the arithmetic.
2. **Identify the validity path.** Trace the call chain for a
   single-byte mutation of a known-valid solution from
   `is_valid_solution` to the specific `Error` variant that fires.
   Cite the file and line.
3. **Modify and test (code change).** Under
   `components/equihash/src/`, add a unit test that builds an MMR
   of $n = 8$ leaves using `zcash_history::Tree`, computes the
   root, appends a 9th leaf, and asserts the root changes. The
   test must run in under one second.
4. **Map the consensus list to code.** For each of the seven rules
   in Section 3.5, cite the file and function in
   `zcash_client_backend::data_api::wallet` that enforces it (or
   note "no enforcement; relies on the node").

### Answers in the code

- Equihash verifier:
  [`components/equihash/src/verify.rs#L241-L255`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/verify.rs#L241-L255).
- Equihash recursive validator:
  [`components/equihash/src/verify.rs#L221-L239`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/verify.rs#L221-L239).
- History-tree append:
  [`zcash_history/src/tree.rs#L138-L165`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_history/src/tree.rs#L138-L165).
- Equihash parameters:
  [`components/equihash/src/params.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src/params.rs).

## 7. Further reading

- [chapter 10](./10-wallet-stack.md): the wallet pipeline that
  enforces the wallet-side consensus list.
- [chapter 21](./21-active-research-and-nu7.md): in-flight NU7 work
  that touches the MMR leaf format and consensus rules.
- [BCTV-style PoW review](https://blog.ethereum.org/2018/04/03/notes-on-an-asic-resistant-egpu-equihash-200-9):
  background reading on why ASIC-resistance moved against memory
  rather than time.
