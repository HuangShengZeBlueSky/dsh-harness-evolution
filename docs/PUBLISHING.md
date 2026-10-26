# Publish another harness

The leaderboard is **release-driven**. It updates when a maintainer publishes an artifact and its measured data. It does not scrape an internal live experiment board.

1. Give the new artifact a unique `release_id`; retain prior releases.
2. Include executable plugin files and `composition.json`, `protocol.json`, `curve.json`, `diagram.mmd`, and `card.json`. Existing artifact directories are concrete templates.
3. Supply a result JSON or YAML using the fields of an existing `results/<benchmark>--<release>.json`. Scores are fractions from 0 to 1. Record full valid coverage and the actual protocol. Missing cost or unsupported metrics stay `null`.
4. Register it and regenerate the leaderboard:

```bash
python tools/publish.py --artifact /path/to/new-harness --result /path/to/result.yaml
node tools/check.mjs
git add harnesses results README.md LEADERBOARD.md
git commit -m "Publish new harness and measured results"
git push
```

`publish.py` prepares local repository changes; only `git push` publishes them. It refuses an existing release identifier. Every artifact gets its own rendered Mermaid diagram, measured evolution curve, protocol, and score page. The leaderboard chooses the highest success score per benchmark among published records.

For a corrected measurement, publish a new dated record and explain the correction rather than silently replacing an old artifact. For a different actor, task set, simulator, or runtime-access contract, label the changed protocol explicitly; do not treat it as an equal-protocol gain.

The practical maintainer handoff is: **new harness + checkpoint identity + test metrics/coverage + protocol + curve**. Providing these is sufficient to prepare the next publication. Detailed private paper material is not required.
