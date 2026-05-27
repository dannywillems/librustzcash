---
sidebar_position: 11
title: Study plan and exercises
description: "Week-by-week schedule with self-tests."
---

# 11 - Study plan and exercises

## 1. Why this chapter exists

A graduate-level reading list is useless without a schedule that
converges on a first PR. This chapter pins the order in which the
preceding chapters should be read, what to do each week beyond
reading, and how to calibrate depth before moving on. The
schedule assumes you can give Zcash full attention for $\sim 30$
hours per week; scale to your actual availability. After 12
weeks, you should be able to point to a merged or
acknowledged PR on
[`zcash/librustzcash`](https://github.com/zcash/librustzcash). If
you cannot, the calibration section at the bottom tells you which
chapters to redo.

## 2. Definitions

### Definition (exercise difficulty)

Each exercise carries a difficulty marker:

- $\star$: verification or reading. Answer is a line range, a
  spec section, or a single fact.
- $\star\star$: non-trivial derivation or short code. Answer
  takes 30 minutes to a few hours.
- $\star\star\star$: open-ended, multi-day. Answer is a written
  artefact (design sketch, test, proposal).

### Definition (calibration)

A self-check at the end of week 12 against the protocol
fundamentals (key derivation, sighash, Pedersen hash, scanner
flow). If any check fails, the corresponding week's reading
must be redone. Calibration is non-negotiable: the cost of
shipping a wrong commitment is real money.

### Invariant (the contribution loop is the schedule)

Reading without modifying code does not produce contributors.
Every week of this schedule includes at least one exercise that
forces the reader to either (a) cite a specific line range, or
(b) modify code and observe the effect. A schedule that only
lists reading is a schedule that produces tourists.

## 3. The schedule

### 3.1 Week 1: orientation

**Goal**: navigate the repo without consulting the README each
time.

Reading:

- [Chapter 01 (Overview and roadmap)](./01-overview-and-roadmap.md).
- [Chapter 01b (Build, test, contribute)](./01b-build-test-contribute.md).
- Top-level `README.md` and `AGENTS.md` in
  [`zcash/librustzcash`](https://github.com/zcash/librustzcash).
- `CONTRIBUTING.md`.
- Zcash Protocol Specification, sections 1, 2, 3.

Exercises:

1. $\star$ Draw the workspace dependency graph by hand without
   consulting the Mermaid diagram in chapter 01. Compare.
2. $\star$ Build the workspace with
   `cargo build --workspace --all-features`, then
   `cargo test --workspace --all-features`. Note timing.
3. $\star\star$ Identify the crate and file responsible for:
   - Parsing a Sapling `SpendDescription` from bytes.
   - Computing the v5 sighash.
   - Verifying an Equihash solution.
   - Encoding a Unified Address.
   - Trial-decrypting an Orchard output.

### 3.2 Week 2: cryptographic foundations

**Goal**: be fluent in the math notation and per-curve
parameters.

Reading:

- [Chapter 03 (Cryptography primer)](./03-cryptography-primer.md).
- Protocol Specification, sections 4.1-4.2 (Abstract Protocol)
  and section 5.4 (PRFs and hashes).
- Optional: Boneh-Shoup, *A Graduate Course in Applied
  Cryptography*, chapters 12-15 (commitments, NIZK).

Exercises:

1. $\star$ Locate every BLAKE2b personalisation string used in
   the workspace (grep `Params::new`, `.personal(`). Build a
   table mapping personalisation to use.
2. $\star\star$ Write a Rust function that, given a 32-byte
   spending key, computes $\mathsf{ak}, \mathsf{nk},
   \mathsf{ovk}, \mathsf{ivk}$ for Sapling. Cross-check against
   `sapling-crypto::zip32` test vectors.
3. $\star\star$ Implement a Pedersen commitment $[m] G + [r] H$
   over Jubjub in roughly 30 lines using the `jubjub` crate.
   Verify homomorphism: $\mathsf{Com}(m_1; r_1) + \mathsf{Com}
   (m_2; r_2) = \mathsf{Com}(m_1 + m_2; r_1 + r_2)$.

### 3.3 Week 3: Sapling, part 1 (protocol math)

**Goal**: write down the Spend and Output statements proved by
the Sapling circuit from memory.

Reading:

- [Chapter 04 (Sprout and Sapling)](./04-sprout-and-sapling.md).
- Protocol Specification, sections 4.3-4.4.4 (Sapling key
  components, Note Commitment Tree).
- The external `sapling-crypto` crate's `circuit` module.

Exercises:

1. $\star\star$ For a fresh Sapling spending key, derive the
   address for diversifier index 0 by hand (or in code) and
   encode it as bech32. Compare to `zcash_keys::keys` tests.
2. $\star\star$ Given a known valid Sapling output (from a
   test vector), trial-decrypt by hand following the chapter
   08 steps.
3. $\star\star\star$ Read `sapling-crypto/src/circuit/`. For
   each section of the Spend circuit, identify which clause of
   the statement in chapter 04 it implements.

### 3.4 Week 4: Sapling, part 2 (code and integration)

**Goal**: know exactly what the Sapling builder does end-to-end.

Reading:

- [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs).
- [`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs)
  (Sapling-related paths).
- [`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs)
  and
  [`zcash_proofs/src/prover.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/prover.rs).

Exercises:

1. $\star$ Run the Sapling builder tests. Pick one, add a debug
   print of the resulting `bvk`, and verify it equals the sum
   the binding signature checks against.
2. $\star\star$ Write a 30-line program that constructs a v4
   transaction with one Sapling output (sending to your own
   address) and prints the wire bytes. Use `MockTxProver`.
3. $\star\star\star$ Mutate one byte of `value_balance_sapling`
   in a serialised valid transaction. Re-parse. The
   `Transaction::read` should still succeed (no consensus
   check). What changes if you ask the bundle to verify its
   binding signature?

### 3.5 Week 5: Orchard, part 1 (protocol math)

**Goal**: write down the Action statement and justify why the
nullifier-chain trick works.

Reading:

- [Chapter 05 (Orchard and Halo 2)](./05-orchard-and-halo2.md).
- [ZIP 224](https://zips.z.cash/zip-0224).
- Protocol Specification, section 4.5.

Exercises:

1. $\star\star$ Show that with $\rho^{\text{new}} =
   \mathsf{nf}^{\text{old}}$, the probability that two distinct
   Action bundles produce two new notes with the same $\rho$ is
   negligible. (Hint: nullifier uniqueness.)
2. $\star\star$ For an Orchard bundle of $n$ Actions, write
   down the equation defining the binding-signature
   verification key.
3. $\star\star$ Why does Sinsemilla use incomplete addition
   and not complete addition? What is gained, and what must be
   checked to ensure soundness?

### 3.6 Week 6: Orchard, part 2 (Halo 2)

**Goal**: explain Halo 2 to a colleague: arithmetisation,
permutation, lookups, IPA, transcript.

Reading:

- The Halo 2 book (https://zcash.github.io/halo2/), chapters 1
  to 3 and the lookups chapter.
- The `orchard` crate's `circuit` module.
- Bowe, Grigg, Hopwood, *Halo* (ePrint 2019/1021).

Exercises:

1. $\star$ Skim the Halo 2 lookup-argument chapter. State the
   commitment of the prover and the soundness intuition in
   your own words.
2. $\star\star$ Inside `halo2_proofs` (external), find a small
   example circuit and trace one column's polynomial through
   commitment, evaluation, and verification.
3. $\star\star\star$ Sketch what would change in the Orchard
   integration if a new shielded pool added an extra field to
   each note. Which files? Which test vectors?

### 3.7 Week 7: keys, addresses, F4Jumble

**Goal**: implement UA parsing/decoding from scratch and
validate against `librustzcash`.

Reading:

- [Chapter 06 (Keys, addresses, ZIP 32)](./06-keys-addresses-zip32.md).
- [ZIP 32](https://zips.z.cash/zip-0032),
  [ZIP 173](https://zips.z.cash/zip-0173),
  [ZIP 316](https://zips.z.cash/zip-0316).
- [`components/f4jumble/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs)
  and
  [`components/zcash_address/src/kind/unified.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_address/src/kind/unified.rs).

Exercises:

1. $\star\star$ Implement F4Jumble in $\sim 80$ lines of Rust.
   Verify against the `f4jumble` test vectors.
2. $\star\star$ Build a Unified Address by hand from a Sapling
   and an Orchard receiver. Compare to a known-good UA.
3. $\star\star\star$ A user reports a UA whose first 10 and
   last 10 characters match the original UA but middle
   characters differ. Use the F4Jumble property to argue why
   this is implausible without a BLAKE2 collision.

### 3.8 Week 8: transactions and PCZT

**Goal**: understand the sighash tree well enough to debug an
invalid signature.

Reading:

- [Chapter 07 (Transactions and builder)](./07-transactions-and-builder.md).
- [ZIP 243](https://zips.z.cash/zip-0243),
  [ZIP 244](https://zips.z.cash/zip-0244), the draft NU7 ZIPs
  if relevant.
- [`zcash_primitives/src/transaction/txid.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs),
  [`zcash_primitives/src/transaction/sighash_v5.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/sighash_v5.rs).
- [`pczt/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/pczt/src/lib.rs).

Exercises:

1. $\star$ Locate the Sapling sighash sub-digest in
   `sighash_v5.rs`. Confirm it depends only on the Sapling
   bundle.
2. $\star\star$ Walk through a PCZT round trip: create,
   construct, prove (mock), sign, extract. Identify which
   fields each role mutates.
3. $\star\star\star$ Read the v6 sighash code under
   `zcash_unstable = "nu7"`. Identify what new content is in
   the digest tree compared to v5, and design a test that
   would catch a buggy implementation that forgets to include
   it.

### 3.9 Week 9: note encryption and scanning

**Goal**: build a minimal scanner.

Reading:

- [Chapter 08 (Note encryption)](./08-note-encryption.md).
- The external `zcash_note_encryption` crate.
- [`zcash_client_backend/src/scanning.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs),
  [`zcash_client_backend/src/decrypt.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/decrypt.rs).

Exercises:

1. $\star\star$ Given an `ivk` and a `lightwalletd`
   `CompactBlock` bytes blob, write a 100-line scanner that
   lists outputs the `ivk` can decrypt.
2. $\star\star$ Show that if a sender reuses an
   $\mathsf{esk}$ for two outputs to the same recipient, the
   recipient's $\mathsf{ivk}$ is recoverable. (Hint: two
   shared secrets at the same point + DLP relations.)
3. $\star\star\star$ Profile trial-decryption performance on a
   1000-output block. Identify the dominant cost and propose
   an optimisation.

### 3.10 Week 10: wallet stack and integration

**Goal**: comfortably contribute to wallet features.

Reading:

- [Chapter 10 (Wallet stack)](./10-wallet-stack.md).
- [`zcash_client_backend/src/data_api/wallet.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api/wallet.rs).
- A few migration files under
  [`zcash_client_sqlite/src/wallet/init/migrations/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_sqlite/src/wallet/init/migrations).

Exercises:

1. $\star$ Run the `zcash_client_sqlite` test suite. Pick one
   test, add a `println!` to trace a transaction round trip.
2. $\star\star$ Implement a tiny in-memory wallet on top of
   `zcash_client_memory` that tracks one Sapling account,
   scans a sequence of synthetic blocks, and reports balance
   and the unspent nullifier set.
3. $\star\star\star$ Propose a feature: "give me the diff
   between the proposal and what the builder actually
   emitted". Sketch the API and the tests that justify it.

### 3.11 Week 11: Equihash, history, consensus

**Goal**: be unsurprised by anything in the periphery.

Reading:

- [Chapter 09 (Equihash and consensus)](./09-equihash-and-consensus.md).
- [`components/equihash/src/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src).
- [`zcash_history/src/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_history/src).
- [ZIP 221](https://zips.z.cash/zip-0221).

Exercises:

1. $\star$ Run an Equihash verification on the genesis block.
2. $\star\star$ Build the MMR for the first 10 blocks (use
   mocked leaves). Verify a proof for block 5.
3. $\star\star\star$ Design a test for an MMR consistency
   property: any prefix of leaves yields a tree that is a
   valid restriction of the larger tree.

### 3.12 Week 12: first contribution

**Goal**: have at least one PR merged or filed and acknowledged.

Process:

1. Watch the GitHub issues for "good first issue" tags or
   low-hanging improvements.
2. Per `AGENTS.md`: discuss the change in an issue first; wait
   for a maintainer's acknowledgement.
3. Branch from `main` for a feature, or the earliest relevant
   `maint/` branch for a bugfix.
4. Run the full CI sequence locally.
5. Open the PR.

PR ideas:

- A documentation patch that fills a gap you found.
- A test vector you wrote during exercises that catches a
  missing edge case.
- An ergonomic improvement around proposal review.

### 3.13 Calibration after week 12

If after 12 weeks you cannot:

- ...write down the Sapling Spend statement from memory: redo
  week 3.
- ...explain why Pallas/Vesta is chosen for Halo 2: redo
  week 6.
- ...locate the file that computes a v5 sighash: redo week 8.
- ...trace a single output from a block through the scanner
  into storage: redo weeks 9 and 10.

There is no shortcut. The cryptography is dense, the
implementation is careful, and the consequences of a wrong
commitment or signature extend to real money.

### 3.14 Ongoing reading list

Always-open tabs:

- The Zcash Protocol Specification.
- The [ZIPs index](https://zips.z.cash/).
- The Halo 2 book.
- This onboarding directory.

Books worth owning:

- Hopwood et al., *Zcash Protocol Specification*.
- Boneh and Shoup, *A Graduate Course in Applied Cryptography*.
- Lindell (ed.), *Tutorials on the Foundations of Cryptography*.
- Joux, *Algorithmic Cryptanalysis*.
- Galbraith, *Mathematics of Public Key Cryptography*.

## 4. Failure modes

- **Reading without exercising.** A reader who skips the
  hands-on tasks ends up with a list of names rather than a
  working mental model. Recover by going back to week 1
  exercise 3.
- **Skipping the protocol spec.** The onboarding chapters cite
  the spec but do not replace it. A reader who never opens the
  protocol PDF will not be able to defend any non-trivial PR
  in review.
- **Treating `MockTxProver` as production-equivalent.**
  Chapter 15 explains why a locally generated SRS is unsound.
  Exercises that use `MockTxProver` must be feature-gated to
  tests.
- **Skipping calibration.** A reader who skips section 3.13
  enters the contribution stage with gaps that will surface
  on the first non-trivial review comment.
- **Opening a PR without discussing the issue first.** The
  `AGENTS.md` gate exists; see
  [Chapter 01b](./01b-build-test-contribute.md) and
  [Chapter 95](./95-pr-checklist.md). PRs without prior issue
  discussion get closed with a polite redirection.

## 5. Spec pointers

- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf):
  the single most-cited reference across the schedule.
- [ZIPs index](https://zips.z.cash/): every ZIP cited in
  weeks 5 to 9.
- [Halo 2 book](https://zcash.github.io/halo2/): the
  arithmetisation reference for week 6.
- [Bowe, Grigg, Hopwood, *Halo* (ePrint
  2019/1021)](https://eprint.iacr.org/2019/1021): the
  recursive-proof background for week 6.
- [AGENTS.md in
  `librustzcash`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md):
  the contribution-gate cited in section 3.12.

## 6. Exercises

The exercises are distributed across sections 3.1 through 3.12
above; this section enumerates the load-bearing self-tests that
must pass before declaring the schedule complete. At least one
of these must be answered by modifying code or adding a test;
exercise 3 below satisfies that.

1. **Walk the dispatch.** Open
   [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs)
   and trace which parser (`read_spend_v4` or
   `read_spend_v5`) is called for a v4 vs v5 transaction.
   Cite the call site.
2. **Verify a parameter hash.** Take the SHA-512 of
   `sapling-spend.params` from your local
   `~/.zcash-params/` directory and compare to
   `SAPLING_SPEND_HASH` in
   [`zcash_proofs/src/lib.rs#L49-L57`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L49-L57).
3. **Modify and test.** Pick one $\star\star\star$ exercise
   from sections 3.4, 3.6, 3.8, 3.10, or 3.11 above and
   produce the artefact. The artefact must compile (if code)
   or assemble into a clear test plan (if design). This is
   the "your final exam" exercise; it must be done before
   week 12.

### Answers in the code

The line ranges, parameter file hashes, and test vectors
underlying every exercise in this chapter live in the file paths
each weekly section already cites. The single best entry point
for a reader who gets stuck is the build-and-test loop in
[Chapter 01b](./01b-build-test-contribute.md); if you cannot run
the workspace tests locally, nothing else in this schedule will
work.

## 7. Further reading

- [Chapter 22 (Cryptographer code review)](./22-cryptographer-code-review.md):
  the review checklist that every PR is held to.
- [Chapter 95 (PR checklist)](./95-pr-checklist.md): the local
  commands and the `AGENTS.md` gate.
- [Chapter 96 (Dev cheatsheet)](./96-dev-cheatsheet.md): the
  single page of commands the contributor returns to.
- [Chapter 99 (Glossary)](./99-glossary.md): when a term in a
  paper or ZIP is unfamiliar, search here first.

Closing note: the `librustzcash` workspace is one of the better-
engineered cryptographic codebases in the wild. Type-safe by
default, deeply test-vector-driven, careful about every domain
separation. Treat that as the bar; do not lower it.
