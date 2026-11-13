# Reproduction entrypoints and experiment configurations

`experiment-index.json` maps all displayed model--scope profiles, headline artifacts, and evolution histories to their archived configurations. `protocols.json` and the bundled controllers specify the controlled 40-round A/B/C recipe. The manuscript describes the general algorithm in Appendix A and the A/B/C experimental setup in Appendix B.

## Offline split audit

```sh
python3 dsh-draft/reproducibility/audit_protocols.py
```

`protocols.json` contains ordered task IDs, trials and seeds, actor settings, step/call limits, promotion metric, start and environment identity. JSONL manifests provide the same schedules in separate files. Benchmark task payloads are loaded by the corresponding native environment adapter.

## Search entrypoints

The bundled `controller.py` is the A/B controller and `final/controller.py` is the C controller, with the unused Telecom adapter and account-specific status wording removed. The generated-candidate logic, evidence sampling, objective, hook comparison and promotion rules are retained. The paired wrappers are `slot.mjs` and `final/slot-c.mjs`.

In the prepared benchmark environment:

```sh
export SCALE_CODEX=/path/to/authenticated/codex
python3 dsh-draft/reproducibility/controller.py /path/to/prepared-A-or-B-group
python3 dsh-draft/reproducibility/final/controller.py /path/to/prepared-C-group
```

A prepared group supplies `experiment.yaml`, `baseline/`, `runtime/`, `interface.md`, the native `environment.py`, and its task manifests. The verified experiment runtime uses Python 3.11.15 and Node.js 24.14.0. Install the matching `astra_evolve` evaluator from the experiment codebase and PyYAML 6.0.3. The archived runtime pins DSH agent/loop 0.2.0-rc.2 and Cordis 4.0.4. Provide the evaluator model endpoint through the group configuration and credentials through the environment. The native assets include the ALFWorld data, DBBench database, WebShop catalog plus inherited v37 harness, or OSBench task images. These assets are required for actual evaluation; they are not supplied by the split audit.

Use a fresh group/output directory for an independent search. Using a completed group resumes its saved decisions and valid evaluation records. Do not remove valid results to manufacture a fresh run.

## Expected products

Each round records the actual improver input, JSON response, candidate code/composition and adoption decision. `runs/training-seal.json` records the final parent and all promoted test targets after round 40. Tests then evaluate every promoted target, or the baseline if there were no promotions, with three executions per task. `runs/final.json` identifies the development-selected output. A posteriori highest-test selection is separately labeled in the paper's artifact views.
