# 22 - Cryptographer's code-review checklist

## Goal

A consolidated checklist of what to look for when reviewing any
crypto-touching PR in this workspace. Distilled from chapters 12-20:
historical bugs, subgroup/canonical-encoding pitfalls, constant-
time programming, trusted setups, audit findings, and cross-impl
testing. Print this and keep it next to your monitor.

The intent is **operational**: each item is something you can
verify in a PR diff. Many items are framed as "if you see X,
check Y".

## 1. Group elements on the wire

For every byte-slice parse-into-curve-point in the diff:

- [ ] **Canonical encoding** is enforced (`from_repr` / `from_bytes`
  returns `CtOption` and the failure case is propagated, not
  unwrapped).
- [ ] **Subgroup membership** is enforced (`SubgroupPoint::try_from`
  for Jubjub, `is_torsion_free` for BLS12-381, automatic for
  Pallas/Vesta because cofactor 1).
- [ ] After parsing, the carried type is the subgroup type
  (`SubgroupPoint`, etc.), not the raw type.
- [ ] Re-serialisation produces the original bytes.

Files particularly worth grepping when reviewing: any new
`from_bytes` or `read` function in a bundle / description type.

## 2. Field elements on the wire

- [ ] `PrimeField::from_repr` is used (not `from_repr_unchecked`).
- [ ] The check uses `into_option()` or `into_iter()` style that
  forces failure handling.
- [ ] If the result is used as a scalar mul argument, the field is
  the right one (Jubjub scalar field $\mathbb{F}_\ell$ vs Jubjub
  base field $\mathbb{F}_r$ - they are distinct).

## 3. Domain separation

- [ ] Every new hash invocation has its own personalisation tag.
- [ ] Personalisation is exactly 16 bytes (BLAKE2b) or 8 bytes
  (BLAKE2s), zero-padded if shorter.
- [ ] No existing personalisation is reused for a new purpose.
- [ ] Personalisation strings include a version byte where future
  versions are foreseeable.

Grep:

```sh
grep -r "personal\|Personal\|pers:" --include='*.rs' | grep -v test
```

## 4. Constant-time

For any code that processes secret data:

- [ ] No `match` or `if` branching on a secret.
- [ ] No `pow_vartime` or `mul_vartime` on a secret exponent /
  scalar.
- [ ] No `array[secret_index]` lookups.
- [ ] `subtle::Choice` and `CtOption` used for secret-dependent
  options.
- [ ] `ct_eq` instead of `==` for secret comparisons.

If the PR adds a new error type whose discriminant depends on a
secret-derived condition, that is a leak. Use a single error
variant for all secret-failure paths.

## 5. Zeroization

- [ ] All `SpendingKey`, `ExtendedSpendingKey`, `Rseed`, `Rcm`,
  `Rcv`, `Esk`, `Nsk` types implement (or transitively contain)
  `Zeroize`.
- [ ] Drop implementations are correct (no copies left behind).
- [ ] Long-lived secrets are stored in `Zeroizing<...>` wrappers.

## 6. Newtype discipline

- [ ] No bare `u64` for a value (use `Zatoshis`).
- [ ] No bare `i64` for a signed value (use `ZatBalance`).
- [ ] No bare `u32` for a block height (use `BlockHeight`).
- [ ] No bare `[u8; 32]` for a hash that has a typed wrapper
  (`TxId`, `BlockHash`, etc.).

## 7. Authorization typestate

- [ ] New bundle methods preserve or correctly transition the
  `Authorization` parameter.
- [ ] `MapAuth` implementations update every authorisation slot,
  not just the obvious one.
- [ ] No "downgrading" from an authorised state to an unauthorised
  state (semantic bugs).

## 8. Test vectors

- [ ] New cryptographic primitives have test vectors.
- [ ] Vectors include: zero input, max input, "near-zero" boundary
  inputs, "near-modulus" boundary inputs.
- [ ] Vectors live in `<crate>/src/test_vectors.rs` or in the
  shared `zips/test-vectors/`.
- [ ] Round-trip tests (`encode` then `decode` returns equal).

## 9. Proptest

- [ ] An `arb_<type>` strategy exists if the type is serialisable.
- [ ] The arb strategy covers the *full* domain (not just easy
  inputs).
- [ ] The strategy is exposed via the `test-dependencies` feature.

## 10. ZIP and spec references

- [ ] The PR's commit message references the relevant ZIP and
  protocol-spec section.
- [ ] The implementation matches the spec line by line (when
  reviewing, open both).
- [ ] If the PR adapts a new ZIP draft, the version of the ZIP is
  pinned in the comment.

## 11. Consensus rules

- [ ] If the PR changes parsing, it does *not* tighten or loosen
  consensus checks (parsing is permissive; consensus lives in
  Zebra / `zcashd`).
- [ ] If the PR changes the wallet's transaction construction, it
  must produce only consensus-valid transactions; verify against
  testnet if possible.
- [ ] BranchId-aware logic must handle all relevant branches.

## 12. Feature flags

- [ ] New code is appropriately gated by `transparent-inputs`,
  `orchard`, `sapling`, etc.
- [ ] In-flight work is behind `zcash_unstable = "nu7"` or
  similar.
- [ ] No-default-features builds still pass.

## 13. Error types

- [ ] All new error enums are non-exhaustive.
- [ ] Error variants do not contain secret data (avoid
  `Error::BadKey(SpendingKey)`).
