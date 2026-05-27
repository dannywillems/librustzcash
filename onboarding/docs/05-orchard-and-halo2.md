---
sidebar_position: 5
title: Orchard and Halo 2
description: "Pointer to the dedicated Orchard and Halo 2 onboarding courses."
---

# 05 - Orchard and Halo 2

:::warning This chapter has moved

The Orchard and Halo 2 material is **not** maintained here. It lives
in two dedicated onboarding courses, each generated from the upstream
repository it documents.

- **Orchard** (Action circuit, key tree, Sinsemilla, note encryption,
  the `orchard` crate end to end):
  [`dannywillems.github.io/orchard`](https://dannywillems.github.io/orchard/)
  built from
  [`zcash/orchard`](https://github.com/zcash/orchard).
- **Halo 2** (PLONKish arithmetisation, custom gates, lookups, IPA,
  Fiat-Shamir transcript, `halo2_proofs` internals):
  [`dannywillems.github.io/halo2`](https://dannywillems.github.io/halo2/)
  built from
  [`zcash/halo2`](https://github.com/zcash/halo2).

The technical detail (math, code walkthroughs, exercises) belongs in
those courses, where the source embeds pin against the actual proving
system implementation rather than the `librustzcash` workspace.

:::

## How Orchard plugs into `librustzcash`

This workspace consumes Orchard as an external dependency:

```toml reference title="Cargo.toml"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml#L71-L73
```

The integration surface is small: bundle parsing in
[`zcash_primitives`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/orchard.rs),
wallet scanning in
[`zcash_client_backend`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api),
and proof-system verification via the `orchard` crate's public API.

For everything else, follow the redirect.
