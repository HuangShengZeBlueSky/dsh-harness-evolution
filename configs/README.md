# Reproduction configurations

L4 and A/B/C share the executor and environment adapters. Each profile specifies exact task identities, budgets and model settings. Historical artifact recipes keep their original startpoints and selection.

Use **dsh-evolve profiles**, followed by **dsh-evolve init OUTPUT --profile PROFILE --assets ASSETS**.

[Reproduction guide](../docs/REPRODUCING.md) · [Machine-readable index](index.json)

A/B/C profiles share byte-identical task manifests and starting files through each benchmark’s common directory. The initializer assembles these with the selected profile into a self-contained workspace.
