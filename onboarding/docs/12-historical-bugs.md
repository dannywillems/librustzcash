---
sidebar_position: 12
title: Historical bugs and security incidents
description: "2018 counterfeit bug, ZIP 212, audit findings catalog."
---

# 12 - Historical bugs and security incidents

## Goal

The fastest way to internalise where the sharp edges of a protocol are
is to study the bugs that actually shipped. This chapter walks through
the historically significant incidents in the Zcash ecosystem,
explains the cryptographic root cause of each, and points to the code
that fixed them. Read this chapter twice: once to learn, once when you
are about to commit a non-trivial change.

The incidents below are public; primary sources are linked.

## 1. The 2018 counterfeiting vulnerability (CVE-2019-7167)

**The single most important security incident in Zcash's history.**

### What happened

In March 2018, Sean Bowe (then Zcash Co. cryptographer) discovered a
soundness bug in the BCTV14 paper, which Sprout's zk-SNARK was built
on. The bug allowed an adversary who could solve a specific knowledge
assumption (more accessible than DLP) to produce **valid Sprout proofs
for false statements** - i.e. to create ZEC out of thin air.

A fix (migrating Sprout to Groth16 with a new MPC trusted setup) was
deployed in `zcashd` 1.1.1 in late 2018. Public disclosure followed in
February 2019 once Zcash and other affected chains had migrated.

### The mathematical issue

BCTV14 extended Pinocchio with an attempted optimisation that
introduced extra public parameters of the form $[\beta \gamma]_1$ used
to "tie" the proof's $A, B, C$ pieces together. The soundness proof
of BCTV14 assumed knowledge-of-exponent style assumptions for those
extra elements.

The bug: certain "extra" elements published in the proving key let a
prover compute a polynomial $\widetilde{C}$ such that the verifier's
pairing equation held even though the underlying linear combination
did not correspond to a satisfying witness. Concretely, the verifier
checks

$$
e(A, B) \;\overset{?}{=}\; e(g^{\alpha}, h) \cdot e(C, h^{\delta}),
$$

and the published auxiliary points allowed the prover to construct a
$C$ that passed without a valid witness.

This is *not* a bug in the mathematics of BLS12-381 or in
BLAKE2b/SHA-256; it is in the **structure of the BCTV14 proving
system**. Groth16 (Groth, 2016) has a tighter soundness analysis and
fewer auxiliary elements; replacing BCTV14 with Groth16 closed the
issue.

### What this means for the codebase

The `zcash_proofs::circuit::sprout` module is the *post-fix* "hybrid
Sprout" circuit (BCTV14 statement re-expressed for Groth16). Original
BCTV14 code is gone. The header docstring of `sprout/mod.rs` explicitly
points to this lineage:

```text
"Hybrid Sprout" refers to the implementation of the Sprout statement
in `bellman` for `groth16`, instead of the original implementation
using `libsnark` for BCTV14.
```

Sprout-Groth16 parameters were generated in a fresh MPC ceremony (the
"Sapling MPC" + a hybrid Sprout addendum).

### Lessons

- **The math under a SNARK matters as much as the circuit on top.**
  Changing the proof system is a fundamental decision.
- **Trusted-setup parameters are not just numbers; they are
  cryptographically structured objects.** A misunderstood auxiliary
  parameter changes the security model.
- **Migration paths must be planned.** Zcash had a Sprout-to-Sapling
  migration path which made disclosure manageable.

### References

- Sean Bowe, Daira Hopwood, "Cryptographic vulnerability in Zcash
  protocol", https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/
- Ariel Gabizon, "On the security of the BCTV pinocchio zk-SNARK
  variant", IACR ePrint 2019/119.
- CVE-2019-7167.

## 2. ZIP 212 - rcm malleability and pre-Canopy notes

### What happened

Before the Canopy network upgrade, the Sapling note's commitment
randomness $\mathsf{rcm}$ was a *uniform 32-byte scalar* directly
inserted into the note plaintext and the commitment formula. A
malicious sender could compute the commitment using a non-uniform
$\mathsf{rcm}$ that the recipient might re-derive differently,
producing a note that decrypted to a different value than the sender
intended.

More precisely: the attack was that a sender (perhaps a payment
processor) could craft a payment where the commitment matches the
agreed-upon value $v$, but the encrypted plaintext claims a *different*
value $v' < v$, and the recipient's wallet, blindly trusting the
plaintext, would consider only $v'$ spendable, allowing the sender to
later equivocate.

