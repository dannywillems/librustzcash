---
sidebar_position: 17
title: Halo 2 deep dive
description: "Pointer to the dedicated Halo 2 onboarding course."
---

# 17 - Halo 2 deep dive

:::warning This chapter has moved

The Halo 2 proving-system internals are **not** maintained here. They
live in a dedicated onboarding course generated from the upstream
repository:

[`dannywillems.github.io/halo2`](https://dannywillems.github.io/halo2/)
built from
[`zcash/halo2`](https://github.com/zcash/halo2).

That course covers:

- PLONKish arithmetisation, columns, regions, and selectors.
- Custom gates and lookup arguments.
- The inner-product argument (IPA) and the no-trusted-setup property.
- The Fiat-Shamir transcript and its concrete instantiation.
- Halo 2 gadgets used by Orchard (Poseidon, Sinsemilla, point
  addition, range checks).

The math, the code walkthroughs, and the exercises belong in that
course where the source embeds pin against `halo2_proofs` directly.

:::

## How Halo 2 plugs into `librustzcash`

This workspace consumes Halo 2 transitively through the `orchard`
crate; there is no direct `halo2_proofs` dependency in the workspace
itself. Verification of an Orchard bundle ultimately calls into
`halo2_proofs::plonk::verify_proof` via the `orchard` crate's public
API.

For the proving-system mechanics, follow the redirect.
