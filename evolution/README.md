# L4 and A/B/C on a shared runtime

Install with **python -m pip install -e evolution**.

- [L4](src/dsh_evolve/loops/l4.py) keeps capability-guided search and the benchmark-specific selection rules needed by historical WebShop recipes.
- [A/B/C](src/dsh_evolve/abc.py) runs the controlled edit-scope search.
- [Common evaluation](src/astra_evolve/) provides task manifests, frozen versions and runtime records.
- [Runtime wrappers](src/dsh_evolve/assets/) expose native DSH hooks.
- [Runners](src/dsh_evolve/runners/) preserve benchmark execution and scoring.

[Configurations](../configs/index.json) · [Reproduction](../docs/REPRODUCING.md) · [Installation check](scripts/smoke.py)
