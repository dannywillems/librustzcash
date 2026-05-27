---
sidebar_position: 21
title: Active research and the road to NU7
description: "v6 tx, ZSAs, ZIP 233 burn, recursion, PQ."
---

# 21 - Active research and the road to NU7

## Goal

A snapshot of the active research and engineering directions
relevant to a Zcash cryptography engineer in 2026. This chapter
documents the in-flight proposals, the network upgrade NU7, the ZSA
(Zcash Shielded Assets) work, the burn mechanism, and the
longer-horizon recursive-proof research.

This is the "where is the puck going" chapter. By design it dates
faster than the rest of the course; treat it as a starting point for
following the discussion, not a long-term reference.

## 1. NU7 - the next network upgrade

NU7 is the working name of the next major network upgrade. It
introduces several changes simultaneously; the workspace gates them
behind `RUSTFLAGS='--cfg zcash_unstable="nu7"'`. Key components:

- **Transaction version 6**: new wire format with hooks for ZSAs,
  burn, and other extensions.
- **ZIP 230** transaction format updates: structural shifts to
  accommodate per-asset value flows.
- **ZIP 233** burn mechanism: a small fraction of each fee is
  burned, reducing supply, in a verifier-friendly way.
- **ZSAs**: the ability to issue, transfer, and burn non-ZEC
  assets shielded inside Orchard-like Actions.

In code: scan for `#[cfg(zcash_unstable = "nu7")]` and `cfg_attr`
markers; the v6 transaction parser, sighash, and bundle types are
implemented behind these.

## 2. Zcash Shielded Assets (ZSAs)

The mathematical model: extend Orchard's value commitments and
nullifier construction to support multiple asset identifiers.

A pre-ZSA Sapling/Orchard value commitment commits to a value $v
\in [0, 2^{64})$ in **ZEC**. The proposed ZSA value commitment is

$$
\mathsf{cv} \;=\; [v] \, V_{\text{asset}} \;+\; [\mathsf{rcv}] \, R,
$$

with $V_{\text{asset}}$ a **per-asset generator** derived from an
asset identifier $\mathsf{AssetId}$ via a hash-to-curve on Pallas.
The bundle's value balance is now a sum over assets, with each
asset's commitments summing to a per-asset balance.

The Action circuit grows: it now checks that the asset generator is
correctly derived, and the binding signature verification key
becomes a per-asset point sum.

References:

- ZIP 226 - Transfer and Burn of Zcash Shielded Assets.
- ZIP 227 - Issuance of Zcash Shielded Assets.

The reference implementation is in the `orchard` repo's
`orchard-zsa` modules and Issuance circuits.

### Issuance

A ZSA issuance is a special bundle that mints new units of an
asset. The issuer:

1. Generates an IssuanceKey.
2. Constructs an "issuance Action" that creates new notes of the
   asset.
3. Signs with the IssuanceKey under a re-randomised RedPallas-style
   scheme.

The circuit proves the issuer is authorised (knowledge of the
IssuanceKey) and that the newly-created notes are well-formed.

### Burn

A burn is the inverse: an Action with no outputs (or with explicit
"burn" outputs) destroys value. The asset's total supply
decreases.

ZIP 233 (Network Sustainability Mechanism) is a *different* burn
mechanism, specific to ZEC: a fraction of each transaction's fee
is burned. The two are not the same.

## 3. ZIP 233 - Network Sustainability Mechanism

The motivation: shift from a pure inflation-based block-reward
model to a hybrid model with explicit burning that reduces supply
over time.

The mechanism: each transaction's fee is partially burned (the
exact fraction is governed by a public parameter). The burn is
visible on-chain as a "burn output" with a specific marker.

For wallet code: fees increase by the burn fraction, and the
transaction value-balance equation gets a new term:

$$
\sum v_{\text{in}} \;=\; \sum v_{\text{out}} \;+\; \text{fee} \;+\; \text{burn},
$$

where $\text{burn}$ is a public scalar. The transaction must
include enough value to cover both fee and burn.

Status: under draft / proposed; will likely activate with NU7 or
later.

## 4. Recursive proofs for chain history

Halo 2 is recursion-ready (chapter 17). A long-term project is to
use recursion for chain history: at each block, the prover
produces a proof that "all prior blocks were valid", and the chain
maintains a constant-size accumulator.

Benefits:

- New nodes can sync from a constant-size proof rather than
  re-validating the entire chain.
- Block headers carry one proof; legacy data is recoverable but
  not required for validation.

Challenges:

- Constraint count: each block adds tens of thousands of
  constraints to the recursive verifier.
- Prover time: must keep up with the block interval.
- Open questions on data-availability and reorg handling.

This is research-level work; not in production.

## 5. Tachyon (codename)

Tachyon is the codename for an in-development Halo 2 successor
optimised for proving performance. It uses faster polynomial
commitments and an upgraded arithmetisation. Public details vary
over time; if you see it referenced, it is a forward-looking
proving system that may or may not be the eventual successor.

## 6. Plonky3 and folding schemes

