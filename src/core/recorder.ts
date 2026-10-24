import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  TrajectoryNode,
  TrajectoryNodeType,
  NodeStatus,
  TraceBundle,
  TrajectoryMetadata,
  InvariantResult,
  BlameScore
} from '../types/index.ts';
import { computeSha256, generateId } from '../utils/hash.ts';
import { CausalGraph } from './causal-graph.ts';
import { AgentFirewall } from './firewall.ts';
import { CausalBlameEngine } from './blame-engine.ts';

export class FlightRecorder {
  private traceId: string;
  private sessionName: string;
  private agentCommand?: string;
  private startTime: number;
  private nodes: TrajectoryNode[] = [];
  private graph: CausalGraph;
  private firewall: AgentFirewall;
  private invariants: InvariantResult[] = [];
  private status: 'SUCCESS' | 'FAILED' | 'VETOED' = 'SUCCESS';
  private totalTokens: number = 0;
  private estimatedCostUsd: number = 0;

  constructor(sessionName: string = 'agent_run', agentCommand?: string, firewall?: AgentFirewall) {
    this.traceId = generateId('trace');
    this.sessionName = sessionName;
    this.agentCommand = agentCommand;
    this.startTime = Date.now();
    this.graph = new CausalGraph();
    this.firewall = firewall || new AgentFirewall();
  }

  public getTraceId(): string {
    return this.traceId;
  }

  public getGraph(): CausalGraph {
    return this.graph;
  }

  public getFirewall(): AgentFirewall {
    return this.firewall;
  }

  public getNodes(): TrajectoryNode[] {
    return [...this.nodes];
  }

  public getInvariants(): InvariantResult[] {
    return [...this.invariants];
  }

  /**
   * Records a step in the agent execution trajectory.
   * Intercepts through the firewall; if a BLOCKING invariant fails, vetoes the step.
   */
  public async recordStep(
    type: TrajectoryNodeType,
    title: string,
    content: unknown,
    options: {
      causalParents?: string[];
      status?: NodeStatus;
      metadata?: Record<string, unknown>;
      tokens?: { prompt?: number; completion?: number; total?: number };
      costUsd?: number;
    } = {}
  ): Promise<TrajectoryNode> {
    const stepIndex = this.nodes.length;
    const contentHash = computeSha256(content);
    const nodeId = generateId(`step${stepIndex}`);

    // If parents not specified, default to previous node if available
    let parents = options.causalParents || [];
    if (parents.length === 0 && this.nodes.length > 0) {
      parents = [this.nodes[this.nodes.length - 1].id];
    }

    let initialStatus: NodeStatus = options.status || 'SUCCESS';
    if (!options.status && typeof content === 'object' && content !== null && 'error' in content) {
      initialStatus = 'ERROR';
    }

    const node: TrajectoryNode = {
      id: nodeId,
      stepIndex,
      timestamp: new Date().toISOString(),
      type,
      title,
      content,
      contentHash,
      causalParents: parents,
      status: initialStatus,
      metadata: {
        ...(options.metadata || {}),
        tokens: options.tokens,
        costUsd: options.costUsd
      }
    };

    if (options.tokens?.total) {
      this.totalTokens += options.tokens.total;
    }
    if (options.costUsd) {
      this.estimatedCostUsd += options.costUsd;
    }

    // Evaluate firewall invariants
    const firewallCheck = await this.firewall.evaluateNode(node, this.nodes);
    for (const inv of firewallCheck.results) {
      this.invariants.push(inv);
    }

    if (!firewallCheck.passed) {
      node.status = 'VETOED';
      this.status = 'VETOED';
    }

    this.nodes.push(node);
    this.graph.addNode(node);

    return node;
  }

  public setStatus(status: 'SUCCESS' | 'FAILED' | 'VETOED'): void {
    this.status = status;
  }

  /**
   * Finalizes the trajectory and generates the complete TraceBundle.
   */
  public finalize(explicitStatus?: 'SUCCESS' | 'FAILED' | 'VETOED'): TraceBundle {
    const durationMs = Date.now() - this.startTime;

    // Check if any node had an ERROR status
    let finalStatus = explicitStatus || this.status;
    if (finalStatus === 'SUCCESS') {
      const hasErrors = this.nodes.some(n => n.status === 'ERROR');
      if (hasErrors) finalStatus = 'FAILED';
    }

    this.status = finalStatus;

    // Run causal blame analysis if failed or vetoed
    let blameReport: BlameScore[] | undefined;
    if (finalStatus !== 'SUCCESS') {
      const blameEngine = new CausalBlameEngine(this.graph);
      blameReport = blameEngine.attributeBlame();
    }

    const metadata: TrajectoryMetadata = {
      traceId: this.traceId,
      sessionName: this.sessionName,
      agentCommand: this.agentCommand,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationMs,
      status: finalStatus,
      totalNodes: this.nodes.length,
      totalTokens: this.totalTokens,
      estimatedCostUsd: Number(this.estimatedCostUsd.toFixed(4))
    };

    return {
      version: '1.0.0',
      metadata,
      nodes: this.nodes,
      edges: this.graph.getAllEdges(),
      invariants: this.invariants,
      blameReport
    };
  }

  /**
   * Saves the recorded trace bundle atomically to disk as an `.atrace` file.
   */
  public async saveToFile(filePath: string): Promise<string> {
    const bundle = this.finalize();
    const resolvedPath = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, JSON.stringify(bundle, null, 2), 'utf-8');
    return resolvedPath;
  }

  /**
   * Loads a saved `.atrace` bundle from disk into a CausalGraph and returns the bundle.
   */
  public static async loadFromFile(filePath: string): Promise<{ bundle: TraceBundle; graph: CausalGraph }> {
    const raw = await fs.readFile(path.resolve(filePath), 'utf-8');
    const bundle = JSON.parse(raw) as TraceBundle;
    const graph = new CausalGraph(bundle.nodes, bundle.edges);
    return { bundle, graph };
  }
}
