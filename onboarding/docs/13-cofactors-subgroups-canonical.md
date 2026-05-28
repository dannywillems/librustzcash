---
sidebar_position: 13
title: Cofactors, subgroups, canonical encodings
description: "Jubjub cofactor 8, ZIP 216, subgroup checks."
---

# 13 - Cofactors, subgroups, canonical encodings

## 1. Why this chapter exists

Every Zcash bug involving curve points eventually reduces to one of
three primitives: a cofactor was not cleared, a subgroup membership
was not checked, or a non-canonical encoding was accepted. The bugs
are mathematically subtle and the engineering invariants are crisp;
the type system can carry the invariants when the deserialiser sets
them up correctly. A contributor who touches any `from_bytes` path
for a Jubjub or BLS12-381 point must understand each clause of ZIP
216 and the
[`read_value_commitment`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L90-L100),
[`read_cmu`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L104-L109),
and
[`read_rk`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L145-L150)
helpers in
[`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs).
Read this chapter, then re-read
[chapter 12](./12-historical-bugs.md) with new eyes.

## 2. Definitions

**Definition 2.1 (group order, prime-order subgroup, cofactor).**
Let $E(\mathbb{F}_p)$ be the group of points of an elliptic curve
over the prime field $\mathbb{F}_p$, including the identity
$\mathcal{O}$. Its order factors uniquely as
$$
\#E(\mathbb{F}_p) \;=\; h \cdot \ell,
$$
where $\ell$ is a large prime (the **subgroup order**) and
$h \in \mathbb{Z}_{>0}$ is a small integer (the **cofactor**). The
unique subgroup of $E(\mathbb{F}_p)$ of order $\ell$ is the
**prime-order subgroup**, denoted $E^{\circ} \subseteq
E(\mathbb{F}_p)$. All cryptographic operations in this workspace
are performed in $E^{\circ}$.

**Definition 2.2 (torsion subgroup).** For an integer
$m \in \mathbb{Z}_{>0}$, the **$m$-torsion** of $E$ is
$E[m] = \{P \in E(\overline{\mathbb{F}_p}) : [m]P = \mathcal{O}\}$.
The **non-trivial torsion** of $E(\mathbb{F}_p)$ relative to
$E^{\circ}$ is $E(\mathbb{F}_p) \setminus E^{\circ} \subseteq
E[h]$.

| Curve                       | Field                                    | Order              | Cofactor $h$ | Prime $\ell$ size |
| --------------------------- | ---------------------------------------- | ------------------ | ------------ | ----------------- |
| Jubjub                      | $\mathbb{F}_r$ (BLS12-381 scalar field)  | $8 \cdot \ell_{J}$ | **8**        | 252 bits          |
| BLS12-381 $\mathbb{G}_1$    | $\mathbb{F}_q$                           | $\cdot r$          | non-trivial  | 255 bits          |
| BLS12-381 $\mathbb{G}_2$    | $\mathbb{F}_{q^2}$                       | $\cdot r$          | huge         | 255 bits          |
| Pallas                      | $\mathbb{F}_p$                           | $q$                | **1**        | 255 bits          |
| Vesta                       | $\mathbb{F}_q$                           | $p$                | **1**        | 255 bits          |
| secp256k1                   | $\mathbb{F}_p$                           | $n$                | **1**        | 256 bits          |

Memorise: Jubjub has cofactor 8. Pallas and Vesta have cofactor 1.
BLS12-381 $\mathbb{G}_1, \mathbb{G}_2$ have non-trivial
subgroup-membership concerns even though they are pairing groups;
specific checks are required.

**Definition 2.3 (canonical encoding of a field element).** For
$x \in \mathbb{F}_p$, the **canonical encoding** of $x$ is the
little-endian byte string of the unique integer
$\tilde{x} \in [0, p)$ with $\tilde{x} \equiv x \pmod p$. A
byte string $b$ is **non-canonical** for $\mathbb{F}_p$ if
$b$ represents an integer $n \geq p$ with $n \equiv x \pmod p$
for some $x \in \mathbb{F}_p$.

**Definition 2.4 (small-subgroup attack).** Let
$a \in \mathbb{F}_\ell$ be Alice's secret scalar and
$B \in E(\mathbb{F}_p)$ be an adversarially chosen point. Write
$B = B^{\circ} + T$ with $B^{\circ} \in E^{\circ}$ and $T \in
E[h_T]$ for some $h_T \mid h$. Then
$$
[a] B \;=\; [a] B^{\circ} \;+\; [a] T \;=\;
[a] B^{\circ} \;+\; [a \bmod h_T]\, T.
$$
If any bit of $\mathsf{shared} = [a]B$ leaks (e.g. via a KDF
output observable to the attacker), the attacker recovers
$a \bmod h_T$. Repeating with $T$ of order each prime power
dividing $h$ recovers $a \bmod h$ by CRT. For Jubjub,
$h = 8 = 2^3$, so each successful query of this form leaks up to
3 bits of $a$.

**Invariant 2.5 (ZIP 216, canonical Jubjub element).** A 32-byte
sequence $\tilde{P}_{\text{enc}} \in \{0,1\}^{256}$ is a valid
encoding of a Jubjub point $P \in E^{\circ}_{\text{Jubjub}}$ if
and only if all of the following hold:

1. Strip the high bit of byte 31 as parity $s \in \{0, 1\}$; the
   remaining 255 bits encode $v \in \mathbb{F}_r$ canonically in
   the sense of Definition 2.3, with $v < r$.
2. Solve $u^2 = (v^2 - 1) / (d v^2 + 1) \in \mathbb{F}_r$. If
   $d v^2 + 1 = 0$ in $\mathbb{F}_r$, or no solution $u \in
   \mathbb{F}_r$ exists, reject.
3. Among the two solutions $\pm u_0$, choose $u = u_0$ if
   $\mathrm{lsb}(u_0) = s$, else $u = -u_0$. If $u_0 = 0$, the
   parity bit must be $0$ for canonical encoding.
4. The point $(u, v) \in E(\mathbb{F}_r)$ must lie in
   $E^{\circ}_{\text{Jubjub}}$.

Pre-NU5 code accepted some non-canonical encodings; ZIP 216
codifies the strict consensus rule.

## 3. The code

### 3.1 The Sapling deserialiser pattern

The Sapling component-reader in
[`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs)
shows the canonical pattern. Every Jubjub-point field has a
dedicated helper that enforces both canonical encoding and
subgroup membership (or notes that the latter is enforced later in
the verifier):

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L100
```

The call `ValueCommitment::from_bytes_not_small_order` is exactly
the ZIP 216 path: decode canonically, then enforce
`SubgroupPoint::try_from`. The wrapping `CtOption` carries failure
constant-time; the caller is responsible for converting `None` into
an `InvalidInput` error after the constant-time check completes.

The `read_cmu` helper omits the small-order test because the value
is already a field element (the extracted $u$-coordinate), not a
point:

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L102-L109
```

