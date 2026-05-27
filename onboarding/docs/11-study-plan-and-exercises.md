---
sidebar_position: 11
title: Study plan and exercises
description: "Week-by-week schedule with self-tests."
---

# 11 - Study plan and exercises

## Goal

A concrete week-by-week schedule for someone starting as a principal
cryptography engineer on Zcash. Each week has a focus, a reading list,
and one to three exercises whose solutions either exist in the
codebase or in cited references. The exercises are graded by
difficulty: $\star$ (verification or reading), $\star\star$
(non-trivial derivation or short code), $\star\star\star$
(open-ended, multi-day).

The schedule assumes you can give Zcash full attention for $\sim 30$
hours per week. Scale to your actual availability.

## Week 1 - Orientation

**Goal**: be able to navigate the repo without consulting the README
each time.

Reading:

- This `onboarding/` directory chapters 01-02.
- Top-level `README.md` and `AGENTS.md`.
- `CONTRIBUTING.md`.
- Zcash Protocol Specification, sections 1, 2, 3.

Exercises:

1. $\star$ Draw the dependency graph by hand without consulting the
   Mermaid diagram. Compare.
2. $\star$ Build the workspace with `cargo build --workspace
   --all-features`. Then `cargo test --workspace --all-features`. Note
   timing.
3. $\star\star$ Identify the crate and file responsible for each of
   the following:
   - Parsing a Sapling SpendDescription from bytes.
   - Computing the v5 sighash.
   - Verifying an Equihash solution.
   - Encoding a Unified Address.
   - Trial-decrypting an Orchard output.

## Week 2 - Cryptographic foundations

**Goal**: be confident with the math notation and the per-curve
parameters.

Reading:

- This onboarding chapter 03.
- Protocol Specification, sections 4.1-4.2 (Abstract Protocol),
  section 5.4 (PRFs and hashes).
- Optional: Boneh-Shoup, *A Graduate Course in Applied
  Cryptography*, chapters 12-15 (commitments, NIZK).

Exercises:

1. $\star$ Verify in code: locate every BLAKE2b personalisation
   string used in the Zcash codebase (grep `Params::new`,
   `.personal(`, etc.). Build a table of `personalisation -> use`.
2. $\star\star$ Write a Rust function that, given a 32-byte spending
   key, computes $\mathsf{ak}, \mathsf{nk}, \mathsf{ovk},
   \mathsf{ivk}$ for Sapling. Cross-check against
   `sapling-crypto::zip32` test vectors.
3. $\star\star$ Implement Pedersen commitment $[m]G + [r]H$ over
   Jubjub in $\sim 30$ lines using the `jubjub` crate. Verify
   homomorphism: $\mathsf{Com}(m_1; r_1) + \mathsf{Com}(m_2; r_2) =
   \mathsf{Com}(m_1+m_2; r_1+r_2)$.

## Week 3 - Sapling, part 1: protocol math

**Goal**: be able to write down, from memory, the Spend and Output
statements proved by the Sapling circuit.

Reading:

- Onboarding chapter 04.
- Protocol Specification, sections 4.3-4.4.4 (Sapling key components
  and Note Commitment Tree).
- The `sapling-crypto` crate's `circuit` module (read the file,
  match it to the math).

Exercises:

1. $\star\star$ For a fresh Sapling spending key, derive the address
   for diversifier index 0 by hand (or in code), then encode it as
   bech32. Compare to `zcash_keys::keys` tests.
2. $\star\star$ Given a known valid Sapling output (from a test
   vector), trial-decrypt by hand following the chapter-8 steps.
3. $\star\star\star$ Read the Sapling circuit module in
   `sapling-crypto/src/circuit/`. For each section of the Spend
   circuit, identify which clause of the statement (chapter 04, B.5)
   it implements.

## Week 4 - Sapling, part 2: code and integration

**Goal**: know exactly what the Sapling builder does end-to-end.

Reading:

- `zcash_primitives/src/transaction/components/sapling.rs`.
- `zcash_primitives/src/transaction/builder.rs` (Sapling-related
  paths).
- `zcash_proofs/src/lib.rs` and `zcash_proofs/src/prover.rs`.

