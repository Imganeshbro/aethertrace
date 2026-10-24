import { createInterface } from 'node:readline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { FlightRecorder } from '../core/recorder.ts';
import { CausalBlameEngine } from '../core/blame-engine.ts';
import { AgentFirewall } from '../core/firewall.ts';
import { TimeTravelEngine } from '../core/time-travel.ts';
import { TestSynthesizer } from '../synthesizer/test-generator.ts';
import type { TrajectoryNodeType, NodeStatus } from '../types/index.ts';

export interface McpServerConfig {
  defaultSessionName?: string;
  workspaceRoot?: string;
}

export class AetherTraceMcpServer {
  private activeRecorders: Map<string, FlightRecorder> = new Map();
  private firewall: AgentFirewall;
  private defaultSessionName: string;

  constructor(config: McpServerConfig = {}) {
    this.defaultSessionName = config.defaultSessionName || 'active_agent_session';
    this.firewall = new AgentFirewall(config.workspaceRoot || process.cwd());
  }

  public getOrCreateRecorder(sessionName?: string): FlightRecorder {
    const name = sessionName || this.defaultSessionName;
    if (!this.activeRecorders.has(name)) {
      this.activeRecorders.set(name, new FlightRecorder(name, undefined, this.firewall));
    }
    return this.activeRecorders.get(name)!;
  }

  /**
   * Processes a single incoming JSON-RPC 2.0 request and returns the response object.
   */
  public async handleMessage(rawMessage: string): Promise<Record<string, unknown> | null> {
    let msg: any;
    try {
      msg = JSON.parse(rawMessage);
    } catch {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      };
    }

    const { id, method, params } = msg;

