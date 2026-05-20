# 13 - Cofactors, subgroups, canonical encodings

## Goal

This is the "low-level cryptography" chapter. Every Zcash bug
involving curve points eventually reduces to one of:

1. A cofactor was not cleared.
2. A subgroup membership was not checked.
3. A non-canonical encoding was accepted.

The bugs are mathematically subtle, the engineering invariants are
crisp, and the type system can carry the invariants. Read this
chapter, then re-read chapter 12 with new eyes.

## 1. Group orders, subgroups, cofactors

Let $E(\mathbb{F}_p)$ be an elliptic curve over a prime field. Its
order (number of points including the identity) is

$$
\#E(\mathbb{F}_p) \;=\; h \cdot \ell,
$$

where $\ell$ is a large prime and $h$ is a small integer called the
**cofactor**. The unique subgroup of order $\ell$ is the
**prime-order subgroup**, denoted $E^{\circ}$. We work cryptographically
in $E^{\circ}$.

Points in $E \setminus E^{\circ}$ are called **torsion points** (more
precisely, $h$-torsion). They are the "rest" of the group: small-order
points whose orders divide $h$.

| Curve | Field | Order | Cofactor $h$ | Prime $\ell$ size |
| --- | --- | --- | --- | --- |
| Jubjub | $\mathbb{F}_r$ (BLS12-381 scalar field) | $8 \cdot \ell_{\text{J}}$ | **8** | 252 bits |
| BLS12-381 $\mathbb{G}_1$ | $\mathbb{F}_q$ | $\cdot r$ | non-trivial | 255 bits |
| BLS12-381 $\mathbb{G}_2$ | $\mathbb{F}_{q^2}$ | $\cdot r$ | huge | 255 bits |
| Pallas | $\mathbb{F}_p$ | $q$ | **1** | 255 bits |
| Vesta | $\mathbb{F}_q$ | $p$ | **1** | 255 bits |
| secp256k1 | $\mathbb{F}_p$ | $n$ | **1** | 256 bits |

**Memorise**: Jubjub has cofactor 8. Pallas and Vesta have cofactor 1.
BLS12-381 $\mathbb{G}_1, \mathbb{G}_2$ have non-trivial subgroup-
membership concerns even though they are pairing groups; specific
checks are required.

## 2. Why cofactor matters

### Small-subgroup attacks

Suppose Alice has secret $a \in \mathbb{F}_\ell$ and computes
$\mathsf{shared} = [a] B$ for a bad Bob who sends a point $B$ outside
$E^{\circ}$. Write $B = B^{\circ} + T$ where $T$ has small order $h_T
\mid h$. Then

$$
[a] B \;=\; [a] B^{\circ} \;+\; [a] T \;=\; [a] B^{\circ} \;+\; [a \bmod h_T] T.
$$

The second summand only depends on $a \bmod h_T$. If Alice somehow
reveals $\mathsf{shared}$ or anything derived deterministically from
it (a hash, an encryption with $\mathsf{shared}$ as key), Bob learns
$a \bmod h_T$. By repeating with different small-order $T$ values for
each of the prime factors of $h$, Bob recovers $a \bmod h$ entirely.

For Jubjub, $h = 8 = 2^3$. The attacker learns $a \bmod 8$ - 3 bits.
Not catastrophic per single output, but for a wallet that uses the
same $\mathsf{ivk}$ for thousands of outputs, 3 bits per output
becomes total recovery of $\mathsf{ivk}$.

### Mitigations

Three approaches, used in combination:

1. **Multiply by the cofactor on receipt** ("cofactor clearing"):
   replace any received point $P$ with $[h] P$. The result is in
   $E^{\circ}$ by construction.

2. **Subgroup membership check**: verify that the received $P$
   satisfies $[\ell] P = \mathcal{O}$. For Edwards curves this is
   sometimes called the "small-order check"; for Weierstrass curves it
   is the explicit "scalar mul by $\ell$ returns identity" test.

3. **Use a torsion-free encoding**: encode and decode only the
   prime-order subgroup, so off-subgroup points cannot be expressed
   on the wire. (This is the approach for BLS12-381 with the
   "Pippenger-friendly" subgroup encoding.)

In `librustzcash` and its dependencies, the patterns are:

```rust
// Jubjub: decode then explicitly convert
let ext = ExtendedPoint::from_bytes(&bytes).into_option()?;
let sub = SubgroupPoint::try_from(ext)?;  // subgroup check
```

```rust
// Pallas: cofactor is 1, but canonical encoding still must be checked
let p = pallas::Affine::from_bytes(&bytes).into_option()?;
```

A point whose type is `SubgroupPoint` is *guaranteed* by the type
system to be in $E^{\circ}$; this is a load-bearing type invariant.

### The exact Jubjub validation in Zcash

ZIP 216 (canonical-Jubjub-element encoding consensus rule, active
since NU5):

A 32-byte sequence is a valid encoding of a Jubjub point if and only if:

