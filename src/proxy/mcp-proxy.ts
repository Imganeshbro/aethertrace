import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { FlightRecorder } from '../core/recorder.ts';
import type { AgentFirewall } from '../core/firewall.ts';

export interface McpProxyOptions {
  serverCommand: string;
  serverArgs: string[];
  recorder: FlightRecorder;
  firewall?: AgentFirewall;
  onResponse?: (response: string) => void;
}

export class McpProxy {
  private serverCommand: string;
  private serverArgs: string[];
  private recorder: FlightRecorder;
  private firewall?: AgentFirewall;
  private onResponse?: (response: string) => void;
  private childProcess: ChildProcess | null = null;
  private activeCallMap: Map<string | number, { toolName: string; args: unknown; startTime: number }> = new Map();

  constructor(options: McpProxyOptions) {
    this.serverCommand = options.serverCommand;
    this.serverArgs = options.serverArgs;
    this.recorder = options.recorder;
    this.firewall = options.firewall || options.recorder.getFirewall();
    this.onResponse = options.onResponse;
  }

  /**
   * Starts the underlying MCP server subprocess and instruments stdin/stdout streams.
   */
  public start(): void {
    this.childProcess = spawn(this.serverCommand, this.serverArgs, {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: true
    });

    if (!this.childProcess.stdin || !this.childProcess.stdout) {
      throw new Error(`Failed to bind stdio pipes to MCP server: ${this.serverCommand}`);
    }

    const rl = createInterface({ input: this.childProcess.stdout });

    rl.on('line', (line: string) => {
      this.handleServerResponse(line);
    });

    this.childProcess.on('exit', (code: number | null) => {
      this.recorder.recordStep(
        'ENVIRONMENT_MUTATION',
        `MCP Server Exited`,
        { exitCode: code }
      );
    });
  }

  /**
   * Forwards an incoming JSON-RPC request from an agent/client to the MCP server.
   * Intercepts `tools/call` for firewall evaluation and flight recording.
   */
  public async handleClientRequest(rawRequest: string): Promise<string | null> {
    try {
      const msg = JSON.parse(rawRequest);

      if (msg.method === 'tools/call') {
        const toolName = msg.params?.name || 'unknown_tool';
        const toolArgs = msg.params?.arguments || {};

        // Record tool call
        const recordedNode = await this.recorder.recordStep(
          'TOOL_CALL',
          `Tool Call: ${toolName}`,
          toolArgs,
          { metadata: { toolName } }
        );

        // If the firewall vetoed the step, block execution and synthesize error
        if (recordedNode.status === 'VETOED') {
          const vetoResponse = JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: {
              code: -32603,
              message: `AgentRewind Firewall Veto: Execution blocked by active safety invariant`
            }
          });
          if (this.onResponse) {
            this.onResponse(vetoResponse);
          }
          return vetoResponse;
        }

        this.activeCallMap.set(msg.id, { toolName, args: toolArgs, startTime: Date.now() });
      }

      // Forward to underlying MCP server
      if (this.childProcess?.stdin && !this.childProcess.stdin.destroyed) {
        this.childProcess.stdin.write(rawRequest + '\n');
      }

      return null;
    } catch {
      // In case of non-JSON input, forward directly
      if (this.childProcess?.stdin && !this.childProcess.stdin.destroyed) {
        this.childProcess.stdin.write(rawRequest + '\n');
      }
      return null;
    }
  }

  /**
   * Intercepts outgoing response from the MCP server back to the agent client.
   */
  private async handleServerResponse(rawResponse: string): Promise<void> {
    try {
      const msg = JSON.parse(rawResponse);
      const callData = this.activeCallMap.get(msg.id);

      if (callData) {
        this.activeCallMap.delete(msg.id);
        const durationMs = Date.now() - callData.startTime;
        const result = msg.result || msg.error;

        await this.recorder.recordStep(
          'TOOL_OBSERVATION',
          `Observation: ${callData.toolName}`,
          result,
          {
            metadata: {
              toolName: callData.toolName,
              durationMs,
              isError: !!msg.error
            }
          }
        );
      }
    } catch {
      // Pass-through logging if unparseable
    }

    // Forward to parent output stream or callback for agent consumer
    if (this.onResponse) {
      this.onResponse(rawResponse);
    } else {
      process.stdout.write(rawResponse + '\n');
    }
  }

  public stop(): void {
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }
  }
}
