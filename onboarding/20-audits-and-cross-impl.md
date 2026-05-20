# 20 - Audits and cross-implementation testing

## Goal

This chapter does two things. First it surveys the *public audit
history* of Zcash and points you to the documents you should read.
Second it explains the *cross-implementation testing* practice that
underwrites consensus correctness across the Rust libraries here,
`zcashd` (the C++ reference implementation), and Zebra (the
alternative Rust full node).

## 1. The audit firms

Zcash has had reviews by, in rough chronological order:

- **NCC Group** (multiple engagements, 2016 onwards).
- **Trail of Bits** (Sapling, Orchard, Halo 2).
- **Least Authority** (Sapling, Orchard, ZSA).
- **Cure53** (cryptographic primitives).
- **Kudelski Security** (BLS12-381 and pairing-curve concerns).
- **Aumasson / Teserakt** (independent reviews).

Public reports are linked from the Electric Coin Co. and Zcash
Foundation websites. Read these before claiming to know what's
been reviewed.

## 2. Notable engagements

### NCC Group, Sapling (2018)

Reviewed the entire Sapling cryptographic stack, including
`bellman`, `bls12_381`, `jubjub`, and the Sapling circuit. The
report includes:

- Several findings on subgroup-check omissions.
- Findings on non-canonical encodings.
- Recommendations on constant-time implementations.
- The motivation for many of the ZIP 215 / 216 rules.

The findings were fixed before the Sapling activation. The report
is the canonical example of "find class of bugs $\to$ adopt
discipline $\to$ codify in ZIP" pattern.

### Trail of Bits, Orchard / Halo 2

Reviewed the Halo 2 proof system and the Orchard circuit. Findings
included:

- Incomplete-addition edge cases (chapter 17).
- Lookup-table soundness.
- Witness-encoding tightness.

Trail of Bits' "Audit Reports" repository archives these.

### Least Authority, ZSA (2024)

The Zcash Shielded Asset (ZSA) extension to Orchard. Findings
involved the new Sinsemilla-based "issuance" and burn flows
(chapter 21).

### Kudelski, Pairing-Curve Review (2018)

Specifically about BLS12-381 security parameters and subgroup
membership for $\mathbb{G}_2$ (which has historically had subtle
bugs in implementations).

## 3. Common audit findings (consolidated)

From reading these reports, the recurring categories:

1. **Subgroup checks missing** on points read from the wire (Jubjub
   and $\mathbb{G}_2$).
2. **Non-canonical encodings** accepted by parsers.
3. **Domain separation collisions**: two protocols using the same
   personalisation.
4. **Constant-time violations** in error paths, especially in
   `Option::ok_or` patterns over `CtOption`.
5. **Witness underconstrainedness** in circuits (Halo 2 advice
   cells not bound by a gate).
6. **Test vectors missing edge cases**: zero values, identity
   points, $\rho$ at boundary, max bit lengths.
7. **Toolchain dependencies**: a vendored upstream library lagging
   on a fixed bug.

This list is your "first pass" when reviewing a new feature.

## 4. The cross-implementation testing model

There are three implementations of Zcash consensus rules:

| Implementation | Language | Role |
| --- | --- | --- |
| `zcashd` | C++ | Historical reference; consensus-authoritative |
| Zebra | Rust | Modern reference; consensus-authoritative |
| `librustzcash` | Rust | Library; *not* consensus-authoritative |

The two full nodes (`zcashd` and Zebra) must produce identical
consensus decisions on every block. They share parts of their stack
(e.g. both use `sapling-crypto` and `orchard` for shielded
verification, both use `equihash` for PoW verification), so a bug
in this workspace would affect both.

### Differential testing

The practice: every consensus-significant change in `librustzcash`
must be re-tested against:

- **Mainnet sync**: a node using the changed library should sync
  mainnet identically to the canonical history.
- **Testnet sync**: same for testnet.
- **Regtest**: deterministic test chain for unit-test purposes.
- **Cross-impl test vectors**: shared between `zcashd`, Zebra, and
  `librustzcash`.

The CI infrastructure tests against these.

### Shared test vectors

A test vector is a tuple $(\text{input}, \text{expected output})$.
For Zcash:

- Transaction parse/serialise round trips for v4, v5, v6.
- Sighash computation for sample transactions across versions.
- BLAKE2b/Pedersen hash outputs for sample inputs.
- TxId for sample transactions.
- Address encoding/decoding.
- F4Jumble forward/inverse.

These live in `<crate>/src/test_vectors.rs` (auto-generated where
possible) and in the central `zips/test-vectors/` directory in the
`zcash/zips` repo. The latter is the inter-implementation
specification.

Adding a new test vector that catches a real bug is one of the most
valuable contributions a maintainer can make.

## 5. Property-based testing

`proptest` is used in this workspace for property-based testing.
Patterns:

- For each protocol type, a `arb_<type>` proptest strategy is
  defined behind `#[cfg(feature = "test-dependencies")]`.
- Round-trip serialisation tests verify
  `T == parse(serialise(T))` for arbitrary `T`.
