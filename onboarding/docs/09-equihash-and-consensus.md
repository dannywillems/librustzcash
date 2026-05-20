# 09 - Equihash and consensus structures

## Goal

Cover the non-shielded but consensus-significant cryptographic
structures: the Equihash proof of work, and the block-header
commitment tree (`zcash_history`). These are less mathematically
central than the shielded protocols but you should understand them
end-to-end since the libraries implement them.

## 1. Equihash

Equihash is the proof-of-work algorithm Zcash inherited from the
Biryukov-Khovratovich paper. It is built around the **Generalised
Birthday Problem (GBP)**.

### The Generalised Birthday Problem

Given a function $f \colon \{0,1\}^* \to \{0,1\}^n$ and a parameter
$k$, find a set of $2^k$ distinct inputs $X_1, \ldots, X_{2^k}$ such
that

$$
f(X_1) \;\oplus\; f(X_2) \;\oplus\; \cdots \;\oplus\; f(X_{2^k}) \;=\; 0.
$$

The best known algorithm is Wagner's: it works by building $k$
collision lists pairwise and runs in time and memory roughly

$$
T \;\approx\; \frac{2^{n/(k+1)}}{k+1}, \qquad
M \;\approx\; 2^{n/(k+1)}.
$$

The memory is the limiting factor. Equihash chooses $(n, k)$ so the
memory is in the gigabyte range, making custom ASICs less profitable
than general-purpose memory-bandwidth hardware.

### Zcash parameters

Mainnet uses $(n, k) = (200, 9)$. So a solution is a set of $2^9 = 512$
distinct 32-bit indices and the verifier checks that the XOR of the
corresponding $f(\cdot)$ values is zero, with $f$ derived from
BLAKE2b.

Testnet uses $(n, k) = (96, 5)$ - much smaller, faster to test.

### Concrete construction

The function $f$ is built from BLAKE2b with personalisation
$\text{"ZcashPoW"}$:

$$
f(I, V, i)
\;=\;
\text{first } n \text{ bits of }
\mathsf{BLAKE2b}_{\,n_{\text{BLAKE}}}\!\bigl(
\text{pers}=\text{"ZcashPoW"} \,\|\, n_{\text{LE}} \,\|\, k_{\text{LE}}, \;
I \,\|\, V \,\|\, i_{\text{LE}}
\bigr),
$$

where $I$ is the block header up to the nonce, $V$ is the 32-byte
nonce, and $i$ is a 32-bit index. A solution is 512 indices whose
$f$-values XOR to zero, with constraints to prevent trivial reuse:

1. All 512 indices are distinct.
2. The Wagner-style pairing structure is encoded in the solution
   order (in pairs, then in pairs-of-pairs, etc., for $k$ levels).
3. At each level $\ell$, the two halves of a pair must satisfy a
   collision condition on a specific 20-bit segment of $f$:
   the leading $\ell \cdot (n/(k+1))$ bits should match exactly
   (so the XOR has them cancel).
4. At each level the left half has the smaller minimum index, to
   force a canonical ordering and prevent permuting an existing
   solution into a different one.

### Verification

