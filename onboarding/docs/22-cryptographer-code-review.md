---
sidebar_position: 22
title: Cryptographer's code-review checklist
description: "The operational checklist for every crypto PR."
---

# 22 - Cryptographer's code-review checklist

## 1. Why this chapter exists

A reviewer of crypto-touching PRs in this workspace needs a
checklist that maps prior chapters to concrete diff-review actions.
This chapter distils chapters 12-20 (historical bugs, subgroup and
canonical-encoding pitfalls, constant-time programming, trusted
setups, audit findings, cross-impl testing) into items that can be
verified in a PR. Each item is framed as "if you see X, check Y"
so that the checklist can be applied mechanically while reading a
diff. Print it and keep it next to the PR review window.

## 2. Definitions

**Definition 2.1 (Subgroup membership).** Let $E$ be an elliptic
curve over a prime field, $\mathbb{G} \subset E$ the prime-order
subgroup of order $\ell$. A point $P \in E$ is subgroup-valid iff
$[\ell] P = \mathcal{O}_E$. The check is mandatory on points read
from the wire whenever the cofactor $h \neq 1$. For Jubjub
($h = 8$) and BLS12-381 $\mathbb{G}_2$ ($h$ large) the check is
explicit; for Pallas and Vesta, $h = 1$ and the check is implicit
(every encodable point already lies in $\mathbb{G}$). See
chapter 13.

**Definition 2.2 (Canonical encoding).** Let $T$ be a finite set
(field or group). An encoding map
$\mathsf{enc} : T \rightarrow \{0,1\}^{\ast}$ is canonical iff
$\mathsf{enc}$ is injective and the corresponding decoder
$\mathsf{dec}$ satisfies $\mathsf{dec}(s) \in T$ for exactly one
preimage $s$ per element. A non-canonical decoder accepts
multiple $s$ for a single $t \in T$, which is a malleability
source. In `pasta_curves` and `bls12_381`,
`PrimeField::from_repr` is the canonical decoder.

**Definition 2.3 (Constant-time function).** Let
$f : \{0,1\}^{\ast} \rightarrow \{0,1\}^{\ast}$ be a function
implemented by a program $P$. $P$ executes $f$ in constant time
iff the trace of operations (branch outcomes, memory addresses,
instruction count) on input $x$ is a function only of $|x|$ and
not of the bits of $x$. Required for any code handling secret
material; see chapter 14.

**Definition 2.4 (Domain separation).** Let $\mathcal{H}$ be a
keyed hash family. A scheme uses domain separation iff each
distinct invocation of $\mathcal{H}$ is keyed by a unique
personalisation string $D \in \{0,1\}^{\kappa}$. For BLAKE2b,
$\kappa = 128$ ($16$ bytes); for BLAKE2s, $\kappa = 64$
($8$ bytes). See chapter 16.

**Definition 2.5 (Authorisation typestate).** Let $\mathsf{B}$ be
a bundle type indexed by a phantom-typed parameter
$A : \mathsf{Authorization}$ that ranges over a finite set of
authorisation states (e.g. $\mathsf{Unauthorized}$,
$\mathsf{Authorized}$). The typestate discipline enforces, at
compile time, that operations $\mathsf{B}\langle A \rangle
\rightarrow \mathsf{B}\langle A' \rangle$ are admissible only for
permitted transitions $A \rightsquigarrow A'$. Sapling and
Orchard both instantiate the pattern.

