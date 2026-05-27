---
sidebar_position: 21
title: Active research and the road to NU7
description: "v6 tx, ZSAs, ZIP 233 burn, recursion, PQ."
---

# 21 - Active research and the road to NU7

## 1. Why this chapter exists

A contributor joining the project today will spend significant
time on in-flight work that is not yet activated. The NU7 network
upgrade introduces the v6 transaction format, the Zcash Shielded
Assets (ZSA) extension, and the ZIP 233 burn mechanism. All of
these are gated in this workspace behind
`RUSTFLAGS='--cfg zcash_unstable="nu7"'` in
[`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs)
and similar locations. This chapter names the moving pieces, links
each to the code that exists today, and flags the longer-horizon
research items that may surface in future upgrades. The chapter
dates faster than the rest of the course; treat it as a snapshot
and follow the linked discussion forums for current state.

## 2. Definitions

**Definition (Network upgrade, NU).** A coordinated mainnet
activation height at which a set of consensus rule changes becomes
binding. NU5 activated transaction v5, ZIP 244 sighash, and the
Orchard pool. NU6 adjusted dev fund parameters. NU7 is the working
name of the next upgrade; activation height is not yet set.

**Definition (Transaction v6).** The transaction wire format
introduced under NU7. It extends v5 with hooks for ZSA value flows,
the ZIP 233 burn output, and other in-flight extensions. The format
is described in draft ZIP 230.

**Definition (Zcash Shielded Asset, ZSA).** A unit of a non-ZEC
asset held inside an Orchard-like shielded pool. Each asset has an
identifier $\mathsf{AssetId}$ and a derived value-commitment
generator $V_{\text{asset}}$. The ZSA bundle's value balance is
per-asset.

**Definition (Per-asset value commitment).** The ZSA value
commitment is

$$
\mathsf{cv}_{\text{ZSA}} \;=\; [v]\,V_{\text{asset}} \;+\; [\mathsf{rcv}]\,R,
$$

with $V_{\text{asset}} = \mathsf{HashToCurve}(\mathsf{AssetId})$
into Pallas. The bundle's balance equation aggregates these
commitments per asset.

**Definition (ZIP 233 burn).** A consensus rule, defined in draft
ZIP 233, that a fraction of each transaction's fee is burned
rather than paid to the miner. The transaction value-balance
equation becomes

$$
\sum v_{\text{in}} \;=\; \sum v_{\text{out}} \;+\; \text{fee} \;+\; \text{burn},
$$

with $\text{burn}$ a public scalar derived from the fee via a
governance parameter.

**Definition (Recursive proof).** A SNARK whose statement
includes the verification of one or more SNARKs. Halo 2 supports
recursion natively because verification consists of a constant
number of pairings and field operations, expressible as a circuit.

## 3. The code

### 3.1 NU7 gating

The transaction enum and its parsers are gated by the
`zcash_unstable` cfg. The gating sites in
[`zcash_primitives/src/transaction/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs):

```rust reference title="zcash_primitives/src/transaction/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L80-L155
```

The v6 sighash lives in
[`sighash_v6.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v6.rs).
The activation height for NU7 in
[`consensus.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs)
is currently `None`, meaning unfixed:

```rust reference title="components/zcash_protocol/src/consensus.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L485-L500
```

A contributor extending NU7 code must keep both the stable build
(no flag) and the `nu7` build green; CI exercises both.

### 3.2 ZSAs: per-asset value commitments

The Action circuit grows under ZSA: it now checks that the per-asset
generator $V_{\text{asset}}$ is correctly derived from the asset
identifier and that the binding signature verification key is the
per-asset sum.

