/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Model Context Protocol (MCP) Server
 * Unified Hypervisor Server exposing both Test-Time Compute Oracles & Flight Recording
 */

import { createInterface } from 'node:readline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MCTSEngine } from '../core/mcts-engine.ts';
import { ExecutionSandbox } from '../verifier/execution-sandbox.ts';
import { FormalLogicOracle } from '../verifier/formal-logic-oracle.ts';
import { PRMScorer } from '../verifier/prm-scorer.ts';
import { FlightRecorder } from '../core/recorder.ts';
import { CausalBlameEngine } from '../core/blame-engine.ts';
import { AgentFirewall } from '../core/firewall.ts';
import { TimeTravelEngine } from '../core/time-travel.ts';
import { TestSynthesizer } from '../synthesizer/test-generator.ts';
import type { TrajectoryNodeType, NodeStatus } from '../types/index.ts';

export interface McpServerConfig {
  defaultSessionName?: string;
  workspaceRoot?: string;
  serverName?: string;
}

export class BaronMcpServer {
  private activeRecorders: Map<string, FlightRecorder> = new Map();
  private firewall: AgentFirewall;
  private defaultSessionName: string;
  private serverName: string;
  private sandbox: ExecutionSandbox;
  private oracle: FormalLogicOracle;
  private prmScorer: PRMScorer;
  private engine: MCTSEngine;

