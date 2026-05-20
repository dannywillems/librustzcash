# 17 - Halo 2 deep dive

## Goal

Chapter 05 introduced Halo 2 at a black-box level. This chapter goes
under the hood: the PLONKish arithmetisation, the polynomial-IOP
machinery, the lookup argument, the inner-product argument (IPA)
that underlies the polynomial commitment, the Fiat-Shamir transcript,
and the specific custom gates used by Orchard.

You do not need to implement Halo 2; the `halo2_proofs` crate
already does. But you must understand it well enough to:

- Read an Orchard circuit module and pair it with the math.
- Reason about soundness when reviewing changes.
- Estimate proof size and verifier cost for new circuit features.

## 1. The PLONKish circuit model

A PLONKish circuit is a rectangular table with $N$ rows and a small
number of columns. Each column has a type:

- **Advice** (or witness): values the prover supplies.
- **Fixed**: values baked into the circuit (constants, lookup
  tables, selectors).
- **Instance**: values that are part of the public input.

The verifier's view of the prover's commitment is one polynomial per
column, interpolated over a multiplicative subgroup $H \subseteq
\mathbb{F}^*$ of size $N$. Let $\omega$ be a primitive $N$-th root
of unity generating $H$.

For column $W$, define $w(X) \in \mathbb{F}[X]$ to be the unique
polynomial of degree $< N$ with $w(\omega^i) = W_i$ for $i = 0,
\ldots, N-1$.

## 2. Custom gates

A **custom gate** is a polynomial equation that must hold at every
row, possibly involving cells in nearby rows (via shifting by
$\omega^j$):

$$
G(w_1(X), w_2(X), \ldots, w_1(\omega X), w_2(\omega X), \ldots, q(X)) \;=\; 0
\quad \text{for all } X \in H.
$$

Here $q(X)$ is a *selector*, a fixed polynomial that is $1$ on rows
where the gate is "on" and $0$ elsewhere; multiplying the gate by
$q(X)$ disables it on irrelevant rows.

Custom gates are how Halo 2 supports operations natively. Orchard
uses custom gates for:

- Pallas point addition (`ec_add`).
- Pallas point doubling (`ec_double`).
- Scalar multiplication ("scalar_mul" group of gates).
- Sinsemilla hash chains.
- ECDH and Poseidon.
- Field arithmetic and bit decomposition.

Each gate is a (usually low-degree) polynomial identity. Halo 2
combines them all into one identity by random linear combination at
proving time.

## 3. The vanishing argument

To enforce $G(\ldots) = 0$ on $H$, the prover commits to a
*quotient* polynomial $t(X)$ such that

$$
G(\ldots) \;=\; t(X) \cdot Z_H(X), \qquad
Z_H(X) \;=\; \prod_{\omega^i \in H} (X - \omega^i) \;=\; X^N - 1.
$$

This is the **vanishing polynomial** argument. If the identity holds
on $H$, $G$ is divisible by $Z_H$; if not, no $t(X)$ of bounded
degree exists. The verifier challenges with a random $\zeta$ and
checks

$$
G(\text{evaluations at } \zeta) \stackrel{?}{=} t(\zeta) \cdot Z_H(\zeta).
$$

By Schwartz-Zippel, the probability of a malicious prover passing
this check with an incorrect identity is at most $\deg(G) / |\mathbb{F}|$
which is negligible.

## 4. The permutation argument (copy constraints)

A Halo 2 circuit needs to enforce equalities between cells in
different rows (e.g. "the output of row 5 is the input of row 7").
This is the **copy constraint** problem.

The PLONK permutation argument represents the constraint as a
permutation $\sigma$ on cell positions. Define a "grand product"
polynomial $z(X)$ satisfying:

$$
\frac{z(\omega X)}{z(X)} \;=\; \frac{\prod_{j} (w_j(X) + \beta \cdot \sigma_j(X) + \gamma)}{\prod_{j} (w_j(X) + \beta \cdot j_{\text{id}}(X) + \gamma)},
$$

