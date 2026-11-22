/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Terminal Visualizer: Live ANSI/Unicode Thought Tree & Search Metrics Renderer
 */

import type { ThoughtNode } from '../core/thought-node.ts';
import type { SearchResult } from '../core/mcts-engine.ts';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgDark: '\x1b[40m'
};

export class TerminalVisualizer {
  /**
   * Render the entire MCTS search tree to an ANSI string
   */
  renderTree(root: ThoughtNode): string {
    const lines: string[] = [];
    lines.push(`${ANSI.bold}${ANSI.cyan}◈ BARON TEST-TIME REASONING TREE ◈${ANSI.reset}`);

    const printNode = (node: ThoughtNode, prefix: string, isLast: boolean) => {
      const marker = isLast ? '└── ' : '├── ';
      const statusColor = this.getStatusColor(node);
      const qVal = node.visitCount > 0 ? `Q=${node.meanValue.toFixed(2)}` : 'Q=--';
      const visits = `N=${node.visitCount}`;
      const typeTag = `[${node.type}]`;
      const shortDesc = node.description.length > 60
        ? node.description.substring(0, 57) + '...'
        : node.description;

      let statusBadge = `[${node.status}]`;
      if (node.status === 'PRUNED') {
        statusBadge = `${ANSI.red}[PRUNED]${ANSI.reset}`;
      } else if (node.status === 'VERIFIED') {
        statusBadge = `${ANSI.green}[VERIFIED]${ANSI.reset}`;
      } else if (node.status === 'TERMINAL') {
        statusBadge = `${ANSI.bold}${ANSI.yellow}[TERMINAL]${ANSI.reset}`;
      }

      lines.push(
        `${prefix}${marker}${statusColor}${typeTag}${ANSI.reset} ${shortDesc} ` +
        `${ANSI.dim}(${visits}, ${qVal})${ANSI.reset} ${statusBadge}`
      );

      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        printNode(children[i], nextPrefix, i === children.length - 1);
      }
    };

    printNode(root, '', true);
    return lines.join('\n');
  }

  /**
   * Render summary dashboard of test-time compute metrics
   */
  renderMetrics(result: SearchResult): string {
    const divider = '═'.repeat(68);
    return `
${ANSI.cyan}${divider}${ANSI.reset}
${ANSI.bold}  BARON REASONING HYPERVISOR — TEST-TIME METRICS${ANSI.reset}
${ANSI.cyan}${divider}${ANSI.reset}
  • ${ANSI.bold}Convergence:${ANSI.reset}          ${result.converged ? `${ANSI.green}VERIFIED TARGET ACHIEVED${ANSI.reset}` : `${ANSI.yellow}BUDGET COMPLETED${ANSI.reset}`}
  • ${ANSI.bold}Execution Duration:${ANSI.reset}   ${result.durationMs}ms
  • ${ANSI.bold}MCTS Rollouts:${ANSI.reset}        ${result.totalRollouts}
  • ${ANSI.bold}Tokens Consumed:${ANSI.reset}      ~${result.totalTokensConsumed.toLocaleString()}
  • ${ANSI.bold}Zero-Token Savings:${ANSI.reset}   ${ANSI.green}~${result.tokensSavedByPruning.toLocaleString()} tokens saved${ANSI.reset}
  • ${ANSI.bold}Pruned Dead-Ends:${ANSI.reset}     ${ANSI.red}${result.prunedBranchesCount} branches pruned${ANSI.reset}
  • ${ANSI.bold}Total Trajectories:${ANSI.reset}   ${result.allTrajectories.length}
${ANSI.cyan}${divider}${ANSI.reset}
`;
  }

  private getStatusColor(node: ThoughtNode): string {
    switch (node.status) {
      case 'VERIFIED':
        return ANSI.green;
      case 'PRUNED':
        return ANSI.red;
      case 'TERMINAL':
        return ANSI.yellow;
      case 'EXPLORING':
        return ANSI.cyan;
      default:
        return ANSI.dim;
    }
  }
}
