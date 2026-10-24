---
name: agent-rewind
description: Autonomous Agent Time-Travel Debugger, Causal Flight Recorder, and Invariant Verification Engine. Use when diagnosing agent loop deadlocks, analyzing root-cause failures in multi-step trajectories, enforcing pre-execution safety invariants, or compiling agent runs into deterministic zero-token CI regression tests.
---

# AgentRewind Skill

Use this skill whenever an autonomous agent needs to:
1. **Pre-screen tool commands against security invariants**: Verify that shell commands, file modifications, or external queries do not breach workspace boundaries, leak API credentials, or trigger destructive operations.
2. **Diagnose and attribute causal blame**: Analyze multi-step failures to mathematically pinpoint the upstream root cause (e.g., corrupted tool observation at Step 3 causing cascading failure at Step 48).
3. **Execute zero-token counterfactual rewinds/forks**: Rewind to an earlier step and test alternative prompts or tool mocks without spending LLM tokens on historical steps.
4. **Synthesize deterministic CI regression tests**: Convert an execution trajectory into an offline, zero-token Node.js test file.

## Tools Provided by AgentRewind MCP Server

### 1. `agent_rewind_evaluate_invariant`
Always invoke this before executing potentially sensitive commands or operations:
```json
{
  "type": "TOOL_CALL",
  "title": "execute_shell",
  "content": { "command": "rm -rf /cache" }
}
```
**Outcome**: Returns `{ "allowed": false, "evaluations": [...] }` if an invariant is violated.

### 2. `agent_rewind_record_step`
Records a thought, tool call, observation, or response into the content-addressed immutable graph:
```json
{
  "sessionName": "build_task_1",
  "type": "TOOL_CALL",
  "title": "git status",
  "content": { "cmd": "git status" }
}
```

### 3. `agent_rewind_get_causal_blame`
Whenever an agent workflow fails or an unexpected error occurs, call this to determine the exact upstream culprit:
```json
{
  "tracePath": "traces/demo_failure.atrace"
}
```

### 4. `agent_rewind_time_travel_fork`
Rewinds execution to a previous step and tests an alternative branch:
```json
{
  "tracePath": "traces/demo_failure.atrace",
  "forkAtStep": 3,
  "overridePayload": { "status": 200, "data": "clean_response" }
}
```

### 5. `agent_rewind_synth_regression_test`
Export the verified trajectory into a permanent test fixture:
```json
{
  "tracePath": "traces/demo_failure.atrace",
  "outputPath": "tests/regression_fix.test.ts"
}
```
