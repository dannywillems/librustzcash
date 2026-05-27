---
sidebar_position: 20
title: Audits and cross-implementation testing
description: "Public audit reports, test vectors, Zebra/zcashd parity."
---

# 20 - Audits and cross-implementation testing

## 1. Why this chapter exists

A contributor changing consensus-significant code in this workspace
needs to know two things: which audits already cover the surrounding
code, and how the change will be validated against the C++ reference
node `zcashd` and the alternative Rust node Zebra. This chapter
surveys the public audit history of Zcash, lists the recurring
finding categories, and explains the cross-implementation testing
practice that underwrites consensus correctness across the three
implementations. The relevant integration test scaffolding lives in
[`zcash_primitives/src/transaction/tests`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/tests)
and the shared vectors live in the external
[`zcash/zips`](https://github.com/zcash/zips) repository under
`zip-XXXX/test-vectors/`.

## 2. Definitions

**Definition (Public audit report).** A document published by a
third-party security firm that records the scope, methodology,
findings, and remediation status of a security review of a
specific code commit. Public reports include the commit SHA they
reviewed; anything merged after that SHA is out of scope.

**Definition (Differential testing).** Two or more implementations
of the same specification are run on the same inputs and their
outputs compared. For Zcash, the canonical inputs are blocks and
transactions; the canonical outputs are accept/reject decisions
and recomputed digests.

**Definition (Test vector).** A tuple
$(\text{input}, \text{expected output})$ that pins one specific
input-output pair from the specification. Vectors are
implementation-independent: any conforming implementation must
produce the expected output. Vectors that catch real bugs are
among the most valuable contributions a reviewer can make.

**Definition (Cross-implementation test vector).** A test vector
published in the
[`zcash/zips`](https://github.com/zcash/zips) repository (typically
under `zip-XXXX/test-vectors/`) that all conforming implementations
consume verbatim. The format is fixed so the same JSON or CSV file
loads into Rust, C++, and other languages.

**Definition (Consensus-authoritative vs library).** Two of the
three implementations (`zcashd` and Zebra) are consensus-authoritative:
their accept/reject decisions on mainnet blocks define what the
network considers valid. This workspace is a library: it provides
parsing, building, scanning, and proving utilities, but does not
decide whether a block is part of the chain.

**Definition (Feature gate `zcash_unstable`).** A Rust cfg flag
used to enable in-flight network-upgrade code paths.
`RUSTFLAGS='--cfg zcash_unstable="nu7"'` activates the v6
transaction format and other NU7 hooks; CI runs builds and tests
both with and without the flag.

## 3. The code

### 3.1 The audit firms and their engagements

Public reviews of Zcash, in approximate chronological order:

| Firm | Subject | Year |
| --- | --- | --- |
| NCC Group | Sapling stack (`bellman`, `bls12_381`, `jubjub`, circuit) | 2018 |
| Trail of Bits | Halo 2 proof system and Orchard circuit | 2020-21 |
| Least Authority | Sapling, Orchard, ZSA | various |
| Cure53 | Cryptographic primitives | various |
| Kudelski Security | BLS12-381 and pairing-curve concerns | 2018 |
| Aumasson / Teserakt | Independent reviews | various |

Reports are linked from the
[Electric Coin Co. security page](https://electriccoin.co/security/)
and the
[Zcash Foundation publications](https://www.zfnd.org/audits/).

### 3.2 Differential testing model

There are three implementations of Zcash consensus rules:

| Implementation | Language | Role |
| --- | --- | --- |
| `zcashd` | C++ | Historical reference; consensus-authoritative |
| Zebra | Rust | Modern reference; consensus-authoritative |
| `librustzcash` | Rust | Library; not consensus-authoritative |

The two full nodes (`zcashd` and Zebra) must produce identical
consensus decisions on every block. They share parts of their
stack: both use
[`sapling-crypto`](https://github.com/zcash/sapling-crypto) and
[`orchard`](https://github.com/zcash/orchard) for shielded
verification, both use
[`components/equihash`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/equihash/src)
for PoW verification. A bug in those shared crates would affect
both nodes simultaneously.

A consensus-significant change in this workspace must be re-tested
against:

- **Mainnet sync**: a node using the changed library should sync
  mainnet identically to the canonical history.
- **Testnet sync**: same for testnet.
- **Regtest**: deterministic test chain for unit-test purposes.
- **Cross-impl test vectors**: shared between `zcashd`, Zebra, and
  this workspace.

### 3.3 Shared test vectors

The transaction-level test suite consumes shared vectors:

```rust reference title="zcash_primitives/src/transaction/tests.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/tests.rs#L1-L40
```

The categories of vectors that live in this workspace and the
`zcash/zips` repo:

- Transaction parse/serialise round trips for v4, v5, and (NU7)
  v6.
- Sighash computation for sample transactions across versions.
- BLAKE2b/Pedersen hash outputs for sample inputs.
- TxId computation for sample transactions.
- Address encoding/decoding (Sapling, Orchard, Unified,
  Transparent).
- F4Jumble forward/inverse.
- Note encryption round trips: `(ivk, ovk, output)` triples with
  expected decrypted plaintexts.
- Key derivation vectors: `(seed, path)` mapping to derived keys.

Test vector files in this workspace:

```rust reference title="zcash_transparent/src/test_vectors.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/test_vectors.rs#L1-L40
```

### 3.4 Property-based testing

`proptest` is used in this workspace for round-trip and invariant
testing. The pattern: each protocol type exposes an
`arb_<type>` strategy behind `#[cfg(feature = "test-dependencies")]`,
and a `proptest!` block asserts a property over arbitrary inputs.

Example pattern (illustrative; locations vary per crate):

```rust
#[cfg(feature = "test-dependencies")]
pub fn arb_tx_id() -> impl Strategy<Value = TxId> { /* ... */ }

proptest! {
    #[test]
    fn txid_round_trip(t in arb_tx_id()) {
        let bytes = t.write_to_bytes();
        let parsed = TxId::read_from_bytes(&bytes).unwrap();
        assert_eq!(t, parsed);
    }
}
```

The `arb_*` strategies are exposed via the `test-dependencies`
feature so downstream crates can reuse them. The
[`zcash_protocol`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol)
crate is one source.

### 3.5 Fuzzing

A few crates have `cargo-fuzz` harnesses for parsers whose input
comes from the network:

- Transaction parsing: feed random bytes to `Transaction::read`,
  expect no panics and no unsafe behaviour.
- Address parsing: feed random bytes to the Unified Address
  decoder.
- BLAKE2b: feed random bytes; output must match a reference
  implementation.

Look for `fuzz/` subdirectories per crate when present.

### 3.6 The `zcash_unstable` feature gate

For in-flight network upgrades, this workspace uses
`RUSTFLAGS='--cfg zcash_unstable="nu7"'`. The gating is visible at
the transaction enum level:

```rust reference title="zcash_primitives/src/transaction/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L80-L155
```

CI runs both with and without the flag so that the stable build
never accidentally depends on unstable code.

### 3.7 Recurring audit finding categories

From reading the public reports, the recurring categories:

1. **Subgroup checks missing** on points read from the wire (Jubjub
   and $\mathbb{G}_2$). See chapter 13.
2. **Non-canonical encodings** accepted by parsers. Codified by
   ZIP 216 for Jubjub.
3. **Domain separation collisions**: two protocols using the same
   personalisation string. See chapter 16.
4. **Constant-time violations** in error paths, especially
   `Option::ok_or` patterns over `CtOption`. See chapter 14.
5. **Witness underconstrainedness** in circuits: Halo 2 advice
   cells not bound by any gate.
6. **Test vectors missing edge cases**: zero values, identity
   points, $\rho$ at boundary, maximum bit lengths.
7. **Toolchain drift**: a vendored upstream library lagging on a
   fixed bug.

This list is the first pass when reviewing a new feature.

### 3.8 Reading an audit report critically

A few discipline notes when reading a public report:

- Severity is not impact: a "low-severity" finding can become
  high-impact after composition with other code.
- "Fixed" does not imply "tested": confirm the fix has a test
  that would fail on the unfixed code.
- Scope is bounded: an audit covers a specific commit and a
  specific file set. Changes after the audit are not audited.
- Limitations matter: auditors typically state what they did not
  look at. Do not skip that section.

### 3.9 The role of `lightwalletd`

[`lightwalletd`](https://github.com/zcash/lightwalletd) is the gRPC
gateway used by light wallets. It is not a consensus node; it
pre-processes blocks from a full node into compact form. Bugs in
`lightwalletd` do not affect consensus but can affect wallet
correctness and privacy: a malicious or buggy server could
selectively withhold outputs, dropping them entirely or revealing
which outputs a target wallet sees. Light wallets typically
connect to multiple endpoints and cross-check.

### 3.10 Cross-impl regression workflow

When changing a crate that exports consensus-significant logic:

1. Identify the corresponding test vectors and run the local
   suite.
2. Run the workspace tests:
   `cargo test --workspace --all-features`.
3. Pull Zebra and confirm its tests still pass when its
   dependency on the changed crates is updated.
4. (Optional, for large changes) run a partial mainnet sync.

This is the bar for consensus-touching PRs.

## 4. Failure modes

- **Skipped vectors after a refactor.** A rename of a struct field
  can disable a vector silently if the test reads the field by
  name through `serde`. Always re-run the full test suite after
  any field rename, with all features enabled.
- **Test vector generated by hand.** A vector edited manually loses
  provenance. Always commit the generator script alongside the
  vector; if the vector changes, the generator must change in the
  same commit.
- **Audit scope drift.** A function audited at commit $A$ that is
  rewritten at commit $B$ is no longer audited. Surface this
  explicitly in PR review for any function the audit report
  named.
- **Cross-impl divergence under `nu7`.** A new field added under
  `zcash_unstable = "nu7"` that is consumed by Zebra but not
  by `zcashd` (or vice versa) creates a consensus split at
  activation. Coordinate via the ZIP draft.
- **Light wallet trust without cross-check.** A wallet that uses
  a single `lightwalletd` instance has no defence against selective
  withholding. The
  [`zcash_client_backend`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend)
  API lets the embedder configure multiple endpoints; the
  embedder is responsible for using them.
- **Missing edge-case vectors.** Vectors that exercise only the
  happy path will not catch encoding-boundary bugs (max-modulus
  field elements, identity points, length-zero inputs).
- **Performance regression masquerading as test pass.** Tests that
  succeed but become 10x slower indicate either a hidden hot
  path or a benchmark regression. Tracked separately via
  `criterion` benchmarks.

## 5. Spec pointers

- [Electric Coin Co. security page](https://electriccoin.co/security/):
  the authoritative index of public audit reports linked to the
  ECC organisation.
- [Zcash Foundation audits page](https://www.zfnd.org/audits/):
  the parallel index for ZF-commissioned reviews.
- [NCC Group public reports](https://research.nccgroup.com/):
  searchable archive; filter for "Zcash" or "Sapling".
- [Trail of Bits "Publications"](https://github.com/trailofbits/publications):
  source of the Halo 2 / Orchard reports.
- [`zcash/zips` test-vectors directory](https://github.com/zcash/zips):
  the cross-implementation test vector source.
- [Zebra repository](https://github.com/ZcashFoundation/zebra):
  the alternative Rust full node. Its tests are the parity
  check against this workspace.
- [`zcashd` repository](https://github.com/zcash/zcash): the C++
  reference node. Consensus-authoritative; consult when in doubt.

## 6. Exercises

1. **Find an audit finding in code.** Pick one published Sapling
   or Orchard audit report. For one of its findings, locate the
   commit in this workspace (or in `sapling-crypto` /
   `orchard`) that addressed it. Cite the commit SHA. State the
   class of error the finding belonged to from Section 3.7.
2. **Add a test vector.** In a checkout, pick one transaction-
   parsing case in
   [`zcash_primitives/src/transaction/tests.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/tests.rs)
   that lacks an edge-case vector (e.g. an empty Sapling bundle).
   Add the vector. Verify the test still passes.
3. **Run the cross-impl suite.** Run
   `cargo test --workspace --all-features` and identify any test
   that uses cross-impl vectors (look for files loaded from
   `test_vectors/` directories). For one such test, locate the
   matching vector file in `zcash/zips` and confirm the content
   matches.
4. **Exercise the `nu7` cfg.** Run the workspace tests once
   without the flag and once with
   `RUSTFLAGS='--cfg zcash_unstable="nu7"'`. Note any test
   that is gated by the flag. Cite the file and line range where
   the gate appears.

### Answers in the code

- Transaction test entry:
  [`zcash_primitives/src/transaction/tests.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/tests.rs).
- Transparent test vectors:
  [`zcash_transparent/src/test_vectors.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/test_vectors.rs).
- NU7 transaction gating:
  [`zcash_primitives/src/transaction/mod.rs#L80-L155`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L80-L155).

## 7. Further reading

- [chapter 12](./12-historical-bugs.md): the historical bug
  timeline that frames many of the audit findings.
- [chapter 14](./14-side-channels-and-constant-time.md): the
  constant-time discipline behind several recurring audit
  findings.
- [chapter 21](./21-active-research-and-nu7.md): the NU7 audit
  plan and ZSA review status.
- The Trail of Bits "Manticore" and "Slither" tooling pages
  show how some auditors approach Rust code review; useful
  background even though they target other languages primarily.