(a) The high bit encodes the parity of $u$.
(b) The lower 255 bits encode $v \in \mathbb{F}_r$ canonically (i.e.
    $v < r$, in little-endian).
(c) The curve equation $-u^2 + v^2 = 1 + d u^2 v^2$ has a solution
    $u$ with the matching parity.
(d) The resulting point lies in the prime-order subgroup.

Each clause is enforced by code; together they make the
encoding/decoding bijection between 32-byte strings (modulo a
specified set of "invalid" sequences) and $E^{\circ}$.

## 3. Why canonical encoding matters

A field element $x \in \mathbb{F}_p$ is canonically encoded as the
little-endian byte string of the unique integer in $[0, p)$
representing $x$. A non-canonical encoding would be any byte string
representing an integer $\geq p$ but congruent to $x$ modulo $p$.

If a parser accepts non-canonical encodings:

- The hash of the encoding is no longer a function of the value;
  two valid byte strings can hash to different things while
  representing the same group element. This breaks domain separation
  and Fiat-Shamir.
- Two transactions can be technically distinct (different bytes) but
  semantically identical. TxId uniqueness fails. Memory pool
  deduplication is undermined.

Therefore: **always reject non-canonical encodings on the wire**.

The `ff` crate's `PrimeField::from_repr` enforces canonical
encoding for $\mathbb{F}_p$ and returns `CtOption` (constant-time
option) signalling failure. Code should always check this:

```rust
let x = pallas::Base::from_repr(bytes).into_option()
    .ok_or(Error::NonCanonical)?;
```

The pattern `unwrap()` on `CtOption` is a code-smell in any path that
processes attacker-controlled bytes.

## 4. The full set of "untrusted points" in this codebase

Whenever you read a point from external bytes, you must canonicalise
*and* subgroup-check (for cofactor $> 1$ curves). The places this
matters in the workspace:

### Sapling (Jubjub)

- `cv` value commitments in Spend/Output descriptions.
- `rk` re-randomised spend keys.
- `epk` ephemeral public keys.
- $\mathsf{cm}^u$ note-commitment $u$-coordinates.
- `ak` in viewing key encoding.
- Anchor: a $u$-coordinate plus parity, decoded as a curve point at
  Merkle root level.

### Orchard (Pallas)

- `cv`, `rk`, `epk`, `cmx`.
- Pallas has cofactor 1, so only canonical encoding must be checked;
  subgroup membership is automatic.

### BLS12-381 ($\mathbb{G}_1, \mathbb{G}_2$)

- Groth16 proof elements $A \in \mathbb{G}_1$, $B \in \mathbb{G}_2$,
  $C \in \mathbb{G}_1$.

For BLS12-381 subgroup-membership the check is non-trivial because
the obvious "multiply by $r$" cost is dominated by the pairing
verification itself. The `bls12_381` crate provides
`is_torsion_free` which uses an efficient endomorphism-based check.
This must be invoked on every proof element.

### secp256k1 (transparent)

- Public keys (with canonical compressed encoding).
- ECDSA signatures (canonical low-$s$).

The `secp256k1` crate enforces canonical signatures (ZIP 215).

## 5. The "extract" operations

Several Zcash primitives publish only the $u$-coordinate of a Jubjub
point (or $x$-coordinate for Pallas), not the full point. Examples:

- $\mathsf{cm}^u$ is the $u$-coordinate of the note commitment.
- The Merkle hash output is extracted from a Pedersen-hash result.
- The Orchard nullifier is the $x$-coordinate of a specific point.

This is fine for **uniqueness** (two distinct subgroup points have at
most two equal $u$-coordinates, namely $(u, v)$ and $(u, -v)$, which
together form a pair); for **commitment** purposes this is enough.

But beware: when re-deriving the full point from a published
coordinate (e.g. reconstructing $\mathsf{cm}$ from $\mathsf{cm}^u$),
you must pick the right parity. Zcash conventions are documented in
the specification; in the code, `extract_p` and `extract_p_bottom`
(or `extract`) are the relevant functions.

## 6. Curve arithmetic in twisted Edwards form

Jubjub is a twisted Edwards curve

$$
-u^2 + v^2 \;=\; 1 \;+\; d \, u^2 v^2.
$$

Two facts to remember:

- **Strongly unified addition formula**: the same formula computes
  $P + Q$ for all $P, Q$ including $P = Q$ (doubling) and $P = -Q$
  (returns identity). This is one of the reasons Edwards form is
  beloved for in-circuit work.
- **Order-2 torsion**: the points $(0, -1)$ and $(0, 1) = \mathcal{O}$
  are notable. $(0, -1)$ has order 2 and is *the* annoying low-order
  point. A bug-prone scenario: a "point" decoded as $(0, -1)$ passes
  basic curve-equation checks but is a 2-torsion element, lying
  outside $E^{\circ}$.