Industry-wide, the proving-system frontier has moved to PLONKish
designs with custom arithmetisation (Plonky2, Plonky3) and to
folding schemes (Nova, SuperNova, ProtoStar, HyperNova) that allow
incremental aggregation of proofs.

Some of these may eventually appear in Zcash. Watch the ECC and
Zcash Foundation engineering blogs.

## 7. Post-quantum

All current Zcash cryptography relies on discrete log assumptions
that quantum computers can solve. A post-quantum migration is a
long-horizon project. Candidate primitives:

- Hash-based signatures (XMSS, SPHINCS+) for spend authorisation.
- Lattice-based commitments (Ajtai-style) for value commitments.
- STARK-based or lattice-based SNARKs for the proving system.

The proof-system migration is the hard part. Hash-based
signatures are well-understood and could replace RedJubjub/RedPallas;
the proof-system replacement is open.

`librustzcash` is not actively implementing PQ today, but the
modular structure (separate proof systems per shielded pool) is
designed to accommodate a future PQ pool.

## 8. Wallet evolution: PCZT and hardware-wallet support

Active engineering:

- **PCZT maturity**: more roles, better error handling, hardware-
  wallet integrations.
- **Hardware wallets**: Ledger and similar are working on Orchard
  support. The PCZT design makes this practical: the device signs
  without proving.
- **Account-discovery improvements**: faster scanning, better
  birthday handling.
- **Tor and i2p**: more privacy-preserving network defaults.

You will see PRs touching `pczt/`, `zcash_client_backend/`,
`zcash_keys/` in this area.

## 9. Anonymity-set consolidation

There is an ongoing protocol discussion about whether to retire
Sapling for new outputs (forcing future activity into Orchard).
The argument for: a single, larger pool has stronger privacy than
two smaller pools. Argument against: existing Sapling users still
need to move funds; abrupt deprecation harms them.

Likely path: a multi-NU deprecation, with at-least-cost migrations
and clear UX guidance.

ZIP-X drafts are in flight. Track ZIPs in the 4xx range for this.

## 10. Fee policy evolution

ZIP 317 has been the default since NU5 but has known limitations.
Active discussion:

- Variable-cost fees for shielded inputs (today, all shielded
  outputs cost the same, regardless of size of the anonymity-set
  contribution).
- Mempool-priority signaling.
- Burn-vs-fee policy (interacts with ZIP 233).

The fee module (`zcash_primitives/src/transaction/fees.rs`) is
modular by trait; new strategies can be plugged in.

## 11. Concrete code areas to watch

- `zcash_primitives/src/transaction/components/orchard.rs` (and the
  `orchard` crate) for v6 transaction format.
- `pczt/` for new role definitions.
- `zcash_client_backend/src/data_api/wallet.rs` for proposal /
  build flow updates.
- `zcash_proofs/` (less active; mostly stable).
- `components/zcash_protocol/src/consensus.rs` for NU activation
  heights.

The team-led roadmap is published in the Zcash Foundation and ECC
"engineering plan" documents; watch the org's blog.

## 12. The "Network Upgrade Pipeline"

A typical NU lifecycle:

1. Proposals collected and triaged.
2. ZIP authors draft formal specs.
3. Reference implementation behind cfg flags.
4. Testnet activation (months ahead of mainnet).
5. External audits.
6. Public review.
7. Mainnet activation.

Activation is *coordinated*: nodes that haven't upgraded by the
activation height become incompatible and fork off. Wallets must
also be updated to recognise the new format.

## 13. Standardisation outside Zcash

Some cryptography Zcash pioneered (BLS12-381, Halo 2, Sinsemilla)
is now widely used:

- BLS12-381 is the standard pairing curve for Ethereum 2 / Beacon
  Chain, Filecoin, Tezos.
- Halo 2 was forked and extended by Privacy & Scaling Explorations
  for Ethereum-specific proofs.
- Poseidon (a generic Halo 2-friendly hash) is now standard in many
  SNARK systems.

This means a lot of attention is paid to the underlying crates;
bug fixes and improvements often come from external contributors.

## 14. What this means for a new joiner

In the next 12 months you will likely be involved in:

- v6 transaction format consolidation.
- ZSA integration into wallet flows.
- ZIP 233 burn integration.
- PCZT role refinements.
- Wallet performance and UX.

You will also be exposed to forward-looking work (Tachyon,
recursion, PQ). Stay aware of it without committing to it; the
production code is the priority.

## 15. Resources to track

- Zcash Foundation engineering blog: https://www.zfnd.org/blog/
- ECC blog: https://electriccoin.co/blog/
- Zcash Github org: https://github.com/zcash
- ZF discord and ECC discord.
- Zcash community forum: https://forum.zcashcommunity.com/

## What you should know after this chapter

- NU7 is the next major activation; v6 tx, ZSA, ZIP 233.
- ZSA generalises value commitments to per-asset bases.
- Recursion and PQ are research, not production.
- Wallet evolution centres on PCZT, hardware-wallet support,
  privacy network layers.

Last chapter: the cryptographer's code-review checklist, distilling
the operational lessons from this course.
