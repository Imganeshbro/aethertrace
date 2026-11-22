/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * HTML Tree Visualizer: Interactive SVG/Canvas Graph Dashboard Generator
 */

import type { ThoughtNode } from '../core/thought-node.ts';
import type { SearchResult } from '../core/mcts-engine.ts';

export class HtmlTreeGenerator {
  /**
   * Generate a standalone interactive HTML dashboard from a search result
   */
  generateHtml(result: SearchResult, prompt: string): string {
    const treeDataJson = JSON.stringify(this.serializeTree(result.rootNode));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BARON Reasoning Tree Explorer</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-dim: #8b949e;
      --accent: #58a6ff;
      --green: #3fb950;
      --red: #f85149;
      --yellow: #d29922;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }
    #sidebar { width: 380px; border-right: 1px solid var(--border); background: var(--card-bg); display: flex; flex-direction: column; }
    .header { padding: 16px; border-bottom: 1px solid var(--border); }
    .header h1 { font-size: 1.1rem; color: var(--accent); display: flex; align-items: center; gap: 8px; }
    .header p { font-size: 0.8rem; color: var(--text-dim); margin-top: 4px; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 16px; border-bottom: 1px solid var(--border); }
    .stat-card { background: var(--bg); padding: 10px; border-radius: 6px; border: 1px solid var(--border); }
    .stat-val { font-size: 1.1rem; font-weight: bold; color: var(--accent); }
    .stat-label { font-size: 0.75rem; color: var(--text-dim); }
    #node-details { padding: 16px; overflow-y: auto; flex: 1; }
    #node-details h3 { font-size: 0.95rem; margin-bottom: 10px; color: var(--text); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; margin-bottom: 8px; }
    .badge-verified { background: rgba(63, 185, 80, 0.2); color: var(--green); border: 1px solid var(--green); }
    .badge-pruned { background: rgba(248, 81, 73, 0.2); color: var(--red); border: 1px solid var(--red); }
    .badge-terminal { background: rgba(210, 153, 34, 0.2); color: var(--yellow); border: 1px solid var(--yellow); }
    pre { background: var(--bg); padding: 8px; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; border: 1px solid var(--border); margin-top: 8px; }
    #canvas-container { flex: 1; position: relative; overflow: auto; background: radial-gradient(#1c2128 1px, transparent 1px); background-size: 24px 24px; }
    svg { min-width: 100%; min-height: 100%; }
    .node-rect { cursor: pointer; transition: stroke 0.2s; }
    .node-rect:hover { stroke: #fff !important; stroke-width: 2px !important; }
  </style>
</head>
<body>
  <div id="sidebar">
    <div class="header">
      <h1>◈ BARON Reasoning Hypervisor</h1>
      <p>Test-Time Compute & Verifiable RLVR Graph</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">${result.totalRollouts}</div>
        <div class="stat-label">MCTS Rollouts</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: var(--green);">${result.tokensSavedByPruning.toLocaleString()}</div>
        <div class="stat-label">Tokens Saved</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${result.durationMs}ms</div>
        <div class="stat-label">Search Duration</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: var(--red);">${result.prunedBranchesCount}</div>
        <div class="stat-label">Pruned Dead-Ends</div>
      </div>
    </div>
    <div id="node-details">
      <p style="color: var(--text-dim); font-size: 0.85rem;">Click any node in the tree to inspect its hypothesis, verification metrics, and code artifacts.</p>
    </div>
  </div>
  <div id="canvas-container">
    <svg id="tree-svg"></svg>
  </div>

  <script>
    const rootData = ${treeDataJson};
    const nodeDetails = document.getElementById('node-details');
    const svg = document.getElementById('tree-svg');

    // Layout tree with simple layered positioning
    let nodeIdCounter = 0;
    const nodeMap = new Map();

    function assignPositions(node, depth = 0, yOffset = { val: 40 }) {
      node.x = 80 + depth * 260;
      node.y = yOffset.val;
      nodeMap.set(node.id, node);
      
      if (!node.children || node.children.length === 0) {
        yOffset.val += 90;
      } else {
        node.children.forEach(child => assignPositions(child, depth + 1, yOffset));
        const childYs = node.children.map(c => c.y);
        node.y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      }
    }

    const yCounter = { val: 60 };
    assignPositions(rootData, 0, yCounter);

    // Render tree SVG
    let svgContent = '';

    function renderLinks(node) {
      if (!node.children) return;
      node.children.forEach(child => {
        const strokeColor = child.status === 'PRUNED' ? '#f85149' : (child.status === 'VERIFIED' ? '#3fb950' : '#30363d');
        svgContent += \`<path d="M \${node.x + 180} \${node.y + 25} C \${node.x + 220} \${node.y + 25}, \${child.x - 40} \${child.y + 25}, \${child.x} \${child.y + 25}" 
          fill="none" stroke="\${strokeColor}" stroke-width="2" stroke-dasharray="\${child.status === 'PRUNED' ? '4,4' : 'none'}" />\`;
        renderLinks(child);
      });
    }

    function renderNodes(node) {
      let fill = '#161b22';
      let stroke = '#30363d';
      if (node.status === 'VERIFIED') stroke = '#3fb950';
      if (node.status === 'PRUNED') stroke = '#f85149';
      if (node.status === 'TERMINAL') stroke = '#d29922';

      const shortText = (node.description || '').substring(0, 22) + '...';
      const qText = 'N=' + node.visitCount + ' | Q=' + (node.meanValue ? node.meanValue.toFixed(2) : '0.00');

      svgContent += \`
        <g class="node-group" onclick="selectNode('\${node.id}')">
          <rect class="node-rect" x="\${node.x}" y="\${node.y}" width="180" height="50" rx="8" fill="\${fill}" stroke="\${stroke}" stroke-width="1.5" />
          <text x="\${node.x + 10}" y="\${node.y + 20}" fill="#c9d1d9" font-size="11" font-weight="bold">\${shortText}</text>
          <text x="\${node.x + 10}" y="\${node.y + 38}" fill="#8b949e" font-size="10">\${qText}</text>
        </g>
      \`;

      if (node.children) node.children.forEach(renderNodes);
    }

    renderLinks(rootData);
    renderNodes(rootData);
    svg.innerHTML = svgContent;
    svg.setAttribute('width', '2400');
    svg.setAttribute('height', Math.max(800, yCounter.val + 100));

    window.selectNode = function(id) {
      const node = nodeMap.get(id);
      if (!node) return;

      let badgeClass = 'badge-verified';
      if (node.status === 'PRUNED') badgeClass = 'badge-pruned';
      if (node.status === 'TERMINAL') badgeClass = 'badge-terminal';

      let html = \`
        <span class="badge \${badgeClass}">\${node.status}</span>
        <h3>[\${node.type}] \${node.id}</h3>
        <p style="font-size: 0.85rem; margin-bottom: 12px;">\${node.description}</p>
        <div style="font-size: 0.8rem; margin-bottom: 6px;"><b>Visit Count (N):</b> \${node.visitCount}</div>
        <div style="font-size: 0.8rem; margin-bottom: 6px;"><b>Q-Value (Mean):</b> \${node.meanValue ? node.meanValue.toFixed(3) : 0}</div>
        <div style="font-size: 0.8rem; margin-bottom: 6px;"><b>Prior (P):</b> \${node.priorConfidence}</div>
      \`;

      if (node.verification) {
        html += \`
          <h4 style="margin-top: 12px; font-size: 0.85rem;">Verification Results</h4>
          <div style="font-size: 0.8rem;">Deterministic: \${node.verification.deterministicPassed ? '✅ PASS' : '❌ FAIL'}</div>
          <div style="font-size: 0.8rem;">PRM Score: \${node.verification.prmScore}</div>
          <div style="font-size: 0.8rem;">Aggregated Reward: \${node.verification.aggregatedReward}</div>
          \${node.verification.failureReason ? \`<div style="color: var(--red); font-size: 0.8rem; margin-top: 4px;"><b>Failure Reason:</b> \${node.verification.failureReason}</div>\` : ''}
        \`;
      }

      if (node.payload) {
        html += \`
          <h4 style="margin-top: 12px; font-size: 0.85rem;">Executable Payload</h4>
          <pre><code>\${node.payload}</code></pre>
        \`;
      }

      nodeDetails.innerHTML = html;
    };
  </script>
</body>
</html>`;
  }

  private serializeTree(node: ThoughtNode): any {
    return {
      id: node.id,
      type: node.type,
      description: node.description,
      payload: node.payload,
      visitCount: node.visitCount,
      meanValue: node.meanValue,
      priorConfidence: node.priorConfidence,
      status: node.status,
      verification: node.verification,
      children: node.children.map((c) => this.serializeTree(c))
    };
  }
}