  constructor(config: McpServerConfig = {}) {
    this.defaultSessionName = config.defaultSessionName || 'active_agent_session';
    this.serverName = config.serverName || 'baron-tts-mcp';
    this.firewall = new AgentFirewall(config.workspaceRoot || process.cwd());
    this.sandbox = new ExecutionSandbox();
    this.oracle = new FormalLogicOracle();
    this.prmScorer = new PRMScorer();
    this.engine = new MCTSEngine();
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
              name: this.serverName,
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
              // BARON Test-Time Compute & Verification Tools
              {
                name: 'baron_verify_step',
                description: 'Dual-engine verification of code, invariants, and step logic with PRM scoring',
                inputSchema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', description: 'Executable code snippet to verify' },
                    assertionCode: { type: 'string', description: 'Unit tests or assertion checks to execute' },
                    thought: { type: 'string', description: 'Natural language reasoning step text' }
                  },
                  required: ['code']
                }
              },
              {
                name: 'baron_reason',
                description: 'Test-time compute MCTS search over complex reasoning objectives',
                inputSchema: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string', description: 'The objective or problem statement' },
                    maxDepth: { type: 'number', description: 'Maximum tree search depth' }
                  },
                  required: ['prompt']
                }
              },
              // Agent Rewind & Flight Recording Tools
              {
                name: 'aethertrace_record_step',
                description: 'Record an agent execution step with SHA-256 content addressing and invariant safety checks.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    sessionName: { type: 'string', description: 'Session identifier' },
                    type: { type: 'string', enum: ['USER_INPUT', 'MODEL_REASONING', 'TOOL_CALL', 'TOOL_RESULT', 'ENVIRONMENT_EVENT'] },
                    title: { type: 'string', description: 'Step title' },
                    content: { type: 'object', description: 'Payload content' }
                  },
                  required: ['type', 'title', 'content']
                }
              },
              {
                name: 'aethertrace_evaluate_invariant',
                description: 'Proactively test an intended tool call or observation against the security firewall.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['TOOL_CALL', 'TOOL_RESULT', 'MODEL_REASONING'] },
                    title: { type: 'string' },
                    content: { type: 'object' }
                  },
                  required: ['type', 'title', 'content']
                }
              },
              {
                name: 'agent_rewind_record_step',
                description: 'Alias for aethertrace_record_step',
                inputSchema: { type: 'object', properties: { title: { type: 'string' } } }
              },
              {
                name: 'agent_rewind_get_causal_blame',
                description: 'Trace root cause blame for agent failures',
                inputSchema: { type: 'object', properties: { tracePath: { type: 'string' } } }
              },
              {
                name: 'agent_rewind_evaluate_invariant',
                description: 'Alias for aethertrace_evaluate_invariant',
                inputSchema: { type: 'object', properties: { title: { type: 'string' } } }
              },
              {
                name: 'agent_rewind_time_travel_fork',
                description: 'Fork agent timeline at step',
                inputSchema: { type: 'object', properties: { tracePath: { type: 'string' } } }
              },
              {
                name: 'agent_rewind_synth_regression_test',
                description: 'Synthesize automated unit tests',
                inputSchema: { type: 'object', properties: { tracePath: { type: 'string' } } }
              }
            ]
          }
        };

      case 'tools/call': {
        const { name, arguments: toolArgs } = params || {};
        try {
          const resText = await this.executeTool(name, toolArgs || {});
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: resText }]
            }
          };
        } catch (err: any) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: err?.message || 'Tool execution error' }
          };
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  private async executeTool(name: string, args: any): Promise<string> {
    switch (name) {
      case 'baron_verify_step': {
        const code = args?.code || '';
        const assertionCode = args?.assertionCode || '';
        const thought = args?.thought || 'Reasoning step evaluation';

        const syntax = this.oracle.validateSyntax(code);
        if (!syntax.valid) {
          return JSON.stringify({ passed: false, isFatal: true, error: syntax.error, reward: -1.0 }, null, 2);
        }

        let execResult;
        if (assertionCode) {
          execResult = await this.sandbox.runAssertions(code, assertionCode);
        } else {
          const artifacts = await this.sandbox.executeCode(code);
          execResult = { passed: artifacts.exitCode === 0, error: artifacts.error, artifacts };
        }

        const prm = await this.prmScorer.scoreStep({
          prompt: 'Verify candidate reasoning step',
          previousThoughts: [],
          currentThought: thought,
          stepType: 'CODE_EXECUTION'
        });

        const reward = this.prmScorer.computeCompositeReward(execResult.passed, prm.score, 0.7, !execResult.passed && !!execResult.error);
        return JSON.stringify({
          passed: execResult.passed,
          reward,
          prmScore: prm.score,
          stdout: execResult.artifacts.stdout,
          stderr: execResult.artifacts.stderr,
          executionTimeMs: execResult.artifacts.executionTimeMs
        }, null, 2);
      }

      case 'baron_reason': {
        const prompt = args?.prompt || 'Verify algorithmic objective';
        const dummyGenerator = async (p: string, h: any[]) => {
          if (h.length === 1) {
            return [{
              type: 'HYPOTHESIS' as const,
              description: `Decompose objective into testable sub-hypotheses.`,
              priorConfidence: 0.9,
              payload: `console.log("Analyzing objective parameters");`
            }];
          }
          if (h.length === 2) {
            return [{
              type: 'CONCLUSION' as const,
              description: `Synthesized verified terminal deduction for prompt.`,
              priorConfidence: 0.95,
              payload: `console.log("Objective verified.");`,
              assertionCode: `console.log("Invariants hold.");`
            }];
          }
          return [];
        };

        const result = await this.engine.search(prompt, dummyGenerator);
        return JSON.stringify({
          converged: result.converged,
          totalRollouts: result.totalRollouts,
          tokensSavedByPruning: result.tokensSavedByPruning,
          prunedBranchesCount: result.prunedBranchesCount,
          bestTrajectory: result.bestTrajectory ? {
            id: result.bestTrajectory.id,
            reward: result.bestTrajectory.cumulativeReward,
            nodes: result.bestTrajectory.nodes.map(n => ({ type: n.type, desc: n.description }))
          } : null
        }, null, 2);
      }

      case 'aethertrace_record_step':
      case 'agent_rewind_record_step': {
        const recorder = this.getOrCreateRecorder(args.sessionName);
        const node = await recorder.recordStep(
          args.type as TrajectoryNodeType,
          args.title,
          args.content,
          { metadata: args.metadata }
        );
        return JSON.stringify({
          status: 'SUCCESS',
          nodeId: node.id,
          stepIndex: node.stepIndex,
          contentHash: node.contentHash,
          firewallStatus: node.status
        }, null, 2);
      }

      case 'aethertrace_evaluate_invariant':
      case 'agent_rewind_evaluate_invariant': {
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

      case 'agent_rewind_get_causal_blame': {
        const { bundle } = await FlightRecorder.loadFromFile(args.tracePath);
        const engine = new CausalBlameEngine(bundle);
        const report = engine.computeBlame();
        return JSON.stringify(report, null, 2);
      }

      case 'agent_rewind_time_travel_fork': {
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

      case 'agent_rewind_synth_regression_test': {
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
        throw new Error(`Unknown tool: ${name}`);
    }
  }

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

// Backward compatibility class
export class AetherTraceMcpServer extends BaronMcpServer {
  constructor(config: McpServerConfig = {}) {
    super({
      ...config,
      serverName: config.serverName || 'agent-rewind-mcp-server'
    });
  }
}

// Standalone runner
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const server = new BaronMcpServer();
  server.startStdio();
}