**Definition 2.6 (Underconstrained advice cell).** In a Halo 2
circuit with advice columns $\mathbf{a}_1, \ldots, \mathbf{a}_m$,
an advice cell $\mathbf{a}_i(\omega^j)$ is underconstrained iff
no selector-gated gate $G \cdot q_{\mathrm{sel}} = 0$ references
it with a non-trivial coefficient. A malicious prover can assign
the cell arbitrarily without violating any constraint, breaking
soundness. Trail of Bits codified this as a recurring finding
class in the Orchard audit; see
[Trail of Bits publications](https://github.com/trailofbits/publications).

**Definition 2.7 (Trusted setup).** Let $C$ be a Groth16 circuit
of size $n$. A trusted setup is a pair of probabilistic
ceremonies (Powers of Tau plus a per-circuit phase) producing a
common reference string $\mathsf{CRS} \in \mathbb{G}_1^a \times
\mathbb{G}_2^b$ consumed by the verifier. Modifying $C$
invalidates the existing $\mathsf{CRS}$. For Sapling, the
ceremony outputs are pinned by their SHA-256 hashes in
[`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs);
see chapter 15.

## 3. The code: the checklist

Each item below cites the chapter that explains the underlying
discipline and, where applicable, the file that the check applies
to.

### 3.1 Group elements on the wire (chapter 13)

For every byte-slice-to-curve-point parse in the diff:

- [ ] Canonical encoding is enforced (`from_repr` / `from_bytes`
  returns `CtOption`, failure is propagated, not unwrapped).
- [ ] Subgroup membership is enforced
  (`SubgroupPoint::try_from` for Jubjub, `is_torsion_free` for
  BLS12-381, implicit for Pallas/Vesta).
- [ ] After parsing, the carried type is the subgroup type
  (`SubgroupPoint`, etc.), not the raw type.
- [ ] Re-serialisation produces the original bytes.

Search target: any new `from_bytes` or `read` function in a
bundle or description type.

### 3.2 Field elements on the wire (chapter 13)

- [ ] `PrimeField::from_repr` is used, not `from_repr_unchecked`.
- [ ] The result of `from_repr` is consumed via
  `into_option()` or equivalent, forcing failure handling.
- [ ] If the value is used as a scalar mul argument, the field
  matches the curve (Jubjub scalar $\mathbb{F}_{\ell_J}$ vs base
  $\mathbb{F}_r$, Pallas scalar vs base).

### 3.3 Domain separation (chapter 16)

- [ ] Every new hash invocation has its own personalisation tag.
- [ ] Personalisation is exactly $16$ bytes for BLAKE2b,
  $8$ bytes for BLAKE2s, zero-padded if shorter.
- [ ] No existing personalisation is reused for a new purpose.
- [ ] Personalisation strings include a version byte where
  future versions are foreseeable.

Search target:

```sh
grep -rn "personal\|Personal\|pers:" --include='*.rs' | grep -v test
```

### 3.4 Constant-time discipline (chapter 14)

For any code processing secret data:

- [ ] No `match` or `if` branching on a secret value.
- [ ] No `pow_vartime` or `mul_vartime` on a secret exponent or
  scalar.
- [ ] No `array[secret_index]` lookups.
- [ ] `subtle::Choice` and `CtOption` used for secret-dependent
  options.
- [ ] `ct_eq` instead of `==` for secret comparisons.
- [ ] New error types whose discriminant depends on a secret-
  derived condition are collapsed to a single variant.

### 3.5 Zeroization (chapter 14)

- [ ] All `SpendingKey`, `ExtendedSpendingKey`, `Rseed`, `Rcm`,
  `Rcv`, `Esk`, `Nsk` types implement (or transitively contain)
  `Zeroize`.
- [ ] `Drop` implementations are correct (no copies left
  behind).
- [ ] Long-lived secrets are stored in `Zeroizing<_>` wrappers.

### 3.6 Newtype discipline (chapter 06, chapter 09)

- [ ] No bare `u64` for a value (use `Zatoshis`).
- [ ] No bare `i64` for a signed value (use `ZatBalance`).
- [ ] No bare `u32` for a block height (use `BlockHeight`).
- [ ] No bare `[u8; 32]` for a hash that has a typed wrapper
  (`TxId`, `BlockHash`, etc.).

### 3.7 Authorisation typestate (chapter 07)

- [ ] New bundle methods preserve or correctly transition the
  `Authorization` parameter.
- [ ] `MapAuth` implementations update every authorisation slot,
  not just the obvious one.
- [ ] No downgrading from an authorised state to an unauthorised
  state.

### 3.8 Test vectors (chapter 20)

- [ ] New cryptographic primitives have test vectors.
- [ ] Vectors cover zero input, max input, near-zero boundary,
  near-modulus boundary.
- [ ] Vectors live in `<crate>/src/test_vectors.rs` or in the
  shared `zips/test-vectors/` directory.
- [ ] Round-trip tests verify `decode(encode(t)) == t`.

The transparent test vector pattern is in
[`zcash_transparent/src/test_vectors.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/test_vectors.rs).

### 3.9 Proptest (chapter 20)

- [ ] An `arb_<type>` strategy exists if the type is serialisable.
- [ ] The strategy covers the full domain, not just easy inputs.
- [ ] The strategy is exposed via the `test-dependencies` feature.

### 3.10 Failure modes the checklist must catch

Each item above prevents a specific failure class. The mapping:

| Class | Items |
| --- | --- |
| Money forgery | 3.1, 3.2, 3.4, 3.7, 3.17, 3.18 |
| Double-spend | 3.1, 3.18, 3.19 |
| Identity theft | 3.4, 3.18 |
| Privacy regression | 3.4, 3.5, 3.10, 3.20 |
| Compatibility break | 3.11, 3.12, 3.16, 3.17 |
| Operational drift | 3.21-3.25 |

If a PR cannot be mapped to one of these classes, the checklist
items in that row are the highest priority for the reviewer.

### 3.11 ZIP and spec references (chapter 19)

- [ ] The PR commit message references the relevant ZIP and
  protocol-spec section.
- [ ] The implementation matches the spec line by line. Open
  both windows while reviewing.
- [ ] If the PR adapts a draft ZIP, the ZIP version is pinned
  in the commit message.

### 3.12 Consensus rules (chapter 20)

- [ ] If the PR changes parsing, it does not tighten or loosen
  consensus checks. Parsing is permissive; consensus lives in
  Zebra and `zcashd`.
- [ ] If the PR changes the wallet's transaction construction,
  the result is consensus-valid. Verify against testnet when
  possible.
- [ ] BranchId-aware logic handles every relevant branch.

### 3.13 Feature flags (chapter 21)

- [ ] New code is appropriately gated by `transparent-inputs`,
  `orchard`, `sapling`, etc.
- [ ] In-flight work is behind `zcash_unstable = "nu7"` or
  equivalent.
- [ ] `--no-default-features` builds still pass.

### 3.14 Error types

- [ ] All new error enums are `non_exhaustive`.
- [ ] Error variants do not contain secret data (avoid
  `Error::BadKey(SpendingKey)`).
- [ ] `From` impls exist for natural error conversion across
  layer boundaries.

### 3.15 Documentation

- [ ] All public items have rustdoc.
- [ ] Error cases are documented in the doc comment.
- [ ] ZIP and spec references are markdown links.
- [ ] Cross-references use intra-doc-link syntax (``[`Foo`]``).

### 3.16 Serialisation discipline

- [ ] All serialised data has a version byte at the top level.
- [ ] No accidental derived `serde` serialisation on
  consensus-relevant types.
- [ ] The wire format matches the spec test vectors.

### 3.17 Trusted-setup parameters (chapter 15)

- [ ] SHA-256 hashes are checked against the hardcoded constants
  in
  [`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs).
- [ ] No code path can use unverified parameters.
- [ ] `MockTxProver` is gated to tests.

```rust reference title="zcash_proofs/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L60
```

### 3.18 Proof construction (chapter 04, chapter 05)

- [ ] Witness values are validated before being passed to the
  prover (in-circuit checks are sufficient but early range
  checks aid debugging).
- [ ] Public inputs match the circuit's expected encoding
  (order, bit-length, endianness).
- [ ] Verifying-key version matches the proving-key version.

### 3.19 Halo 2 circuit changes (chapter 17, chapter 24)

- [ ] Each new advice cell is constrained by at least one gate.
- [ ] Each new gate has a documented selector and the selector
  is correctly placed.
- [ ] Incomplete-addition uses always have a distinctness
  assertion (chapter 13).
- [ ] New lookups have correctly-built tables.
- [ ] The transcript absorbs every commitment before squeezing a
  challenge.

### 3.20 Privacy (chapter 18)

- [ ] No new public field exposes information that should be
  private (sender, recipient, value, memo).
- [ ] Dummy outputs and spends, where supported, are
  bit-by-bit indistinguishable from real ones.
- [ ] Network endpoints support Tor where appropriate.

### 3.21 Concurrency

- [ ] Shared state (commitment trees, nullifier sets) is updated
  atomically.
- [ ] No race condition between proposal selection and
  transaction build.
- [ ] Threading does not change scan output ordering observable
  to attackers.

### 3.22 Maintenance branches

- [ ] Bug fixes branch from the earliest relevant `maint/*`
  branch.
- [ ] Feature work branches from `main`.
- [ ] Forward-merges from `maint/*` into `main` are clean.

### 3.23 Crate boundaries

- [ ] No upward dependency (a lower crate must not depend on a
  higher crate).
- [ ] Cross-crate type identity is preserved (no shadow types).
- [ ] Public APIs of low-level crates are minimal: expose only
  what is needed.

The workspace crate list lives in the root
[`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml).

### 3.24 Performance

- [ ] No new $O(n^2)$ where the original was $O(n)$ in scan or
  build paths.
- [ ] Heavy operations (proving, scanning) remain off the UI
  thread (in async or background).
- [ ] Benchmarks are updated when public hot paths change.

### 3.25 CHANGELOG

- [ ] Public API changes are noted in the crate's
  `CHANGELOG.md`.
- [ ] The CHANGELOG change is in its own commit (per project
  rule).
- [ ] The change is described with motivation, not just the
  what.

### 3.26 CI

- [ ] All feature combinations pass.
- [ ] `cargo clippy --all-features --all-targets -- -D warnings`
  passes.
- [ ] `cargo fmt --all -- --check` passes.
- [ ] Doc-link validation passes (nightly).

The CI workflow definitions live in
[`.github/workflows`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows).

### 3.27 The smell test

Qualitative checks that the items above do not cover:

- Is anything new being added because we already wrote it?
  (Premature abstraction.)
- Do the comments explain "what" instead of "why"? Remove them.
- Is the change one logical commit, or several muddled together?
  Split.
- Does the diff include unrelated reformatting? Revert it.
- Does the test suite exercise the new code, or just compile it?

### 3.28 When to escalate

If you find:

- A potential consensus-breaking bug: disclose privately to the
  maintainers; do not file a public issue.
- A privacy regression that affects mainnet usage: same.
- A constant-time violation in a hot path: private disclosure is
  also appropriate.
- A clearly bad design choice that has not yet shipped: comment
  on the PR or open a discussion.

The maintainers' security disclosure process is at
<https://electriccoin.co/security/> (or `SECURITY.md` in this
repo).

### 3.29 Code-review pace

Crypto code is dense. A typical Zcash PR of ~$200$ lines may take
1-3 hours to review properly. If you find yourself reviewing in 10
minutes, you are not reviewing. The project's `AGENTS.md`
explicitly notes that the project prefers to "do it right" before
"make it fast"; match that bar.

### 3.30 The recovery posture

If you ship a bug:

1. Disclose internally as soon as you suspect.
2. Pull the affected release if possible.
3. Coordinate fix, audit, and re-test before re-release.
4. Public disclosure happens after mitigations are deployed.

The 2018 counterfeit bug (CVE-2019-7167; see chapter 12) is the
canonical playbook for the project: discovery, quiet fix,
coordinated migration, public disclosure.

## 5. Spec pointers

- [Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf):
  the normative reference for every clause the checklist asks
  you to verify. Open it alongside the diff.
- [ZIP 0](https://zips.z.cash/zip-0000): the meta-ZIP, defining
  the process the PR should follow when adding a consensus rule.
- [Electric Coin Co. security disclosure](https://electriccoin.co/security/):
  the escalation path for items 3.28 and 3.30.
- [Zcash community forum](https://forum.zcashcommunity.com/): the
  venue for non-private design discussion.
- [Trail of Bits Halo 2 / Orchard audit reports](https://github.com/trailofbits/publications):
  the source of the underconstrained-witness finding class that
  3.19 codifies.

## 6. Exercises

1. **Audit one PR.** Pick a merged PR from the
   [`librustzcash` PR queue](https://github.com/zcash/librustzcash/pulls?q=is%3Apr+is%3Amerged)
   that touches crypto code. Walk the checklist item by item;
   record which items applied and how the PR addressed them.
2. **Audit one open PR.** Repeat for an open PR. Note any items
   that the PR currently fails. Decide whether you would request
   changes and on what grounds.
3. **Locate an underconstrained-cell example.** Find one comment
   in the
   [`orchard`](https://github.com/zcash/orchard) or
   [`halo2`](https://github.com/zcash/halo2) repository referring
   to an underconstrained advice cell that was fixed. State the
   commit SHA and which audit firm flagged it.
4. **Map an item to a chapter.** For each of the 30 items above,
   identify the chapter in this course that explains the
   discipline. Confirm that no item lacks a chapter.

### Answers in the code

- Trusted-setup parameter hashes:
  [`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs).
- NU7 cfg gating:
  [`zcash_primitives/src/transaction/mod.rs#L80-L155`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/mod.rs#L80-L155).
- Transparent test vector pattern:
  [`zcash_transparent/src/test_vectors.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/test_vectors.rs).
- Workspace crate list:
  [`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml).
- CI workflows:
  [`.github/workflows`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/.github/workflows).

## 7. Further reading

- [chapter 11](./11-study-plan-and-exercises.md): the study plan
  that builds up to applying this checklist in earnest.
- [chapter 12](./12-historical-bugs.md): the historical incidents
  the checklist is calibrated against.
- [chapter 24](./24-circuits-constraint-by-constraint.md): the
  per-circuit clause walk that feeds item 3.19.
- [`AGENTS.md`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/AGENTS.md)
  in this repository: the project's own statement of review
  standards.