### The fix: ZIP 212

Make $\mathsf{rcm}$ (and $\mathsf{esk}$ for output encryption)
*derived* from a 32-byte seed $\mathsf{rseed}$ via a PRF, instead of
sent as a raw scalar:

$$
\mathsf{rcm} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\text{x}04)\bigr),
$$

$$
\mathsf{esk} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\text{x}05)\bigr).
$$

The recipient gets $\mathsf{rseed}$ in the note plaintext, derives the
same $\mathsf{rcm}$ and $\mathsf{esk}$, and **checks consistency** with
the published $\mathsf{epk}$. The check $\mathsf{epk} = [\mathsf{esk}]
g_d$ is enforced.

### Where this lives

In the external `sapling-crypto` crate's `note::Rseed` enum:

```rust
pub enum Rseed {
    BeforeZip212(jubjub::Fr),  // pre-Canopy
    AfterZip212([u8; 32]),     // post-Canopy
}
```

The wallet code in `zcash_client_backend::decrypt` and
`sapling-crypto::note_encryption` handles both variants based on the
output's block height.

### Lessons

- **Anything sent in plaintext is a potential malleability vector if
  also used in a commitment.** Derive things from seeds when possible.
- **Compatibility is a permanent cost.** Pre-Canopy notes still exist
  and the code maintains both code paths.

### References

- ZIP 212, https://zips.z.cash/zip-0212.
- Daira Hopwood et al., the disclosure post.

## 3. The Sapling "InternalH" issue

### What happened

Early Sapling implementations used a derived $h$ parameter
($h = [4]G$ on Jubjub) without explicitly clearing the cofactor. In
specific edge cases, a maliciously crafted spend description could
produce a value commitment with a small-order torsion component that
passed verification but should not have. This is a category-archetype
**cofactor handling bug**.

### The fix

Always multiply by the cofactor when receiving an "untrusted" Jubjub
point, and explicitly check that the result is in the prime-order
subgroup. The `jubjub` crate's API distinguishes `SubgroupPoint` from
the raw `ExtendedPoint` for exactly this reason.

You will see code like:

```rust
let p = ExtendedPoint::from_bytes(&bytes).into_option()?;
let p = SubgroupPoint::try_from(p)?;  // explicitly enforces prime-order
```

Read chapter 13 for the deep dive on cofactors.

### Lesson

**Any point received from outside the local trust boundary must be
explicitly validated to lie in the prime-order subgroup.** The
type system can carry that invariant.

## 4. Heilman, Kendler, Zohar et al. - timing and metadata
deanonymisation

Aside from cryptographic bugs, several academic papers have shown
that **metadata leaks** can deanonymise shielded users:

- Quesnelle, "On the linkability of Zcash transactions" (2017).
  Showed early Sprout usage was largely linkable because users moved
  funds in-and-out of Sprout in identifiable patterns ("round trip"
  transactions).
- Kappos et al., "An empirical analysis of anonymity in Zcash"
  (USENIX 2018).
- Tramèr et al., "Remote Side-Channel Attacks on Anonymous
  Transactions" (USENIX 2020). Demonstrated that timing of trial
  decryption could leak which view-key was used.

These are not implementation bugs per se but **operational and
informational leaks** that wallet design must mitigate. Mitigations
adopted include:

- Constant-time trial decryption regardless of success/failure (the
  AEAD primitive itself is constant-time; care must be taken in the
  surrounding code).
- Limit the rate at which users move in/out of pools.
- Best-practice wallet UX: avoid "shielded $\to$ transparent $\to$
  shielded" round trips that re-link funds.

### Lesson

**Cryptography is necessary but not sufficient.** Sound use of strong
cryptography can be undone by predictable behaviour patterns or
timing leaks.

## 5. Subgroup-check omissions in note encryption

### The issue

Early Sapling code accepted any $\mathsf{epk} \in \mathbb{G}_{\text{Jubjub}}$
without checking that it lay in the prime-order subgroup. With
cofactor 8, a malicious sender could craft $\mathsf{epk}$ with a
non-trivial 8-torsion component. The shared secret $[\mathsf{ivk}]
\mathsf{epk}$ would then leak partial information about $\mathsf{ivk}$
across multiple outputs.

### The fix