Exercises:

1. $\star$ Run the Sapling builder tests. Pick one, add a debug
   print of the resulting `bvk`, verify it equals the sum the
   binding signature checks against.
2. $\star\star$ Write a 30-line program that constructs a v4
   transaction with one Sapling output (sending to your own
   address), prints the wire bytes. Use `MockTxProver` or fake
   parameters.
3. $\star\star\star$ Mutate one byte of `value_balance_sapling` in
   a serialised valid transaction. Re-parse. The `Transaction::read`
   should still succeed (it does not check consensus). What changes
   if you then ask the bundle to verify its binding signature?

## Week 5 - Orchard, part 1: protocol math

**Goal**: write down the Action statement, justify why the
nullifier-chain trick works.

Reading:

- Onboarding chapter 05.
- ZIP 224.
- Protocol Specification section 4.5.

Exercises:

1. $\star\star$ Show that with $\rho^{\text{new}} =
   \mathsf{nf}^{\text{old}}$ the chance of two different Action
   bundles producing two different new notes with the same $\rho$ is
   negligible. (Hint: nullifier uniqueness.)
2. $\star\star$ For an Orchard bundle of $n$ Actions, write down
   the equation defining the binding-signature verification key.
3. $\star\star$ Why does Sinsemilla use incomplete addition and not
   complete addition? What is gained, and what must be checked to
   ensure soundness?

## Week 6 - Orchard, part 2: Halo 2

**Goal**: be able to explain Halo 2 to a colleague: arithmetisation,
permutation, lookups, IPA, transcript.

Reading:

- The Halo 2 book (https://zcash.github.io/halo2/), chapters 1-3
  and chapter on lookups.
- The `orchard` crate's `circuit` module.
- Bowe et al. *Halo* (ePrint 2019/1021).

Exercises:

1. $\star$ Skim the Halo 2 lookup-argument chapter. State the
   commitment of the prover and the soundness intuition in your own
   words.
2. $\star\star$ Inside the `halo2_proofs` crate (external), find a
   small example circuit and trace one column's polynomial through
   commitment, evaluation, and verification.
3. $\star\star\star$ Sketch what would change in the Orchard
   integration if a new shielded pool ("Pool X") added an extra
   field to each note. Which files? Which test vectors?

## Week 7 - Keys, addresses, F4Jumble

**Goal**: implement UA parsing/decoding from scratch and validate
against `librustzcash`.

Reading:

- Onboarding chapter 06.
- ZIP 32, ZIP 173, ZIP 316.
- `components/f4jumble/src/lib.rs` and
  `components/zcash_address/src/kind/unified.rs`.

Exercises:

1. $\star\star$ Implement F4Jumble in $\sim 80$ lines of Rust.
   Verify against `f4jumble` test vectors.
2. $\star\star$ Build a Unified Address by hand from a Sapling and
   an Orchard receiver. Compare to a known-good UA.
3. $\star\star\star$ A user reports that their hardware wallet
   displays a UA whose first 10 characters and last 10 characters
   match the original UA, but middle characters differ. Use the
   F4Jumble property to argue why this is implausible without a
   BLAKE2 collision.

## Week 8 - Transactions and PCZT

**Goal**: understand the sighash tree well enough to debug an invalid
signature.

Reading:

- Onboarding chapter 07.
- ZIP 243, ZIP 244, draft ZIP for v6 (if relevant).
- `zcash_primitives/src/transaction/txid.rs`,
  `sighash_v5.rs`.
- `pczt/src/lib.rs`.

Exercises:

1. $\star$ Locate the Sapling sighash sub-digest in `sighash_v5.rs`.
   Confirm it depends only on the Sapling bundle.
2. $\star\star$ Walk through a PCZT round-trip: create, construct,
   prove (mock), sign, extract. Identify which fields of the PCZT are
   mutated at each role.
3. $\star\star\star$ Read the v6 sighash code under
   `zcash_unstable = "nu7"`. Identify what new content is included
   in the digest tree compared to v5, and design a test that would
   catch a buggy implementation that forgets to include it.

## Week 9 - Note encryption and scanning

**Goal**: build a minimal scanner.

Reading:

- Onboarding chapter 08.
- `zcash_note_encryption` crate.
- `zcash_client_backend/src/scanning.rs`,
  `zcash_client_backend/src/decrypt.rs`.

Exercises:

1. $\star\star$ Given an `ivk` and a `lightwalletd` `CompactBlock`
   bytes blob, write a 100-line scanner that lists the outputs the
   `ivk` can decrypt.
2. $\star\star$ Show that if a sender accidentally reuses an
   $\mathsf{esk}$ for two outputs to the same recipient, the
   recipient's $\mathsf{ivk}$ is recoverable. (Hint: two shared
   secrets at the same point + DLP relations.)