For Pallas/Vesta we are on short Weierstrass form $y^2 = x^3 + 5$.
Doubling and addition use distinct formulas; the *incomplete*
addition formula breaks when adding a point to itself or to its
negative. This is why Sinsemilla goes to great lengths to avoid these
edge cases in-circuit (see chapter 16).

## 7. The exact ZIP 216 specification

Quoting (paraphrased) from ZIP 216 for Sapling:

A Jubjub encoding $\tilde{P}_{\text{enc}}$ is valid iff:

1. Strip the high bit of byte 31 as parity $s \in \{0, 1\}$; the
   remaining 255 bits encode $v \in \mathbb{F}_r$ canonically with
   $v < r$.
2. Solve $u^2 = (v^2 - 1) / (d v^2 + 1)$. If $d v^2 + 1 = 0$ or no
   solution exists, reject.
3. Take the square root $u_0$ in $\mathbb{F}_r$; choose $u = u_0$ if
   $\text{lsb}(u_0) = s$, else $u = -u_0$. If $u_0 = 0$, the
   parity bit must be $0$ for canonical encoding.
4. The point $(u, v)$ must lie in $E^{\circ}_{\text{Jubjub}}$.

The protocol PDF section 5.4.9 spells this out exactly.

Pre-Sapling-NU5 code accepted some non-canonical encodings; ZIP 216
codifies the strict consensus rule.

## 8. Constant-time considerations for subgroup checks

A subgroup check is a constant-time operation (no early termination)
to avoid timing leaks. Both `jubjub` and `bls12_381` crates implement
it that way. Beware of helper functions that conditionally short-
circuit on "probably not in subgroup" tests.

When propagating failures, use `CtOption` and `subtle::Choice` rather
than `Result` to keep the failure path constant-time. The codebase
follows this consistently in low-level libraries; higher-level wallet
code is more relaxed because the inputs are already constant-time-
validated by the time they reach there.

## 9. The "ExtendedPoint vs SubgroupPoint" pattern

The Rust types in the `jubjub` crate split:

- `ExtendedPoint`: an arbitrary Jubjub point in (X:Y:T:Z) coords.
- `SubgroupPoint`: a point provably in $E^{\circ}_{\text{Jubjub}}$.

`From<SubgroupPoint> for ExtendedPoint` is total. The other direction
requires `TryFrom` (returns `Option<SubgroupPoint>` after a subgroup
check). The `From` for `ExtendedPoint::from(bytes)` returns an
`ExtendedPoint`; the subgroup check is *not* automatic.

Mirror pattern in `pasta_curves`: `pallas::Point` is the full type
(cofactor 1 so equivalent to subgroup point already), with
`from_bytes` enforcing canonical encoding.

## 10. Practical checklist when adding a curve-point field

For any new field of curve-point type in a serialised structure:

1. Document the curve and which subgroup.
2. On deserialise: canonical-decode + subgroup-check, in that order,
   both constant-time, both fail-by-CtOption.
3. Carry the validated type (`SubgroupPoint`, `pallas::Point`)
   internally; never reach into raw bytes after deserialisation.
4. Re-encode via the canonical encoder (so re-serialised output
   matches input).
5. Add a test that constructs a non-canonical 32-byte sequence and
   verifies it is rejected.
6. Add a test that constructs an 8-torsion point (for Jubjub) and
   verifies it is rejected.
7. If the field is used in a hash, ensure the hash input is the
   canonical 32 bytes.

This checklist is your defence against the entire bug class of
chapter 12.

## 11. Why this matters for Halo 2

Halo 2 over Pallas has cofactor 1, which removes the subgroup-check
worry. But canonical encoding still matters: the polynomial-commitment
opens at Pallas $x$-coordinates, and non-canonical encodings of the
opening evaluations would break Fiat-Shamir.

Inside the Halo 2 circuit, Sinsemilla uses *incomplete* addition.
The protocol must ensure the operands are never equal or opposite,
otherwise the formula returns garbage. This is enforced by careful
generator choice and "incompletely added" gates that assert the
distinctness.

Chapter 17 (Halo 2 deep dive) revisits this.

## 12. Reference encoding patterns to grep for

To get a feel for how the codebase implements these patterns:

```sh
# Subgroup checks
grep -r "is_torsion_free\|SubgroupPoint::try_from\|into_option" --include='*.rs'

# Canonical encoding
grep -r "from_repr\|from_bytes_unchecked\|CtOption" --include='*.rs'

# Zeroize
grep -r "Zeroize\|zeroize::" --include='*.rs'
```

The first command shows ~all subgroup-check sites; the second shows
canonical-encoding sites. If a serialiser path lacks both, it is a
candidate bug.

## What you should know after this chapter

- The exact cofactors and orders for each curve in use.
- Why cofactor $> 1$ requires extra care (small-subgroup attacks).
- ZIP 216's canonical-encoding rule for Jubjub.
- The type-system pattern (`SubgroupPoint`) that carries the
  prime-order invariant.
- The checklist for safely deserialising a curve point.

Next: constant-time programming and side-channel resistance in this
codebase.