Reference implementations live in the external
[`orchard`](https://github.com/zcash/orchard) repository's
`orchard-zsa` modules (under active development); the
[`pczt/src/orchard.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/orchard.rs)
component of this workspace will be extended to carry per-asset
fields when ZSA lands.

Issuance and burn are the two new bundle types:

- **Issuance**: a special bundle that mints new units of an asset.
  The issuer signs with an IssuanceKey under a RedPallas-style
  scheme; the circuit proves authorisation and well-formedness.
- **Burn**: an Action that destroys value of a specific asset.
  The asset's total supply decreases on confirmation.

The two are defined by draft ZIPs 227 (issuance) and 226 (transfer
and burn).

### 3.3 ZIP 233: network sustainability mechanism

ZIP 233 changes the block reward model from pure inflation to a
hybrid with explicit burning. The transaction must include enough
value to cover both fee and burn; wallets need to compute the burn
fraction from the protocol parameter and include it in the
balance equation.

The fee module
[`zcash_primitives/src/transaction/fees.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs)
is trait-based, so a `ZIP233FeeRule` can plug into the existing
proposal pipeline without rewriting builder code.

ZIP 233 is, at the time of writing, in draft/proposed status and
likely to activate with NU7 or later.

### 3.4 Recursive proofs for chain history

Halo 2 is recursion-ready. A long-term project is to use recursion
for chain history: at each block, the prover produces a proof that
all prior blocks were valid; the chain maintains a constant-size
accumulator.

Benefits: new nodes sync from a constant-size proof rather than
revalidating the chain. Challenges: per-block recursive verifier
overhead is tens of thousands of constraints; prover time must
keep up with the block interval; data-availability and reorg
handling are open questions.

This is research-level, not in production. The
[`halo2_proofs`](https://github.com/zcash/halo2) crate provides the
proof system primitives that would underlie any such implementation.

### 3.5 Forward-looking proving systems

Industry-wide, the proving-system frontier has moved to PLONKish
designs with custom arithmetisation (Plonky2, Plonky3) and to
folding schemes (Nova, SuperNova, ProtoStar, HyperNova). Tachyon
is a codename for an in-development Halo 2 successor optimised
for proving performance. None of these are committed for
production Zcash today; the modular structure (separate proof
systems per shielded pool) is designed to accommodate a future
replacement.

### 3.6 Post-quantum

All current Zcash cryptography relies on discrete-log assumptions
that quantum computers can solve in polynomial time (Shor). A
post-quantum migration is a long-horizon project. Candidate
primitives:

- Hash-based signatures (XMSS, SPHINCS+) for spend authorisation.
- Lattice-based commitments (Ajtai-style) for value commitments.
- STARK-based or lattice-based SNARKs for the proving system.

The proof-system migration is the hard part. This workspace does
not actively implement PQ today, but the per-pool modularity
supports a future PQ pool.

### 3.7 Wallet evolution: PCZT and hardware wallets

Active wallet-layer engineering:

- **PCZT maturity**: more roles, better error handling, hardware-
  wallet integrations. The PCZT module lives at
  [`pczt/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/lib.rs)
  with role definitions under
  [`pczt/src/roles`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/roles).
- **Hardware-wallet support**: Ledger and similar devices are
  working on Orchard support. The PCZT design enables the device
  to sign without proving.
- **Account-discovery improvements**: faster scanning, better
  birthday handling. Touches
  [`zcash_client_backend/src/scanning.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs).
- **Network privacy defaults**: Tor support via
  [`zcash_client_backend/src/tor.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/tor.rs).

### 3.8 Anonymity-set consolidation

A protocol discussion in progress: whether to retire Sapling for
new outputs and force future activity into Orchard. Argument for:
a single larger pool has stronger privacy than two smaller pools.
Argument against: existing Sapling users still need to move funds.
The likely path is a multi-NU deprecation with at-least-cost
migrations and clear UX guidance. ZIP drafts in the 4xx range
discuss this.

### 3.9 Fee policy evolution

ZIP 317 has been the default since NU5 but has known limitations.
Active discussion:

- Variable-cost fees for shielded inputs (today, all shielded
  outputs cost the same regardless of anonymity-set contribution).
- Mempool-priority signalling.
- Burn-vs-fee policy interaction with ZIP 233.

The fee module trait makes new strategies pluggable:

```rust reference title="zcash_primitives/src/transaction/fees.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs#L1-L60
```

### 3.10 Concrete code areas to watch

| Path | Why it is active |
| --- | --- |
| `zcash_primitives/src/transaction/components/orchard.rs` | v6 transaction format integration |
| `pczt/src/` | new role definitions and hardware-wallet workflows |
| `zcash_client_backend/src/data_api/wallet.rs` | proposal and build flow updates |
| `components/zcash_protocol/src/consensus.rs` | NU activation heights |
| `zcash_primitives/src/transaction/sighash_v6.rs` | v6 sighash |

The published roadmap from the Zcash Foundation and ECC tracks
priorities at higher resolution than this chapter can.

### 3.11 The network-upgrade lifecycle

A typical NU lifecycle:

1. Proposals collected and triaged via the community forum and
   Zcash Foundation calls.
2. ZIP authors draft formal specs in the `zcash/zips` repo.
3. Reference implementation behind cfg flags in `zcashd`, Zebra,
   and this workspace.
4. Testnet activation (months ahead of mainnet).
5. External audits cover the new code paths.
6. Public review period.
7. Mainnet activation at a coordinated height.

Activation is coordinated: nodes that have not upgraded by the
activation height become incompatible and fork off. Wallets must
also be updated to recognise the new format.

### 3.12 Standardisation outside Zcash

Cryptography Zcash pioneered is now widely used:

- BLS12-381 is the standard pairing curve for Ethereum 2 / Beacon
  Chain, Filecoin, and Tezos.
- Halo 2 has been forked and extended by Privacy & Scaling
  Explorations for Ethereum-specific proofs.
- Poseidon is now common in many SNARK systems.

External attention means bug fixes and performance improvements
sometimes come from outside the project; track upstream releases
of `halo2`, `bls12_381`, `pasta_curves`, and related crates.

## 4. Failure modes

- **Unstable code merged into stable.** A `#[cfg(zcash_unstable
  = "nu7")]` gate accidentally removed, or a function moved out of
  the gate, can leak v6 logic into the stable build. CI builds
  both configurations; review must confirm the cfg coverage.
- **ZIP draft drift.** Implementing against a draft ZIP without
  pinning the version in a commit message means the spec can
  change under you. Always cite the ZIP revision in the PR.
- **ZSA asset-identifier collision.** Two assets whose
  identifiers hash to the same Pallas point would share a value
  commitment generator and break the per-asset balance equation.
  The hash-to-curve must be domain-separated and tested with
  adversarial vectors.
- **Burn rate misconfiguration.** A ZIP 233 burn rate parameter
  set to the wrong value at activation would either pay miners
  too much or destroy more value than the network sustainability
  target intended. The activation parameter must be reviewed and
  vector-tested.
- **Hardware-wallet signing without binding to sighash.** A
  PCZT signing role that signs without the canonical sighash
  binding is a transaction-malleability bug. The PCZT role
  documentation must spell the sighash requirements explicitly.
- **Anonymity-set fragmentation during migration.** A poorly
  staged Sapling-to-Orchard migration shrinks both pools below
  their previous individual sizes during the transition. Wallet
  UX should batch and randomise timing.

## 5. Spec pointers

- [ZIP 230](https://zips.z.cash/zip-0230): Transaction v6 wire
  format draft. The structural reference for v6 work.
- [ZIP 226](https://zips.z.cash/zip-0226): Transfer and burn of
  Zcash Shielded Assets. The ZSA transfer rules.
- [ZIP 227](https://zips.z.cash/zip-0227): Issuance of Zcash
  Shielded Assets.
- [ZIP 233](https://zips.z.cash/zip-0233): Network Sustainability
  Mechanism. The burn rule.
- [Halo paper](https://eprint.iacr.org/2019/1021): the original
  recursion-without-trusted-setup result; underpins any future
  recursive chain-history work.
- [Nova / SuperNova](https://eprint.iacr.org/2021/370): the
  folding-scheme line of work that informs future proving systems.
- [Zcash Foundation engineering blog](https://www.zfnd.org/blog/):
  periodic engineering posts; the most reliable source for
  current status.
- [ECC engineering blog](https://electriccoin.co/blog/): parallel
  source.

## 6. Exercises

1. **Locate an NU7 hook.** Use `git grep zcash_unstable` to find
   five distinct files in this workspace that gate code behind
   the NU7 cfg. For each, write a one-line explanation of what
   the gated code does.
2. **Trace a v6 sighash.** Open
   [`zcash_primitives/src/transaction/sighash_v6.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v6.rs)
   and identify which fields it includes that v5 (in
   `sighash_v5.rs`) did not. Cite the line ranges in both files.