3. $\star\star\star$ Profile trial-decryption performance on a
   1000-output block. Identify the dominant cost and propose an
   optimisation.

## Week 10 - Wallet stack and integration

**Goal**: comfortably contribute to wallet features.

Reading:

- Onboarding chapter 10.
- `zcash_client_backend/src/data_api/wallet.rs`.
- A few migration files under
  `zcash_client_sqlite/src/wallet/init/migrations/`.

Exercises:

1. $\star$ Run the `zcash_client_sqlite` test suite. Pick one test,
   add a `println!` to trace a transaction round trip.
2. $\star\star$ Implement a tiny in-memory wallet on top of
   `zcash_client_memory` that:
   - tracks one Sapling account,
   - scans a sequence of synthetic blocks,
   - reports the balance and the unspent nullifier set.
3. $\star\star\star$ Propose a feature: "give me the diff between
   the proposal and what the builder actually emitted". Sketch the
   API and the tests that would justify it.

## Week 11 - Equihash, history, consensus

**Goal**: be unsurprised by anything in the periphery.

Reading:

- Onboarding chapter 09.
- `components/equihash/src/`.
- `zcash_history/src/`.
- ZIP 221.

Exercises:

1. $\star$ Run an Equihash verification on the genesis block.
2. $\star\star$ Build the MMR for the first 10 blocks (use mocked
   leaves). Verify a proof for block 5.
3. $\star\star\star$ Design a test for an MMR consistency property:
   any prefix of leaves yields a tree that is a *valid restriction*
   of the larger tree.

## Week 12 - First contribution

**Goal**: have at least one PR merged (or filed and acknowledged) on
your own.

Process:

1. Watch the Github issues for "good first issue" tags or low-hanging
   improvements.
2. Per `AGENTS.md`: discuss the change in an issue first; wait for a
   maintainer's acknowledgement.
3. Branch from `main` for a feature, or the earliest relevant
   `maint/` branch for a bugfix.
4. Run the full CI sequence locally.
5. Open the PR.

Ideas:

- A documentation patch that fills a gap you found.
- A test vector you wrote during exercises and that catches a missing
  edge case.
- An ergonomic improvement around proposal review.

## Calibrating depth

If you cannot, after this 12 weeks:

- ...write down the Sapling Spend statement from memory: redo week 3.
- ...explain why Pallas/Vesta is chosen for Halo 2: redo week 6.
- ...locate the file that computes a v5 sighash: redo week 8.
- ...trace a single output from a block through the scanner and into
  storage: redo weeks 9 and 10.

There is no shortcut. The cryptography is dense, the implementation is
careful, and the consequences of a wrong commitment or signature
extend to real money.

## A short reading list for ongoing work

Always-open tabs:

- The Zcash Protocol Specification.
- ZIPs index (https://zips.z.cash/).
- The `halo2` book.
- This onboarding directory.

Books worth owning:

- Hopwood et al., *Zcash Protocol Specification.*
- Boneh & Shoup, *A Graduate Course in Applied Cryptography.*
- Lindell, ed., *Tutorials on the Foundations of Cryptography.*
- Joux, *Algorithmic Cryptanalysis.*
- Galbraith, *Mathematics of Public Key Cryptography.*

## Closing note

The `librustzcash` workspace is one of the better-engineered
cryptographic codebases in the wild. Type-safe by default, deeply
test-vector-driven, careful about every domain separation. Treat that
as the bar; do not lower it.

Welcome to the team.
