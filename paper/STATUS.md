# Research status · 2026-11-13

The source snapshot is the Overleaf main branch fetched on 2026-11-13, whose latest recorded change was “Verify bibliography metadata against primary sources” at 14:09:57 Asia/Shanghai. The manuscript sources are copied unchanged into `manuscript/`; compile `AnonymousSubmission2027.tex` with pdfLaTeX and BibTeX.

The current draft studies frozen Qwen3-4B execution, improver capability and edit scope A/B/C on ALFWorld, DBBench, WebShop and OSBench. Its headline measured peaks are 95.41%, 70.56%, 48.17% and 41.67%, respectively. These are best measured test checkpoints, not an assertion of development-only checkpoint selection or matched experimental conditions across every historical lineage.

`data/main-results.json` transcribes the current manuscript table, including local repeat standard deviations and published comparisons. `data/headline-artifacts-20261113.json` records checkpoint identities, settings and repeat measurements. `data/scope-profiles-20261113.json` contains the 36 displayed model–scope profiles and their configurations; the paper's composite profiles must not be silently substituted for the separate controlled final-selected dataset.

`data/completed-c-tests-20261113.json` preserves the newly completed C evaluations, including their actual repeat counts. A single repeat does not establish execution variance. `data/best-harness-evolution-20261113.json` contains the current plotted histories. `data/artifact-source-code-20261113.json` contains the selected artifact implementations. Full configurations, ordered split manifests and controllers are in `manuscript/dsh-draft/reproducibility/`.

The previous five-benchmark table remains in `data/main-results-20261111.json`; the previous trajectories, controlled final-selected results, released harnesses and figures remain as historical records. Telecom is retained in that archive and is not in the current manuscript table. OSBench's current 41.67% checkpoint is distinct from the historical 39.35% result.

This synchronization does not rerun experiments or claim that every server run is complete. Native benchmark assets and model access remain external requirements. The paper source requires pdfLaTeX; a fresh compiled manuscript PDF is not included in this snapshot.