ZIP 216 (canonical-encoding consensus rule) plus explicit subgroup
checks at decryption time. The `epk` is decoded to a `SubgroupPoint`
or rejected.

Read `sapling-crypto::note_encryption::SaplingDomain::epk` and the
`extract_p` / `extract_p_bottom` family of functions.

### Where to look in the code

Search for `from_bytes` followed by a subgroup check; or for
`SubgroupPoint::try_from` after `from_bytes` succeeds. The pattern
should be uniform: any wire-derived Jubjub point ascends to
`SubgroupPoint` or is rejected.

### Lesson

**Canonical encoding + subgroup membership is a precondition for
every Jubjub point on the wire.** The same logic applies to Pallas
(though Pallas has cofactor 1, so subgroup membership is automatic;
canonical encoding still must be enforced).

### References

- ZIP 215 (BLS12-381 verification rules).
- ZIP 216 (canonical Jubjub-element encoding).

## 6. Bellman early-version timing leaks

Pre-1.0 `bellman` (and underlying `pairing` crates) had non-constant-
time scalar multiplications and field inversions. While this never
affected proof correctness (you cannot recover witness from a SNARK
proof), it did affect *prover-time secret material*: a prover side-
channel could leak the witness during proving.

For a wallet running locally on a user's device this is mostly
theoretical (the user controls the machine), but for a remote prover
or a multi-party prover setup it is critical. The current `bls12_381`,
`pairing`, `bellman`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves) crates
implement constant-time field arithmetic and constant-time
conditional selection (`subtle` crate). 

Chapter 14 covers constant-time programming in this codebase in
depth.

### Lesson

**Constant time is a property of the entire stack from field
arithmetic up to circuit synthesis.** A single non-constant-time
branch in a hot path can leak secrets.

## 7. The dummy-spend / dummy-output indistinguishability

A Sapling bundle may include zero-value "dummy" spends/outputs to
hide the true input/output count. For dummies to be
indistinguishable from real ones, the dummy must be cryptographically
indistinguishable in all observable ways:

- Same value commitment shape: $\mathsf{cv} = [0]V + [\mathsf{rcv}]R$
  is a valid value commitment for $v = 0$ with random $\mathsf{rcv}$,
  same group as real ones.
- Same proof structure: the circuit accepts "dummy" inputs via a
  flag, but the proof must still verify (the circuit makes the
  Merkle-path check conditional on $v \neq 0$, with extreme care).
- Same encryption ciphertext: real-looking encrypted note plaintext,
  with random padding.

Historically, a bug in early Sapling builders produced dummy
ciphertexts whose internal structure was statistically different from
real ones (e.g. zero memo bytes). A passive observer could partially
distinguish dummies from real outputs.

The fix: always sample dummy plaintexts the same way as real ones,
with uniform-random memo content and proper note structure. Look for
`OutputBuilder::DummyOutput` or analogous in `sapling-crypto::builder`.

### Lesson

**Anything that should be indistinguishable must be sampled from the
identical distribution.** A subtle statistical bias is enough to
undo the privacy.

## 8. Halo 2 audit findings (orchard)

Halo 2 and the Orchard circuit went through multiple audits before
NU5. Public reports from NCC Group, Trail of Bits, and Least
Authority. Selected high-level findings (paraphrased from public
reports):

- *Edge-case incomplete-addition*: the Sinsemilla construction uses
  *incomplete* point addition for efficiency. If the operands happen
  to coincide (or be inverses), the formula returns garbage rather
  than identity. The mitigation is to *prove* in-circuit that the
  required points are distinct. Forgetting this check was found in
  an early draft.
- *Witness encoding tightness*: each field element is supposed to
  occupy specific bits in the public input vector. Misalignment
  would not cause obvious failures but would let an adversary
  silently inject extra structure.
- *Lookup-argument soundness*: the Halo 2 lookup uses permutation
  arguments. A bug in early code allowed certain table cells to
  go uninitialised (treated as zero), which a malicious prover could
  exploit. Fixed by explicit value-binding.
- *Transcript domain separation*: in any Fiat-Shamir-based proof,
  the transcript must be domain-separated per circuit. Early
  versions accidentally allowed transcript "replay" across
  different circuit instantiations.

All of these were fixed before Orchard activation. They underline
that *audit findings are not the bug list of bad implementations;
they are the bug list of a careful implementation that nonetheless
needs adversarial review*.

### Lesson