for random verifier challenges $\beta, \gamma$. The prover commits
to $z(X)$ and proves it has the right shape; the verifier checks
multiplicatively that $z$ ends where it started (so the permutation
is closed) and that the boundary condition holds.

This is a $O(N \log N)$ FFT-time argument that costs the verifier $O(1)$
extra evaluations.

## 5. The lookup argument

Halo 2 includes a **lookup table** mechanism: rows of a designated
"lookup" table set $T$ are precomputed, and the protocol enforces
that for each row $i$, the tuple of values in specific columns
$(w_{j_1}(\omega^i), w_{j_2}(\omega^i), \ldots)$ is *some* row of $T$.

The argument is a variant of plookup: define

$$
\phi(X) = \sum_{i} a_i \cdot X^i, \quad
\psi(X) = \sum_{i} b_i \cdot X^i,
$$

with $a_i$ the multiplicity of the $i$-th lookup input and $b_i$ the
table-row counter; the prover proves $\phi$ and $\psi$ are related
by an inner-product-style identity. The cost is $O(N + |T|)$.

Orchard uses lookups heavily:

- Sinsemilla's chunk lookup: 10-bit chunk $\to$ point in a
  precomputed table $S(m)$.
- Range checks: $n$-bit range check is just a lookup against the
  table of $\{0, 1, \ldots, 2^n - 1\}$.
- Decomposition lookups: assertion that a field element decomposes
  into specific-size limbs.

## 6. The transcript

Halo 2 is non-interactive via Fiat-Shamir. The verifier's challenges
$\beta, \gamma, \zeta, \ldots$ are derived from hashes of the
prover's commitments and the public input.

The transcript is implemented by `halo2_proofs::transcript::Transcript`:

- `write_point(P)`: hash the encoding of $P$ into the state.
- `write_scalar(s)`: hash $s$ into the state.
- `squeeze_challenge() -> Scalar`: derive a challenge from the
  current state.

The hash function used is Poseidon over the Pallas base field for
in-circuit transcripts (when verifier-of-verifier composition is
needed) and BLAKE2b for the on-disk transcript.

Domain separation:

- Each transcript has a personalisation byte string identifying the
  circuit and version.
- Public inputs are absorbed before any commitment so that the
  proof is bound to the specific public input.

## 7. The Inner Product Argument (IPA)

This is the polynomial commitment scheme in Halo 2. A polynomial
$p(X) = \sum a_i X^i$ of degree $< n$ is committed to as

$$
\mathsf{Comm}(p) \;=\; \sum_{i=0}^{n-1} [a_i] G_i \;\in\; E_{\text{Pallas}},
$$

with fixed deterministic bases $\{G_i\}_{i=0}^{n-1}$. To prove an
opening $p(z) = v$, the protocol:

1. Sample challenge $x$ via Fiat-Shamir.
2. Bisect the coefficient vector $\vec{a} = (\vec{a}_L, \vec{a}_R)$
   and similarly $\vec{G} = (\vec{G}_L, \vec{G}_R)$.
3. Compute "cross-terms":

   $$
   L_k = \sum [a_{L,i}] G_{R,i} + [u_k] H, \qquad
   R_k = \sum [a_{R,i}] G_{L,i} + [u_k^{-1}] H,
   $$

   where $H$ is a fixed auxiliary generator and $u_k$ is a
   per-round random.

4. Fold: $\vec{a}' = \vec{a}_L + u_k \vec{a}_R$, $\vec{G}' =
   \vec{G}_L + u_k^{-1} \vec{G}_R$.
5. Recurse on $(\vec{a}', \vec{G}')$.

After $\log_2 n$ rounds, the final $\vec{a}$ is a single scalar; the
prover sends it and the verifier checks a final equation.

### Proof size and verifier cost