3. **Build NU7 locally.** Run `cargo build` with and without
   `RUSTFLAGS='--cfg zcash_unstable="nu7"'`. State whether both
   succeed and, if applicable, name one test that runs only in
   the NU7 configuration.
4. **Sketch a ZIP 233 fee rule.** Read the latest revision of
   draft ZIP 233. Sketch (in prose, not code) how you would
   extend the trait in
   [`zcash_primitives/src/transaction/fees.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs)
   to add a `burn_amount(...)` method. State whether the change
   would be backwards-compatible.

### Answers in the code

- NU7 transaction gating:
  [`zcash_primitives/src/transaction/mod.rs#L80-L155`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L80-L155).
- NU7 activation height (currently None):
  [`components/zcash_protocol/src/consensus.rs#L485-L500`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/consensus.rs#L485-L500).
- v6 sighash:
  [`zcash_primitives/src/transaction/sighash_v6.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v6.rs).
- Fee trait:
  [`zcash_primitives/src/transaction/fees.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs).
- PCZT roles:
  [`pczt/src/roles`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/roles).

## 7. Further reading

- [chapter 17](./17-halo2-deep-dive.md): the Halo 2 internals
  that underpin recursion and the future proving-system work.
- [chapter 20](./20-audits-and-cross-impl.md): the cross-impl
  process that gates NU7 mainnet activation.
- [chapter 22](./22-cryptographer-code-review.md): the review
  checklist used on NU7 PRs.
- [Zcash community forum, NU7 category](https://forum.zcashcommunity.com/):
  in-progress design threads.