**Use the audit reports as a study guide.** Every finding shows a
class of attack you can apply to other parts of the code or to new
features you might add.

## 9. The `secp256k1` validation rules (ZIP 215)

A transparent input's signature might use a non-canonical $s$ or a
$y$-parity not matching the canonical form. ZIP 215 (originally from
Bitcoin) tightens validation: only canonical signatures are accepted.

`librustzcash` delegates to the `secp256k1` crate which already
enforces canonical signatures, and the consensus is encoded so that
non-canonical signatures cause transaction rejection.

### Lesson

**Multiple valid signatures for the same message break uniqueness
assumptions.** Always pick a canonical form and reject the rest.

## 10. The PCZT spend-authorisation race

When a PCZT is signed by an external signer, the signer must produce
a spend-authorisation signature whose challenge depends on the
sighash. But the sighash includes the value commitments, which in
turn depend on the per-spend $\mathsf{rcv}$, which is local to the
*constructor* role (not the signer). A naive design forces the
constructor to share $\mathsf{rcv}$ with the signer, which leaks
information about the value being moved.

The PCZT design splits these by including in the signer's payload
only the *sighash hash itself*, not the underlying $\mathsf{rcv}$
values; the constructor pre-commits to all randomness and the
signer trusts the bundled sighash. This was an intentional design
choice; getting it wrong would either (a) leak values, (b) allow
the constructor to lie to the signer about what was being signed.

Bugs in this area would not be visible in normal tests; cross-role
audits are needed. See the comments and integration tests in
`pczt/src/roles/signer/mod.rs`.

### Lesson

**Multi-party flows distribute secrets across roles; verify that
each role only learns what it needs.**

## 11. Bookkeeping bugs in the wallet

Not strictly cryptographic, but historically important:

- **Witness desynchronisation**: if the wallet computes the Merkle
  path for a note from a stale checkpoint, the path is invalid for
  the current anchor. The fix is checkpoint discipline in
  `shardtree`. Bugs in this area produced unspendable notes that
  required wallet rescans.
- **Nullifier set update lag**: spending a note must immediately
  insert its nullifier into the wallet's "spent" set so the
  proposal pipeline does not re-select it. Race conditions here led
  to double-construction (constructing two transactions spending
  the same note, only one of which would be accepted).

These are systems bugs but they have direct cryptographic
consequences (constructed transactions are rejected because their
proofs reference invalid anchors or already-spent nullifiers).

### Lesson

**The wallet's state must be consistent before, during, and after
each transaction construction.** Atomic update primitives matter.

## 12. The Equihash $(n, k)$ "Bitcoin Gold" reorg attack

Not a Zcash incident: in 2018, Bitcoin Gold (which used Equihash
$(144, 5)$, different from Zcash's $(200, 9)$) suffered a 51% attack
because cheap GPUs could solve their parameter choice for less than
the chain's block reward. Zcash's choice of $(200, 9)$ requires
$\sim 700$ MB of memory and remained costly enough through the GPU
era; later, Zcash switched to ProgPoW (out of scope here), then
Equihash again with the same parameters.

### Lesson

**Parameter selection in proof-of-work matters as much as the
algorithm.** A "memory-hard" function with insufficient memory
requirements is no longer memory-hard.

## 13. Common patterns in audit findings

Reading several years of audit reports, the recurring themes:

1. Subgroup checks missing on points read from the wire.
2. Non-canonical encodings of field elements (multiple byte sequences
   for the same element) accepted.
3. Domain separation tags repeated across distinct uses.
4. Constant-time violations in error-handling branches.
5. Test vectors not covering edge cases (zero values, identity
   elements, max-bit values).
6. Off-by-one in serialisation (length prefix vs total length).
7. Insufficient input validation at trust boundaries (e.g. a
   `from_bytes` that returns `Option` but where the caller unwraps
   instead of propagating the failure).
8. Race conditions between prover and signer roles.

This list is your checklist when reviewing crypto-touching PRs.

## What you should know after this chapter

- The story and root cause of the 2018 counterfeit bug.
- Why ZIP 212 exists (rcm malleability).
- The cofactor / subgroup story and why it keeps coming back.
- The pattern of audit findings to look for in new code.
- That the wallet is not just a UI; it is a security boundary too.

Next: the cryptographer's must-know low-level details on cofactors,
subgroups, and canonical encodings, which the bugs above keep
pointing to.