- Proof size: $O(\log n)$ group elements (the $L_k, R_k$ pairs) plus
  one scalar.
- Verifier cost: $O(n)$ scalar mults to recompute $\vec{G}'$ at the
  end. Halo 2 amortises this across multiple proofs ("accumulation").

Compared to KZG (used by other PLONK variants): KZG verification is
$O(1)$ pairings, but needs a trusted setup. IPA verification is
$O(n)$ MSM, no trusted setup. The Halo 2 design trades verifier cost
for setup transparency.

### Accumulation / Halo

The original Halo paper observed that the IPA verifier's $O(n)$ MSM
can be *deferred*: instead of evaluating, commit to a *deferred
verification statement* and pass it forward. Across $k$ proofs, a
single accumulated MSM checks all of them at the end. This is
**recursion**.

Orchard does not currently use this in production (each Orchard
bundle is verified directly), but Halo 2 was chosen for the option
to enable it in future (chain-history accumulators, recursive proof
verification in-block).

## 8. The Pallas/Vesta cycle and recursion

To verify a Halo 2-over-Pallas proof inside *another* Halo 2 proof,
the inner verifier circuit would have to perform arithmetic over
the base field of Pallas. That base field is the scalar field of
Vesta. Building the verifier as a Halo 2-over-Vesta circuit makes
it efficient (the verifier's native operations are scalar ops in
$\mathbb{F}_p$, which are Vesta's scalar field).

Symmetrically, a Vesta proof can be verified inside a Pallas
circuit. This bidirectional capability is what makes the cycle
useful.

Orchard does not exploit this yet. Future work (chapter 21) does.

## 9. Custom gates used by Orchard - sample

Reading the `orchard::circuit` module, you will find groups of
custom gates implementing each cryptographic primitive.

Example (paraphrased): the "incomplete addition" custom gate for
Sinsemilla. Given $P_1 = (x_1, y_1)$ and $P_2 = (x_2, y_2)$ with
$P_1 \neq \pm P_2$, the sum $P_3 = (x_3, y_3)$ satisfies:

$$
\lambda = \frac{y_2 - y_1}{x_2 - x_1}, \qquad
x_3 = \lambda^2 - x_1 - x_2, \qquad
y_3 = \lambda(x_1 - x_3) - y_1.
$$

As polynomial identities:

$$
\lambda \cdot (x_2 - x_1) \;-\; (y_2 - y_1) \;=\; 0,
$$

$$
x_3 \;+\; x_1 \;+\; x_2 \;-\; \lambda^2 \;=\; 0,
$$

$$
y_3 \;-\; \lambda (x_1 - x_3) \;+\; y_1 \;=\; 0.
$$

These three identities are enforced by three custom-gate rows when
the appropriate selector is on. The "$\lambda$" is an extra advice
column.

The completeness assumption ($P_1 \neq P_2$) is enforced by an
explicit "must be distinct" assertion implemented as another gate.
If a malicious prover supplies $P_1 = P_2$, the $\lambda$-row
identity above becomes $0/0$ - meaningless - and the additional
distinctness assertion fails.

## 10. Range checks

Halo 2 implements $n$-bit range check via a lookup against a
precomputed table $\{0, 1, \ldots, 2^n - 1\}$. For larger bit
ranges, decompose into smaller chunks (typically 10-bit) and
lookup each.

For example, a 64-bit value $v$ is decomposed as $v = c_0 + 2^{10}
c_1 + 2^{20} c_2 + \ldots + 2^{60} c_6$ with each $c_i$ in a
10-bit lookup table. This is much cheaper than enforcing 64
boolean constraints.

## 11. Sinsemilla in-circuit

Sinsemilla maps 10-bit chunks of the input to Pallas points via
a precomputed table $S$. Inside the circuit:

- The chunk $m^{(i)}$ is bit-decomposed and range-checked via
  lookup.
- The point $S(m^{(i)})$ is *looked up* via the lookup argument
  against a precomputed table of $(\text{chunk}, S(\text{chunk}))$
  pairs.
- The running accumulator $A_i$ is incomplete-added with
  $S(m^{(i)})$ using the incomplete-addition gate.
- After $n$ chunks, the result is returned.

The lookup tables for $S$ are part of the constraint system fixed
columns, baked into the verifying key.

## 12. The verifier in code

`halo2_proofs::plonk::verify_proof` is the entry. It:

1. Re-derives the structured reference string (the generator
   vectors).
2. Initialises the transcript with the public input.
3. Absorbs the prover's commitments to advice columns.
4. Squeezes Fiat-Shamir challenges.
5. Absorbs more commitments and evaluations.
6. Verifies the polynomial identities at the challenge point.
7. Verifies the IPA opening proofs.

For Orchard's verifier, `orchard::circuit::Circuit::verify_proof`
wraps this.

## 13. Proof size, in numbers

For an Orchard bundle of $n$ Actions (over Pallas at $k = 11$, so
$N = 2^{11}$ rows):

- Advice columns: $\sim 6$.
- Custom gate selectors: $\sim 50$.
- IPA proof size: $\sim 32 \cdot \log_2 N \approx 350$ B per
  polynomial, with $\sim 6$ polynomials $\to \sim 2$ kB.
- Plus commitments and final scalars: $\sim 1.5$ kB.
- Plus permutation and lookup arguments: another $\sim 1$ kB.

Total: ~5 kB per bundle, independent of $n$ (the circuit is
instantiated with $n$ Actions in the same single proof).

## 14. Soundness and security parameters

Halo 2's soundness:

- Schwartz-Zippel error: $\deg / |\mathbb{F}_p|$, with degrees $\sim
  N \approx 2^{11}$ and $|\mathbb{F}_p| \approx 2^{254}$. Negligible.
- IPA soundness: reduces to discrete log on Pallas.
- Fiat-Shamir soundness: random oracle model, with BLAKE2b/Poseidon
  as the heuristic instantiation.

Concrete security: 128 bits, assuming Pallas DLP is hard. The 256-bit
curves are chosen for this.

## 15. The Halo 2 book and where to read next

Public resources, in order of usefulness:

- The Halo 2 book: https://zcash.github.io/halo2/. Read the
  arithmetisation chapter and the lookup chapter.
- The `orchard::circuit` module's `Circuit::configure` and
  `Circuit::synthesize`. This is where the actual gates and
  routing live.
- Bowe, Grigg, Hopwood, *Halo*, IACR ePrint 2019/1021.
- Gabizon et al., *PLONK*, IACR ePrint 2019/953.
- Sean Bowe's blog post explaining IPA accumulation.

## 16. Common pitfalls for new Halo 2 circuit authors

- **Off-by-one on selectors**: a selector that turns on a gate at
  row $i$ also turns it on at row $i$ of an unused region; ensure
  selectors are zero where you expect them to be.
- **Underconstrained advice cells**: the prover can supply any
  value for an advice cell unless a gate forces it. Forgetting a
  constraint creates a soundness hole.
- **Incomplete-addition edge cases**: the input points must be
  proved distinct; do not rely on the formula's behaviour at
  $P_1 = P_2$.
- **Lookup table collisions**: if two different input chunks map
  to the same lookup-table row, the protocol does not distinguish
  them. Tables must be injective on the relevant projection.
- **Transcript replay**: failure to absorb a commitment or a public
  input into the transcript before squeezing a challenge breaks
  Fiat-Shamir.

## What you should know after this chapter

- The PLONKish model: advice/fixed/instance columns, custom gates,
  selectors, permutations, lookups.
- The vanishing-polynomial argument and the IPA opening protocol.
- Why incomplete addition matters for Sinsemilla.
- The Pallas/Vesta cycle's role in recursion.
- Where to read further.

Next: anonymity-set and metadata-leak analysis - the *operational*
cryptography concerns.
