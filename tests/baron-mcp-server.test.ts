import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

describe('BARON MCP Server: JSON-RPC Integration', () => {
  const mcpServerPath = join(process.cwd(), 'src', 'mcp', 'server.ts');

  test('responds to initialize and tools/list requests via stdio', async () => {
    const child = spawn(process.execPath, ['--experimental-strip-types', mcpServerPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    const responses: any[] = [];
    let buffer = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          responses.push(JSON.parse(line.trim()));
        }
      }
    });

    // 1. Send initialize
    const initReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    }) + '\n';

    // 2. Send tools/list
    const toolsReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    }) + '\n';

    child.stdin.write(initReq);
    child.stdin.write(toolsReq);

    // Give server time to respond
    await new Promise((r) => setTimeout(r, 800));

    child.kill();

    assert.ok(responses.length >= 2, `Expected >= 2 responses, got ${responses.length}`);
    const initRes = responses.find((r) => r.id === 1);
    assert.strictEqual(initRes?.result?.serverInfo?.name, 'baron-tts-mcp');

    const toolsRes = responses.find((r) => r.id === 2);
    const toolNames = toolsRes?.result?.tools?.map((t: any) => t.name);
    assert.ok(toolNames.includes('baron_verify_step'));
    assert.ok(toolNames.includes('baron_reason'));
  });
});
