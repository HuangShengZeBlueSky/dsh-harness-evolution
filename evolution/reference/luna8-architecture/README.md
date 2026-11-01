# Luna8 architecture pilot controller

One shared host, five arms: base, evidence, mechanism, validation, memory. Four benchmarks, H0, eight candidates per group. This is the actual newly prepared controller source, not a completed benchmark result.

The host owns evaluation and adoption. Each group needs experiment.yaml, task manifests, baseline/runtime and the original benchmark-specific astra_evolve/environment assets. Current deployment is on the research server; this reference is not a standalone one-command reproduction package.

Explicit quota errors stop with code78 and preserve session/results. Four shared optimizer slots bound concurrent model requests. Candidate/evaluation budgets are matched; actual optimizer token consumption is measured, not assumed equal. Final tests run only after eight decisions.