- [ ] `From` impls exist for natural error conversion across
  layers.

## 14. Documentation

- [ ] All public items have rustdoc.
- [ ] Error cases are documented in the doc comment.
- [ ] ZIP / spec references are present as markdown links.
- [ ] Cross-references use backtick links (`[`Foo`]`).

## 15. Serialisation discipline

- [ ] All serialised data has a version byte at the top level.
- [ ] No accidental derived `serde` serialisation on
  consensus-relevant types.
- [ ] The wire format matches the spec test vectors.

## 16. Trusted-setup parameters

- [ ] SHA-256 hashes are checked against the hardcoded constants
  in `zcash_proofs`.
- [ ] No code path can use unverified parameters.
- [ ] `MockTxProver` is gated to tests.

## 17. Proof construction

- [ ] Witness values are validated before being passed to the
  prover (in-circuit checks are sufficient but range-checking
  early helps debug).
- [ ] Public inputs match the circuit's expected encoding (order,
  bit-length, endianness).
- [ ] Verifying-key version matches the proving-key version.

## 18. Halo 2 circuit changes

- [ ] Each new advice cell is constrained by at least one gate.
- [ ] Each new gate has a documented selector and the selector is
  correctly placed.
- [ ] Incomplete-addition uses always have a distinctness
  assertion.
- [ ] New lookups have correctly-built tables.
- [ ] Transcript absorbs every commitment before squeezing a
  challenge.

## 19. Privacy

- [ ] No new public field exposes information that should be
  private (sender, recipient, value, memo).
- [ ] Dummy outputs/spends, where supported, are bit-by-bit
  indistinguishable from real ones.
- [ ] Network endpoints support Tor where appropriate.

## 20. Concurrency

- [ ] Shared state (commitment trees, nullifier sets) is updated
  atomically.
- [ ] No race condition between proposal selection and transaction
  build.
- [ ] Threading does not change scan output ordering observable to
  attackers.

## 21. Maintenance branches

- [ ] Bug fixes branch from the earliest relevant `maint/*` branch.
- [ ] Feature work branches from `main`.
- [ ] Forward-merges from `maint/*` into `main` are clean.

## 22. Crate boundaries

- [ ] No upward dependency (a lower crate must not depend on a
  higher crate).
- [ ] Cross-crate type identity is preserved (no shadow types).
- [ ] Public APIs of low-level crates are *minimal*; expose only
  what is needed.

## 23. Performance

- [ ] No new $O(n^2)$ where the original was $O(n)$ in scan or
  build paths.
- [ ] Heavy operations (proving, scanning) remain off the UI
  thread (in async or background).
- [ ] Benchmarks updated when public hot paths change.

## 24. CHANGELOG

- [ ] Public API changes are noted in the crate's `CHANGELOG.md`.
- [ ] The CHANGELOG change is in its own commit (per project
  rule).
- [ ] The change is described with motivation, not just "what".

## 25. CI

- [ ] All feature combinations pass.
- [ ] `cargo clippy --all-features --all-targets -- -D warnings`
  passes.
- [ ] `cargo fmt --all -- --check` passes.
- [ ] Doc-link validation passes (nightly).

## 26. The smell test

A few qualitative gut checks:

- Is anything new being "added because we already wrote it"?
  (Premature abstraction.)
- Are the comments explaining "what" instead of "why"? Remove
  them.
- Is the change one logical commit, or several muddled together?
  Split.
- Does the diff include unrelated reformatting? Revert the
  unrelated parts.
- Does the test suite exercise the new code, or just compile it?

## 27. When to escalate

If you find:

- A potential consensus-breaking bug $\to$ disclose privately to
  the maintainers; do not file a public issue.
- A privacy regression that affects mainnet usage $\to$ same.
- A constant-time violation in a hot path $\to$ private disclosure
  is also appropriate.
- A clearly-bad design choice that has not yet shipped $\to$
  comment on the PR or open a discussion.

The maintainers' security disclosure process is at
https://electriccoin.co/security/ (or `SECURITY.md` in this
repo).

## 28. Code-review pace

Crypto code is dense. A typical Zcash PR of $\sim 200$ lines may
take 1-3 hours to review properly. If you find yourself reviewing
in 10 minutes, you are not reviewing.

The maintainers' standard is high: the project's `AGENTS.md`
states "Many people depend on these libraries and we prefer to
'do it right' the first time, then 'make it fast'". Match that.

## 29. The recovery posture

If you ship a bug:

1. Disclose internally as soon as you suspect.
2. Pull the affected release if possible.
3. Coordinate fix + audit + re-test before re-release.
4. Public disclosure happens after mitigations are deployed.

The 2018 counterfeit bug is the canonical playbook: discovery,
quiet fix, coordinated migration, public disclosure. Read the ECC
post-mortem if you want to see how it should look.

## What you should know after this chapter

- You have a concrete, item-by-item checklist for reviewing crypto
  PRs.
- The checklist condenses every chapter that came before.
- You know when to escalate vs comment.

## Closing remarks

This course was a tour of `librustzcash` as it exists in early
2026, with the operational and cryptographic context that a
principal engineer should internalise before merging serious code.

The protocol will evolve; the libraries will be refactored; new
proof systems will appear. The underlying discipline - careful
type-driven cryptography, conservative migration, deep test
coverage, public audits - is what makes this project worth being
part of. Honour it.

Welcome to Zcash.