    // Handle notifications (no response needed)
    if (!id && method) {
      return null;
    }

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false }
            },
            serverInfo: {
              name: 'aethertrace-mcp-server',
              version: '1.0.0'
            }
          }
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'aethertrace_record_step',
                description: 'Record an agent execution step (thought, tool call, observation) with SHA-256 content addressing and active invariant safety checks.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    sessionName: { type: 'string', description: 'Session identifier' },
                    type: {
                      type: 'string',
                      enum: ['USER_INPUT', 'MODEL_REASONING', 'TOOL_CALL', 'TOOL_OBSERVATION', 'ENVIRONMENT_MUTATION', 'AGENT_RESPONSE'],
                      description: 'Type of trajectory step'
                    },
                    title: { type: 'string', description: 'Human-readable step summary' },
                    content: { type: 'object', description: 'Structured payload or data' },
                    status: { type: 'string', enum: ['SUCCESS', 'WARNING', 'ERROR'], description: 'Step outcome' }
                  },
                  required: ['type', 'title', 'content']
                }
              },
              {
                name: 'aethertrace_get_causal_blame',
                description: 'Analyze the active or serialized agent trajectory and identify the root cause of failures using Causal DAG attribution.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    tracePath: { type: 'string', description: 'Optional path to .atrace bundle file' },
                    sessionName: { type: 'string', description: 'Active session name if not reading from file' }
                  }
                }
              },
              {
                name: 'aethertrace_evaluate_invariant',
                description: 'Pre-screen a prospective tool command or observation against active security invariants (anti-injection, path confinement, secret leak guard).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['TOOL_CALL', 'TOOL_OBSERVATION', 'ENVIRONMENT_MUTATION'] },
                    title: { type: 'string' },
                    content: { type: 'object' }
                  },
                  required: ['type', 'title', 'content']
                }
              },
              {
                name: 'aethertrace_time_travel_fork',
                description: 'Rewind trajectory to step N and inject an override payload to branch execution counterfactually with zero token cost.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    tracePath: { type: 'string', description: 'Path to .atrace trace bundle' },
                    forkAtStep: { type: 'number', description: 'Zero-based step index to branch' },
                    overridePayload: { type: 'object', description: 'Patched payload for fork' }
                  },
                  required: ['tracePath', 'forkAtStep']
                }
              },
              {
                name: 'aethertrace_synth_regression_test',
                description: 'Compile an agent failure trace into an offline, zero-token deterministic CI regression test suite.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    tracePath: { type: 'string', description: 'Path to source .atrace trace bundle' },
                    outputPath: { type: 'string', description: 'Target destination test file path' }
                  },
                  required: ['tracePath']
                }
              }
            ]
          }
        };

      case 'tools/call':
        try {
          const toolName = params?.name;
          const args = params?.arguments || {};
          const resultText = await this.executeTool(toolName, args);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: resultText }]
            }
          };
        } catch (err: any) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: err?.message || 'Internal error executing tool'
            }
          };
        }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<string> {
    switch (name) {
      case 'aethertrace_record_step': {
        const recorder = this.getOrCreateRecorder(args.sessionName);
        const node = await recorder.recordStep(
          args.type as TrajectoryNodeType,
          args.title,
          args.content,
          { status: args.status as NodeStatus }
        );
        return JSON.stringify({
          status: node.status,
          stepIndex: node.stepIndex,
          nodeId: node.id,
          contentHash: node.contentHash,
          vetoed: node.status === 'VETOED'
        }, null, 2);
      }

      case 'aethertrace_get_causal_blame': {
        let graph;
        if (args.tracePath) {
          const loaded = await FlightRecorder.loadFromFile(args.tracePath);
          graph = loaded.graph;
        } else {
          const recorder = this.getOrCreateRecorder(args.sessionName);
          graph = recorder.getGraph();
        }

        const blameEngine = new CausalBlameEngine(graph);
        const report = blameEngine.attributeBlame();
        return JSON.stringify({
          totalBlamedNodes: report.length,
          rankings: report
        }, null, 2);
      }

      case 'aethertrace_evaluate_invariant': {
        const tempNode = {
          id: 'temp_eval',
          stepIndex: 0,
          timestamp: new Date().toISOString(),
          type: args.type,
          title: args.title,
          content: args.content,
          contentHash: 'temp',
          causalParents: [],
          status: 'SUCCESS' as NodeStatus,
          metadata: {}
        };
        const res = await this.firewall.evaluateNode(tempNode, []);
        return JSON.stringify({
          allowed: res.passed,
          evaluations: res.results
        }, null, 2);
      }

      case 'aethertrace_time_travel_fork': {
        const { bundle } = await FlightRecorder.loadFromFile(args.tracePath);
        const tt = new TimeTravelEngine(bundle);
        const forkRecorder = await tt.createFork({
          forkAtStep: args.forkAtStep,
          overridePayload: args.overridePayload,
          replayMockStrategy: 'ZERO_TOKEN_GHOST'
        });
        const forkedBundle = forkRecorder.finalize();
        const diff = TimeTravelEngine.compareTrajectories(bundle, forkedBundle, args.forkAtStep);
        return JSON.stringify({
          forkedSession: forkedBundle.metadata.sessionName,
          diff
        }, null, 2);
      }

      case 'aethertrace_synth_regression_test': {
        const { bundle } = await FlightRecorder.loadFromFile(args.tracePath);
        const synth = new TestSynthesizer(bundle);
        const code = synth.generateTestCode();
        if (args.outputPath) {
          await fs.writeFile(path.resolve(args.outputPath), code, 'utf-8');
        }
        return JSON.stringify({
          generatedBytes: code.length,
          savedTo: args.outputPath || 'in-memory',
          preview: code.slice(0, 300) + '...'
        }, null, 2);
      }

      default:
        throw new Error(`Unknown AetherTrace tool: ${name}`);
    }
  }

  /**
   * Starts listening to stdio for JSON-RPC messages (standard MCP server execution).
   */
  public startStdio(): void {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const response = await this.handleMessage(trimmed);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    });
  }
}

// Standalone runner
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const server = new AetherTraceMcpServer();
  server.startStdio();
}
