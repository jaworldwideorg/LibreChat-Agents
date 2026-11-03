# JA fork upstream synchronization

`main` tracks `LibreChat-AI/agents:main` through the **JA daily upstream sync**
workflow every day at 05:23 UTC. The workflow is also manually runnable.
GitHub schedules run from the default branch, so this workflow lives on `main`.

The workflow prepares a normal merge and tests the merged, locked source before
pushing. Failed validation, a new audit finding or a merge conflict leaves the remote unchanged.
An unchanged scheduled check finishes without installing or publishing anything.
The GitHub token has only repository content-write permission in this job;
non-fast-forward pushes are rejected normally. Source verification runs inside
the sync workflow because GitHub-token pushes do not trigger another Actions run.

The upstream npm publisher is restricted to `LibreChat-AI/agents`; this fork's
sync neither publishes npm packages nor deploys production services.
`fixes/mcp-ptc-delivery` retains the separate attachment-delivery work and is
maintained independently by the daily Codex fallback. A `main` update does not
change LibreChat's production SDK pin.

The fork owns its workflow configuration. Subsequent merges preserve
`.github/workflows` from fork `main`, including the publisher guard and daily
sync gate, while incorporating upstream source and commit ancestry. This also
keeps content-write-only automation from modifying workflow permissions.

Local sync contracts: `python3 scripts/ja-upstream-sync.test.py`.

Primary documentation:

- [Scheduled workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Workflow-trigger behavior for GitHub tokens](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)