Verification ($\sim 500$ BLAKE2b's worth of work) is much cheaper than
finding. The verifier:

1. Recompute $f$ on each of the 512 indices.
2. XOR them. Must be zero.
3. Check the order-and-collision constraints at each of the $k = 9$
   levels.

This is what `components/equihash/src/verify.rs::is_valid_solution`
does. Read it; it is one of the cleanest entries in the codebase.

### Encoding

The solution is encoded as a packed bit-string of the 512 21-bit
indices (so $512 \times 21 = 10752$ bits = 1344 bytes). The
"minimal encoding" is implemented in
`components/equihash/src/minimal.rs`.

### Why care, for librustzcash purposes?

You will not implement an Equihash solver in this workspace (the
`tromp` solver is for testing and is feature-gated). You will use the
verifier to validate block headers if you ever need to do consensus-
adjacent checks. Wallets do not verify PoW directly; they trust the
node.

### References

- Biryukov, Khovratovich. *Equihash: Asymmetric Proof-of-Work Based
  on the Generalized Birthday Problem.* NDSS 2016.
- Wagner. *A Generalized Birthday Problem.* CRYPTO 2002.
- Zcash Protocol Specification, section 7.6.1.

## 2. The history tree (ZIP 221)

The **history tree** (also called "MMR tree") is a structure committed
to in every block header since Heartwood. Each leaf is metadata for one
block; the tree allows light-client proofs that a particular block was
in the history at a given height.

Layout in code: `zcash_history/src/`.

### MMR (Merkle Mountain Range)

A Merkle Mountain Range is a Merkle tree variant that supports
*efficient append*: appending a leaf creates one new leaf plus at most
$O(\log n)$ new internal nodes. The "mountain range" comes from
visualising the structure as a sequence of perfect Merkle trees of
decreasing height that get merged as more leaves arrive.

Formally, the MMR at $n$ leaves has $n + \mathsf{popcount}(n) - 1$ total
nodes; the "peaks" are the roots of the perfect subtrees, one per set
bit of $n$. The root of the MMR is a hash of the peaks combined.

### Per-leaf data

A leaf in the Zcash history tree, for each block, carries (paraphrased
from the ZIP):

- The block hash.
- The Sapling commitment-tree root at the block.
- The Orchard commitment-tree root at the block.
- The block's chain-work (cumulative PoW).
- Reserved fields.

The hash function used for combining leaves is **BLAKE2b** with a
personalisation per network upgrade (so the tree forks at NU
boundaries).

### Why this exists

The history tree gives **succinct light-client proofs** that a
specific block existed at height $h$. A light client that only knows
the current block-header chain-tip's MMR root can verify a
$O(\log h)$ proof showing that a given Sapling/Orchard commitment-tree
root was committed at height $h$. This in turn lets the client trust
the anchor it uses for spends.

The `zcash_history` crate implements the append and proof verification
logic. The wallet does not normally use it; full nodes (Zebra,
`zcashd`) do. We mention it because adding new fields to the history
tree (which has happened at most network upgrades) requires touching
this crate.

## 3. Block-header commitments

In addition to the history tree, the block header committments include
roots of the Sapling and Orchard note-commitment trees. Specifically,
since NU5 the `hashBlockCommitments` field in the block header is

$$
\mathsf{hashBlockCommitments}
=
\mathsf{BLAKE2b}\!\bigl(
\text{pers},\,
\mathsf{hashChainHistory} \,\|\,
\mathsf{hashAuthDataRoot} \,\|\,
\mathsf{hashFinalSaplingRoot}
\bigr).
$$

The chain-history hash binds the MMR; the auth-data root binds the
authorising signatures and proofs of every transaction in the block;
the final Sapling root binds the per-block Sapling commitment-tree
state. These are not implemented in `librustzcash` (that lives in node
implementations) but you should know what they are when reading block
data.

## 4. Difficulty adjustment

Zcash uses a **Dark Gravity Wave (DGW)** style retargeting algorithm:
the target adjusts based on the average block time over the last 17
blocks (plus a moving exponential window). The target is encoded as
`nBits` in the block header in compact form. The expected block
interval is 75 seconds (since Blossom).

This is not in `librustzcash`. Wallets do not check difficulty; node
implementations do.

## 5. Consensus rules a wallet must respect

We listed these in chapter 02; the consolidated list:

1. Anchors must be at least 10 blocks deep (after Sapling/Orchard
   activation; specifically `MIN_CONFIRMATIONS = 10`).
2. `expiry_height` must be in the future or zero.
3. The transaction fee must be positive and at least the ZIP 317
   minimum.
4. The value balance equation must hold:
   $\sum v_{\text{in}} = \sum v_{\text{out}} + \text{fee}$, with the
   shielded sides accounted for by the bundle value balances.
5. Spends from coinbase outputs must obey coinbase maturity rules
   ($\geq 100$ blocks).
6. Coinbase transactions cannot have shielded spends with a value
   balance other than zero, and cannot have transparent outputs
   except to a permitted address policy.
7. Per-pool nullifier uniqueness within the transaction (caught by
   the node, not the wallet).

The wallet code in `zcash_client_backend::data_api::wallet` and the
fee/Proposal pipeline implement these as construction-time checks.

## What you should know after this chapter

- The GBP and how Equihash builds on it.
- The $(200, 9)$ parameter choice and why memory is the bottleneck.
- The MMR structure of the history tree, the per-leaf data, and how
  it grows.
- That this code area is small and stable; touch it only when adding
  a new NU.

Next chapter: the wallet stack, including chain scanning, fee rules,
and the storage trait hierarchy.