The `read_rk` helper defers the small-order check to
`SaplingVerificationContext::check_spend`, which runs after the
sighash and proof have been bound; canonical encoding is still
enforced here so two distinct wire encodings cannot produce the
same `rk`:

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L142-L150
```

### 3.2 Cofactor-clearing mitigations

Three approaches, used in combination depending on the curve:

1. **Multiply by the cofactor on receipt** ("cofactor clearing"):
   replace any received $P$ with $[h] P$. The result is in
   $E^{\circ}$ by construction.
2. **Subgroup membership check**: verify $[\ell] P = \mathcal{O}$.
   For Edwards curves this is the "small-order check"; for
   Weierstrass curves it is the explicit "scalar mul by $\ell$
   returns identity" test.
3. **Torsion-free encoding**: encode and decode only the
   prime-order subgroup, so off-subgroup points cannot be expressed
   on the wire.

In `librustzcash` and dependencies, the idiomatic patterns are:

```rust
// Jubjub: decode then explicitly convert
let ext = ExtendedPoint::from_bytes(&bytes).into_option()?;
let sub = SubgroupPoint::try_from(ext)?;  // subgroup check

// Pallas: cofactor is 1, but canonical encoding still required
let p = pallas::Affine::from_bytes(&bytes).into_option()?;
```

A point whose type is `SubgroupPoint` is guaranteed by the type
system to lie in $E^{\circ}$; this is a load-bearing type
invariant.

### 3.3 Why canonical encoding matters

If a parser accepts non-canonical encodings:

- The hash of the encoding is no longer a function of the value;
  two valid byte strings can hash to different things while
  representing the same group element. This breaks domain
  separation and Fiat-Shamir.
- Two transactions can be byte-distinct but semantically identical.
  TxId uniqueness fails. Memory-pool deduplication is undermined.

The `ff` crate's `PrimeField::from_repr` enforces canonical
encoding for $\mathbb{F}_p$ and returns `CtOption`. Code should
always check this:

```rust
let x = pallas::Base::from_repr(bytes).into_option()
    .ok_or(Error::NonCanonical)?;
