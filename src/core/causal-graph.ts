import type {
  TrajectoryNode,
  CausalEdge,
  CausalRelation,
  NodeStatus
} from '../types/index.ts';
import { generateId } from '../utils/hash.ts';

export class CausalGraph {
  private nodes: Map<string, TrajectoryNode> = new Map();
  private edges: Map<string, CausalEdge> = new Map();
  // Adjacency lists for fast causal path computation
  private outgoing: Map<string, string[]> = new Map();
  private incoming: Map<string, string[]> = new Map();

  constructor(initialNodes: TrajectoryNode[] = [], initialEdges: CausalEdge[] = []) {
    for (const node of initialNodes) {
      this.addNode(node);
    }
    for (const edge of initialEdges) {
      this.addEdge(edge);
    }
  }

  /**
   * Registers a node in the causal graph.
   */
  public addNode(node: TrajectoryNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, []);
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, []);

    // If node explicitly declares causal parents, create edges
    for (const parentId of node.causalParents) {
      if (this.nodes.has(parentId)) {
        this.addCausalLink(parentId, node.id, this.inferRelation(this.nodes.get(parentId)!, node));
      }
    }
  }

  /**
   * Adds an edge between two causal nodes.
   */
  public addEdge(edge: CausalEdge): void {
    this.edges.set(edge.id, edge);
    this.outgoing.get(edge.source)?.push(edge.target);
    this.incoming.get(edge.target)?.push(edge.source);
  }

  /**
   * Creates a typed causal link between source and target.
   */
  public addCausalLink(
    sourceId: string,
    targetId: string,
    relation: CausalRelation,
    weight: number = 1.0,
    rationale?: string
  ): CausalEdge {
    const id = generateId('edge');
    const edge: CausalEdge = {
      id,
      source: sourceId,
      target: targetId,
      relation,
      weight,
      rationale
    };
    this.addEdge(edge);
    return edge;
  }

  /**
   * Automatically infers relation type based on source and target node types.
   */
  private inferRelation(source: TrajectoryNode, target: TrajectoryNode): CausalRelation {
    if (source.type === 'MODEL_REASONING' && target.type === 'TOOL_CALL') {
      return 'INVOKES';
    }
    if (source.type === 'TOOL_CALL' && target.type === 'TOOL_OBSERVATION') {
      return 'PRODUCES';
    }
    if (source.type === 'TOOL_OBSERVATION' && target.type === 'ENVIRONMENT_MUTATION') {
      return 'MUTATES';
    }
    if (target.type === 'INVARIANT_EVALUATION' && target.status === 'ERROR') {
      return 'VIOLATES';
    }
    return 'INFORMS';
  }

  public getNode(id: string): TrajectoryNode | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): TrajectoryNode[] {
    return Array.from(this.nodes.values()).sort((a, b) => a.stepIndex - b.stepIndex);
  }

  public getAllEdges(): CausalEdge[] {
    return Array.from(this.edges.values());
  }

  public getChildren(nodeId: string): TrajectoryNode[] {
    const childIds = this.outgoing.get(nodeId) || [];
    return childIds.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  public getParents(nodeId: string): TrajectoryNode[] {
    const parentIds = this.incoming.get(nodeId) || [];
    return parentIds.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * Recursively discovers all ancestors (root causes) of a given node.
   */
  public getAncestors(nodeId: string): TrajectoryNode[] {
    const visited = new Set<string>();
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const parents = this.incoming.get(current) || [];
      for (const p of parents) {
        if (!visited.has(p)) {
          visited.add(p);
          stack.push(p);
        }
      }
    }

    return Array.from(visited)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.stepIndex - b.stepIndex);
  }

  /**
   * Recursively discovers all downstream descendants affected by a given node.
   */
  public getDescendants(nodeId: string): TrajectoryNode[] {
    const visited = new Set<string>();
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = this.outgoing.get(current) || [];
      for (const c of children) {
        if (!visited.has(c)) {
          visited.add(c);
          stack.push(c);
        }
      }
    }

    return Array.from(visited)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.stepIndex - b.stepIndex);
  }

  /**
   * Performs topological sort using Kahn's algorithm.
   * Throws an error if cycle is detected.
   */
  public topologicalSort(): TrajectoryNode[] {
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
    }

    for (const edge of this.edges.values()) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order: TrajectoryNode[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(this.nodes.get(u)!);

      for (const v of this.outgoing.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    if (order.length !== this.nodes.size) {
      throw new Error('Causal trajectory contains cyclic dependency loop');
    }

    return order;
  }

  /**
   * Checks whether the trajectory has reasoning or tool execution loops.
   */
  public detectCycles(): boolean {
    try {
      this.topologicalSort();
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Computes normalized degree centrality for each node in the causal graph.
   * Centrality = (InDegree + OutDegree) / (2 * (N - 1))
   */
  public computeDegreeCentralities(): Map<string, number> {
    const n = this.nodes.size;
    const centralities = new Map<string, number>();
    if (n <= 1) {
      for (const id of this.nodes.keys()) centralities.set(id, 1.0);
      return centralities;
    }

    for (const id of this.nodes.keys()) {
      const inDeg = this.incoming.get(id)?.length || 0;
      const outDeg = this.outgoing.get(id)?.length || 0;
      const score = (inDeg + outDeg) / (2 * (n - 1));
      centralities.set(id, score);
    }

    return centralities;
  }

  /**
   * Serializes the causal DAG to Mermaid flowchart syntax.
   */
  public toMermaid(): string {
    const lines = ['flowchart TD'];

    for (const node of this.getAllNodes()) {
      const safeTitle = node.title.replace(/"/g, "'");
      let shape = `["${node.stepIndex}. ${safeTitle}"]`;
      if (node.type === 'TOOL_CALL') shape = `[["${node.stepIndex}. TOOL: ${safeTitle}"]]`;
      if (node.type === 'INVARIANT_EVALUATION') shape = `{"${node.stepIndex}. INVARIANT: ${safeTitle}"}`;
      if (node.status === 'ERROR' || node.status === 'VETOED') {
        lines.push(`    ${node.id}${shape}:::errNode`);
      } else {
        lines.push(`    ${node.id}${shape}`);
      }
    }

    for (const edge of this.getAllEdges()) {
      lines.push(`    ${edge.source} -->|${edge.relation}| ${edge.target}`);
    }

    lines.push('    classDef errNode fill:#f87171,stroke:#b91c1c,stroke-width:2px,color:#000;');
    return lines.join('\n');
  }
}
