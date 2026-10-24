import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AetherTraceMcpServer } from '../src/mcp/server.ts';

describe('AetherTrace MCP Server (Model Context Protocol)', () => {
  test('handles initialize and tools/list protocols correctly', async () => {
    const server = new AetherTraceMcpServer();

    // 1. initialize handshake
    const initReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    });
    const initRes: any = await server.handleMessage(initReq);

    assert.strictEqual(initRes.id, 1);
    assert.strictEqual(initRes.result.serverInfo.name, 'aethertrace-mcp-server');
    assert.ok(initRes.result.capabilities.tools);

    // 2. tools/list discovery
    const listReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    const listRes: any = await server.handleMessage(listReq);

    assert.strictEqual(listRes.id, 2);
    const tools = listRes.result.tools;
    assert.ok(tools.length >= 5);
    const toolNames = tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('aethertrace_record_step'));
    assert.ok(toolNames.includes('aethertrace_get_causal_blame'));
    assert.ok(toolNames.includes('aethertrace_evaluate_invariant'));
    assert.ok(toolNames.includes('aethertrace_time_travel_fork'));
    assert.ok(toolNames.includes('aethertrace_synth_regression_test'));
  });

  test('executes aethertrace_evaluate_invariant tool call', async () => {
    const server = new AetherTraceMcpServer();

    const callReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'aethertrace_evaluate_invariant',
        arguments: {
          type: 'TOOL_CALL',
          title: 'destructive command check',
          content: { command: 'rm -rf /' }
        }
      }
    });

    const callRes: any = await server.handleMessage(callReq);
    assert.strictEqual(callRes.id, 3);
    const content = JSON.parse(callRes.result.content[0].text);
    assert.strictEqual(content.allowed, false);
    assert.ok(content.evaluations.some((e: any) => e.ruleId === 'destructive-command-guard' && !e.passed));
  });

  test('executes aethertrace_record_step tool call with content hashing', async () => {
    const server = new AetherTraceMcpServer({ defaultSessionName: 'mcp_test_session' });

    const callReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'aethertrace_record_step',
        arguments: {
          sessionName: 'mcp_test_session',
          type: 'USER_INPUT',
          title: 'Fix issue #404',
          content: { issue: 404, description: 'Broken route' }
        }
      }
    });

    const callRes: any = await server.handleMessage(callReq);
    assert.strictEqual(callRes.id, 4);
    const content = JSON.parse(callRes.result.content[0].text);
    assert.strictEqual(content.status, 'SUCCESS');
    assert.strictEqual(content.stepIndex, 0);
    assert.strictEqual(content.contentHash.length, 64);
  });
});