```

`unwrap()` on a `CtOption` in any path that processes
attacker-controlled bytes is a code smell.

### 3.4 The full set of "untrusted points" in the workspace

Whenever a point is read from external bytes, both canonicalisation
and a subgroup check (for cofactor $> 1$ curves) are required.

**Sapling (Jubjub).**

- `cv` value commitments in Spend/Output descriptions.
- `rk` re-randomised spend keys.
- `epk` ephemeral public keys.
- $\mathsf{cm}^u$ note-commitment $u$-coordinates.
- `ak` in viewing key encoding.
- The anchor: a $u$-coordinate plus parity decoded at Merkle root
  level.

**Orchard (Pallas).**

- `cv`, `rk`, `epk`, `cmx`.
- Pallas has cofactor 1, so only canonical encoding must be
  checked; subgroup membership is automatic.

**BLS12-381 ($\mathbb{G}_1, \mathbb{G}_2$).**

- Groth16 proof elements $A \in \mathbb{G}_1$, $B \in \mathbb{G}_2$,
  $C \in \mathbb{G}_1$.

For BLS12-381 subgroup membership the obvious "multiply by $r$" is
expensive; the `bls12_381` crate exposes `is_torsion_free` which
uses an efficient endomorphism-based check. This must be invoked on
every proof element.

**secp256k1 (transparent).**

- Public keys (canonical compressed encoding).
- ECDSA signatures (canonical low-$s$ form, per ZIP 215).

### 3.5 The "extract" operations

Several Zcash primitives publish only the $u$-coordinate of a
Jubjub point (or $x$-coordinate for Pallas), not the full point.
Examples:

- $\mathsf{cm}^u$ is the $u$-coordinate of the note commitment.
- The Merkle hash output is extracted from a Pedersen-hash result.
- The Orchard nullifier is the $x$-coordinate of a specific point.

This is fine for **uniqueness**: two distinct subgroup points share
at most two equal $u$-coordinates, namely $(u, v)$ and $(u, -v)$.
For commitment purposes that is enough. When reconstructing a full
point from a published coordinate, the parity must be carried
separately; `extract_p` and `extract_p_bottom` are the relevant
functions.

### 3.6 Twisted Edwards arithmetic and the order-2 torsion

Jubjub is a twisted Edwards curve

$$
-u^2 + v^2 \;=\; 1 \;+\; d \, u^2 v^2.
$$

Two facts:

- **Strongly unified addition formula**: the same formula computes
  $P + Q$ for all $P, Q$ including $P = Q$ (doubling) and $P = -Q$
  (returns identity). This is one reason Edwards form is preferred
  for in-circuit work.
- **Order-2 torsion**: the points $(0, -1)$ and $(0, 1) =
  \mathcal{O}$ are notable. $(0, -1)$ has order 2 and is the
  annoying low-order point. A "point" decoded as $(0, -1)$ passes
  basic curve-equation checks but is a 2-torsion element outside
  $E^{\circ}$.

Pallas/Vesta are short Weierstrass curves $y^2 = x^3 + 5$. Doubling
and addition use distinct formulas; the **incomplete** addition
formula breaks when adding a point to itself or to its negative.
Sinsemilla (chapter 16) goes to great lengths to avoid these edge
cases in-circuit.

### 3.7 Constant-time considerations for subgroup checks

A subgroup check must be constant-time (no early termination) to
avoid timing leaks. Both `jubjub` and `bls12_381` crates implement
it that way. Helper functions that conditionally short-circuit on
"probably not in subgroup" tests are unsafe in any path touching
secret-dependent inputs.

When propagating failures, use `CtOption` and `subtle::Choice`
rather than `Result` to keep the failure path constant-time. The
codebase follows this consistently in low-level libraries;
higher-level wallet code is more relaxed because the inputs are
already constant-time-validated by the time they reach there.

### 3.8 The `ExtendedPoint` vs `SubgroupPoint` pattern

The `jubjub` crate splits:

- `ExtendedPoint`: an arbitrary Jubjub point in (X:Y:T:Z) coords.
- `SubgroupPoint`: a point provably in $E^{\circ}_{\text{Jubjub}}$.

`From<SubgroupPoint> for ExtendedPoint` is total. The other
direction requires `TryFrom`, returning
`Option<SubgroupPoint>` after a subgroup check.
`ExtendedPoint::from_bytes(bytes)` returns an `ExtendedPoint`; the
subgroup check is not automatic.

The mirror pattern in
[`pasta_curves`](https://github.com/zcash/pasta_curves) is that
`pallas::Point` is the full type (cofactor 1, equivalent to a
subgroup point already), with `from_bytes` enforcing canonical
encoding.

## 4. Failure modes

- **Missing subgroup check on `epk`.** Accepting an off-subgroup
  $\mathsf{epk}$ during note encryption lets the sender exfiltrate
  $\mathsf{ivk} \bmod 8$ per output. See chapter 12 section 5 and
  ZIP 216.
  > Caught by:
  > `zcash_primitives::transaction::tests::tx_read_write` in
  > `zcash_primitives/src/transaction/tests.rs` (parses a Canopy
  > v4 transaction whose Sapling OutputDescription contains a
  > canonical, subgroup-valid `epk`; the `read_output_v4` path
  > calls `jubjub::ExtendedPoint::from_bytes` and rejects
  > non-canonical or off-curve encodings). The deeper algebraic
  > assertion ($\mathsf{epk} \in E^{\circ}$) is enforced by the
  > Sapling verifier in the external `sapling-crypto` crate; no
  > workspace test exercises that path directly.
- **Missing canonical-encoding check.** Two distinct byte sequences
  representing the same group element will hash differently under
  any wire-byte-keyed hash, breaking transaction IDs and
  Fiat-Shamir transcripts.
  > Caught by: `zcash_encoding::tests::compact_size` in
  > `components/zcash_encoding/src/lib.rs` (the test asserts that
  > `CompactSize::read` returns `non-canonical CompactSize` on
  > inputs whose serialized form is shorter than the
  > non-canonical encoding presented), plus
  > `zcash_primitives::transaction::tests::tx_read_write` for the
  > full v4 round-trip.
- **`unwrap()` on `CtOption` over attacker bytes.** Even if the
  failure mode is "return None", calling `unwrap()` re-introduces
  a branch on a secret-derived boolean and can panic on
  adversarial input. Use `into_option().ok_or(...)`.
  > No automated test in this workspace. The pattern is enforced
  > by clippy and review on every reader function; there is no
  > regression test that fuzzes attacker bytes against every
  > deserialiser. Caught by audit only.
- **Conflating cofactor clearing with subgroup checking.**
  Multiplying by $h$ moves a point into $E^{\circ}$ but does not
  reject the original input; for consensus parsing both the
  validity of the source bytes and the resulting subgroup
  membership matter. Use the explicit `SubgroupPoint::try_from`
  pattern.
  > No automated test in this workspace. The type-level
  > separation between `jubjub::ExtendedPoint` and
  > `jubjub::SubgroupPoint` is enforced by the external `jubjub`
  > crate; this workspace inherits the discipline through type
  > signatures. Caught by audit only.
- **Reading a 2-torsion point as a public key.** Decoding $(0,
  -1)$ on Jubjub passes the curve-equation check and is a valid
  group element but has order 2. Any KDF derived from
  $[\mathsf{ivk}] (0, -1) = (0, -1)^{[\mathsf{ivk} \bmod 2]}$
  leaks the LSB of $\mathsf{ivk}$.
  > No automated test in this workspace. The small-order check
  > on `cv` and the deferred check on `rk` are exercised
  > end-to-end by Sapling verification in the external
  > `sapling-crypto` crate, not in this workspace. Caught by
  > audit only.
- **Variable-time inversion or doubling formulas.** Implementing
  the curve operations with non-constant-time inversion (e.g.
  Euclidean) leaks scalar bits via timing; chapter 14 covers this.
  > No automated test in this workspace. Constant-time field
  > inversion is the responsibility of the external `bls12_381`,
  > `jubjub`, and `pasta_curves` crates, which ship their own
  > `dudect`-style and `ctgrind`-style audits. Caught by audit
  > only.

## 5. Spec pointers

- [ZIP 216 (Require Canonical Jubjub Point Encodings)](https://zips.z.cash/zip-0216):
  the formal consensus rule cited in Invariant 2.5 above; clause
  4 (subgroup membership) is the load-bearing part.
- [ZIP 215 (Explicitly Defining and Modifying Ed25519 Validation
  Rules)](https://zips.z.cash/zip-0215): the analogous rules for
  secp256k1 signature canonicalisation.
- [Zcash Protocol Specification, section 5.4.9 (Group Hash into
  Jubjub)](https://zips.z.cash/protocol/protocol.pdf): the
  hash-to-curve construction the trapdoor-free generators rely on.
- [Zcash Protocol Specification, section 5.4.8.5 (Group Hash into
  Pallas)](https://zips.z.cash/protocol/protocol.pdf): same for
  Pallas.
- [Hopwood, Bowe et al., *Sapling design notes*](https://github.com/zcash/zips/blob/main/protocol/sapling.pdf):
  the historical rationale for Jubjub's cofactor and the small-
  order constraint on `cv` and `rk`.

## 6. Exercises

1. **Trace a subgroup check.** In
   [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs),
   identify the difference in policy between `read_value_commitment`
   (line 90) and `read_rk` (line 145). Why does one enforce
   small-order rejection here and the other defer it to the
   verification context?
2. **Grep the workspace.** Run
   `grep -r "is_torsion_free\|SubgroupPoint::try_from\|into_option" --include='*.rs'`
   and
   `grep -r "from_repr\|from_bytes_unchecked\|CtOption" --include='*.rs'`.
   List every site that decodes a curve point without one of these
   checks. Mark any such site as a candidate audit finding.
3. **Modify and test.** In a checkout, add a unit test under
   `zcash_primitives` that constructs a 32-byte string encoding the
   Jubjub point $(0, -1)$ (a 2-torsion element) and asserts that
   `read_value_commitment` rejects it. The test should pass (the
   read returns an `InvalidInput` error). Cite the public
   `ValueCommitment::from_bytes_not_small_order` entry point as
   the inner check.

### Answers in the code

- Sapling point readers (canonical + small-order policy):
  [`zcash_primitives/src/transaction/components/sapling.rs#L87-L150`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L150).
- The `SubgroupPoint` / `ExtendedPoint` type pattern lives in the
  external `jubjub` crate; see its docs for the `try_from`
  signature.
- The Pallas analogue (`pallas::Affine::from_bytes`) lives in
  [`pasta_curves`](https://github.com/zcash/pasta_curves).

## 7. Further reading

- [Chapter 14](./14-side-channels-and-constant-time.md): the
  constant-time discipline these checks must respect.
- [Chapter 16](./16-pedersen-hash-deep-dive.md): how the
  trapdoor-free generators on Jubjub are derived, with the
  cofactor-clearing step at the end.
- [Chapter 12](./12-historical-bugs.md): the subgroup-omission and
  non-canonical-encoding incidents that motivated ZIP 215 and ZIP
  216.