- Builder invariants are checked over arbitrary inputs.

Example:

```rust
#[cfg(feature = "test-dependencies")]
pub fn arb_tx_id() -> impl Strategy<Value = TxId> { ... }

proptest! {
    #[test]
    fn txid_round_trip(t in arb_tx_id()) {
        let bytes = t.write_to_bytes();
        let parsed = TxId::read_from_bytes(&bytes).unwrap();
        assert_eq!(t, parsed);
    }
}
```

The `arb_*` strategies are exported via the `test-dependencies`
feature so downstream crates can re-use them for their own
proptests.

## 6. Test vectors specifically for cryptography

These are sanity-checks for the cryptographic primitives:

- **BLAKE2b/BLAKE2s vectors**: each personalisation has its own
  vector set.
- **Pedersen-hash vectors**: per domain (note commitment, Merkle
  hash, $\rho$ mixing).
- **Sinsemilla vectors**: per domain.
- **Note encryption round trips**: an `(ivk, ovk, output)` triple
  with expected decrypted plaintexts.
- **Key derivation vectors**: `(seed, path)` $\to$ derived keys.

When you add a new variant (new personalisation, new key path),
you must add the corresponding vectors. CI will catch the missing
vectors via the `expensive-tests` feature.

## 7. Fuzzing

A few crates have `cargo-fuzz` harnesses:

- Transaction parsing: feed random bytes to `Transaction::read`,
  expect no panics, no unsafe behaviour.
- Address parsing: feed random bytes to UA decoder.
- BLAKE2b: feed random bytes; output must match a reference
  implementation.

Look in `fuzz/` subdirectories of each crate (when present).

## 8. The `nu7` cfg flag

For in-flight network upgrades, the workspace uses `RUSTFLAGS='--cfg
zcash_unstable="nu7"'` to gate the new code. This lets the team:

- Develop the new transaction format and consensus rules.
- Run tests against the upcoming activation.
- Keep stable releases unaffected.

Testing the `nu7` variant requires explicitly setting the cfg flag.
CI runs both with and without.

## 9. Production-readiness checklist

Before a feature reaches production:

1. Spec drafted (often a ZIP).
2. Test vectors generated and reviewed.
3. Implementation in `librustzcash` behind a cfg flag.
4. Implementation in Zebra behind a feature flag.
5. Cross-impl test of identical consensus decisions.
6. External audit covering the new code paths.
7. Testnet activation with monitoring.
8. Mainnet activation at a coordinated height.

This is the rhythm. New work happens behind flags; production
release follows audits and testnet runs.

## 10. The role of `lightwalletd`

`lightwalletd` (separate repo) is the gRPC gateway used by light
wallets. It is *not* a consensus node; it pre-processes blocks
from a full node into compact form. Bugs in `lightwalletd` do not
affect consensus but can affect wallet correctness and privacy:

- Selectively withholding outputs would let an attacker know which
  outputs a target wallet sees.
- Buggy compaction could drop outputs entirely.

Light wallets typically connect to multiple `lightwalletd`
instances and cross-check.

## 11. Vendored audits in the repo

Some audits result in code-level annotations. Look for comments
referencing "NCC", "audit finding", "Trail of Bits", etc. These
annotations are not common but exist; they often mark code that
was specifically changed in response to a finding.

## 12. How to read an audit report critically

When you read a public audit report:

1. **Severity != impact**: a "low-severity" finding can become
   high-impact after composition with other code.
2. **"Fixed" != "tested"**: confirm the fix has a test that would
   fail on the unfixed code.
3. **Scope**: an audit covers a specific commit and a specific set
   of files. Changes after the audit are not audited.
4. **Conclusions**: don't skip the "limitations" section. Auditors
   typically state what they did *not* look at.

## 13. Reproducing test vector generation

Many vectors are generated by `python` or `rust` scripts in the
`zips` repo. The generator scripts are committed alongside the
vectors. To regenerate (e.g. when the spec changes), run the
script; commit both the script change and the new vectors in the
same commit.

This discipline keeps the vectors traceable. If a vector is
"hand-edited", it loses provenance.

## 14. Cross-impl regression testing

When you change a crate that exports consensus-significant logic:

1. Identify the corresponding test vectors.
2. Run the test suite locally.
3. Pull Zebra; verify their tests still pass with your changes
   in `librustzcash`.
4. (Optional, for big changes) Run a partial mainnet sync.

This is the bar for consensus-touching PRs.

## 15. Performance benchmarks

Benchmarks are not strictly part of audit/testing but matter for
production:

- `criterion`-based benchmarks for proving and verification.
- Throughput tests for the scanner.

When a perf regression appears, the audit-trail discipline
applies: bisect, identify the offending commit, evaluate trade-off.

## What you should know after this chapter

- Where the public audit reports live.
- The patterns audits keep finding.
- The cross-implementation testing model and the role of test
  vectors.
- The `nu7` cfg flag and feature-flag discipline.
- That `librustzcash` is a library and *not* the consensus
  authority.

Next: active research and the upcoming network upgrades.
