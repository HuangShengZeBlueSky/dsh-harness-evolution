# Publish another harness

**English** | [简体中文](PUBLISHING.zh-CN.md)

The leaderboard is **release-driven**. It updates when a maintainer publishes an artifact and its measured data. It does not scrape an internal live experiment board.

1. Give the new artifact a unique `release_id`; retain prior releases.
2. Include executable plugin files and `composition.json`, `protocol.json`, `curve.json`, `diagram.mmd`, and `card.json`. Existing artifact directories are concrete templates.
3. Supply a result JSON or YAML using the fields of an existing `results/<benchmark>--<release>.json`. Set `comparison_group` from `results/leaderboard-policy.json` and declare `selection_kind`: `training_final` or `retrospective_adopted`. A retrospective release must include the actual `promotion.json` adoption record and original `campaign_final_checkpoint`. Scores are fractions from 0 to 1. Record full valid coverage and the actual protocol. Missing cost or unsupported metrics stay `null`.
4. Register it and regenerate the leaderboard:

```bash
python tools/publish.py --artifact /path/to/new-harness --result /path/to/result.yaml
node tools/check.mjs
git add harnesses results assets README*.md LEADERBOARD*.md docs
git commit -m "Publish new harness and measured results"
git push
```

`publish.py --check` validates an artifact/result pair without writing files. YAML dates such as `published_on: 2026-10-26` are accepted.

`publish.py` prepares local repository changes; only `git push` publishes them. It refuses an existing release identifier. Every artifact gets its own rendered Mermaid diagram, measured evolution curve, protocol, and score page. The primary leaderboard chooses the highest success score within each benchmark’s registered primary comparison group. Different actors or protocols require a separate group and remain in the release table.

For a corrected measurement, publish a new dated record and explain the correction rather than silently replacing an old artifact. For a different actor, task set, simulator, or runtime-access contract, register another comparison group in `results/leaderboard-policy.json`; do not reuse an incompatible group.

The practical maintainer handoff is: **new harness + checkpoint identity + test metrics/coverage + protocol + curve**. Providing these is sufficient to prepare the next publication. Detailed private paper material is not required.
