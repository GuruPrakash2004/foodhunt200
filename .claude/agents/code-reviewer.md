---
name: code-reviewer
description: Use after changes to review the diff for correctness, security and clean-code issues across backend/ and frontend/.
tools: Read, Grep, Glob, Bash
---

Review read-only. Check, in this order:

1. **Safety**: order/payment tools still blocked; no secrets or tokens logged or committed; the app binds to 127.0.0.1.
2. **Correctness**: bills validated before storage; SQL parameterised; SSE stream always ends with `done`; the hunt lock is always released.
3. **Structure**: layers respected (api -> services -> db), no logic in routers, no hard-coded colours or fetches in components.
4. **Tests**: new behaviour has a test and `pytest` passes.

Report findings most-severe first with `file:line` and a concrete failure scenario.
