import type { TraceBundle } from '../types/index.ts';
import { CausalGraph } from '../core/causal-graph.ts';

export class DashboardGenerator {
  /**
   * Generates a fully self-contained, responsive HTML5 + SVG + Canvas interactive studio.
   * Requires zero external dependencies or internet connection to render.
   */
  public static generateHtml(bundle: TraceBundle): string {
    const serializedData = JSON.stringify(bundle);
    const graph = new CausalGraph(bundle.nodes, bundle.edges);
    const mermaidDiagram = graph.toMermaid();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentRewind Studio - ${bundle.metadata.sessionName}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.3);
      --err: #ef4444;
      --warn: #f59e0b;
      --success: #10b981;
      --purple: #8b5cf6;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: var(--bg); color: var(--text); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    /* Header */
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.2rem; }
    .logo-badge { background: linear-gradient(135deg, #38bdf8, #818cf8); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; letter-spacing: 0.05em; color: #fff; }
    .session-meta { display: flex; gap: 18px; align-items: center; font-size: 0.85rem; color: var(--text-muted); }
    .status-badge { padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; }
    .status-SUCCESS { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
    .status-FAILED { background: rgba(239, 68, 68, 0.2); color: var(--err); border: 1px solid var(--err); }
    .status-VETOED { background: rgba(245, 158, 11, 0.2); color: var(--warn); border: 1px solid var(--warn); }

    /* Main Layout */
    .studio-container { display: flex; flex: 1; overflow: hidden; }

    /* Left Panel: Graph & Scrubber */
    .viewport { flex: 2; display: flex; flex-direction: column; border-right: 1px solid var(--border); position: relative; }
    
    /* Graph Toolbar */
    .graph-toolbar {
      position: absolute;
      top: 14px;
      left: 14px;
      display: flex;
      gap: 8px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(8px);
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      z-index: 5;
    }
    .tool-btn {
      background: #1f2937;
      border: 1px solid #374151;
      color: var(--text);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .tool-btn:hover { background: #374151; color: var(--accent); }
    .search-input {
      background: #0f172a;
      border: 1px solid #374151;
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      width: 160px;
    }
    .filter-select {
      background: #0f172a;
      border: 1px solid #374151;
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
    }

    #graphCanvas { flex: 1; width: 100%; height: 100%; background: radial-gradient(circle at 50% 50%, #171e2e 0%, var(--bg) 100%); cursor: grab; }
    #graphCanvas:active { cursor: grabbing; }

    /* Scrubber Controls */
    .timeline-bar {
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 5;
    }
    .scrubber-slider { flex: 1; accent-color: var(--accent); cursor: pointer; }
    .scrub-btn {
      background: #1f2937; border: 1px solid #374151; color: var(--text); padding: 6px 12px;
      border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
    }
    .scrub-btn:hover { background: #374151; color: var(--accent); }

    /* Right Panel: Inspector & Blame Analysis */
    .sidebar { flex: 1; background: var(--card-bg); display: flex; flex-direction: column; overflow-y: auto; max-width: 480px; min-width: 380px; }
    .tab-header { display: flex; border-bottom: 1px solid var(--border); }
    .tab-btn { flex: 1; padding: 12px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-weight: 600; font-size: 0.85rem; }
    .tab-btn.active { color: var(--accent); border-bottom: 2px solid var(--accent); background: rgba(56, 189, 248, 0.05); }

    .tab-content { padding: 20px; flex: 1; overflow-y: auto; display: none; }
    .tab-content.active { display: block; }

    /* Cards */
    .blame-card {
      background: #1e293b; border-left: 4px solid var(--err); padding: 14px; border-radius: 6px; margin-bottom: 12px;
      transition: transform 0.15s ease;
    }
    .blame-card:hover { transform: translateY(-2px); }
    .blame-card.moderate { border-left-color: var(--warn); }
    .blame-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .blame-score { font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: var(--err); font-weight: bold; }
    .blame-desc { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px; }
    .blame-rec { font-size: 0.8rem; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 6px 10px; border-radius: 4px; }

    /* Node Detail */
    .node-detail-field { margin-bottom: 12px; }
    .field-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .field-value { font-size: 0.85rem; word-break: break-all; }
    pre { background: #0b0f19; padding: 12px; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; color: #e2e8f0; border: 1px solid var(--border); max-height: 320px; }

    /* Action Tray */
    .action-tray {
      padding: 12px 20px;
      border-top: 1px solid var(--border);
      background: #0f172a;
      display: flex;
      gap: 10px;
    }
    .action-btn {
      flex: 1;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      border: 1px solid var(--border);
      background: #1e293b;
      color: #fff;
    }
    .action-btn.primary { background: #0284c7; border-color: #38bdf8; }
    .action-btn:hover { filter: brightness(1.15); }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>AgentRewind</span>
      <span class="logo-badge">TIME-TRAVEL DEBUGGER</span>
    </div>
    <div class="session-meta">
      <span>Session: <strong>${bundle.metadata.sessionName}</strong></span>
      <span>Total Steps: <strong>${bundle.nodes.length}</strong></span>
      <span>Duration: <strong>${bundle.metadata.durationMs}ms</strong></span>
      <span class="status-badge status-${bundle.metadata.status}">${bundle.metadata.status}</span>
    </div>
  </header>

  <div class="studio-container">
    <div class="viewport">
      <div class="graph-toolbar">
        <button class="tool-btn" id="zoomInBtn" title="Zoom In">+</button>
        <button class="tool-btn" id="zoomOutBtn" title="Zoom Out">-</button>
        <button class="tool-btn" id="resetViewBtn" title="Reset View">⟲ Reset</button>
        <select class="filter-select" id="nodeFilter">
          <option value="ALL">All Types</option>
          <option value="FAILURES">Errors &amp; Vetoes</option>
          <option value="TOOLS">Tool Calls &amp; Obs</option>
          <option value="REASONING">Reasoning Steps</option>
        </select>
        <input type="text" class="search-input" id="searchFilter" placeholder="Filter steps..." />
      </div>

      <canvas id="graphCanvas"></canvas>

      <div class="timeline-bar">
        <button class="scrub-btn" id="playBtn">▶ Play</button>
        <button class="scrub-btn" id="prevBtn">◀ Step Back</button>
        <input type="range" id="scrubber" class="scrubber-slider" min="0" max="${Math.max(0, bundle.nodes.length - 1)}" value="${Math.max(0, bundle.nodes.length - 1)}">
        <button class="scrub-btn" id="nextBtn">Step Forward ▶</button>
        <span id="stepCounter" style="font-size: 0.85rem; font-weight: 700; min-width: 90px; text-align: right;">Step ${bundle.nodes.length - 1} / ${bundle.nodes.length - 1}</span>
      </div>
    </div>

    <aside class="sidebar">
      <div class="tab-header">
        <button class="tab-btn active" data-tab="inspectorTab">Node Inspector</button>
        <button class="tab-btn" data-tab="blameTab">Causal Blame (${bundle.blameReport ? bundle.blameReport.length : 0})</button>
        <button class="tab-btn" data-tab="invariantsTab">Invariants (${bundle.invariants.length})</button>
      </div>

      <div id="inspectorTab" class="tab-content active">
        <h3 id="inspectTitle" style="margin-bottom: 14px; font-size: 1.1rem; color: var(--accent);">Select a node</h3>
        <div class="node-detail-field">
          <div class="field-label">Node Type</div>
          <div class="field-value" id="inspectType">-</div>
        </div>
        <div class="node-detail-field">
          <div class="field-label">Status</div>
          <div class="field-value" id="inspectStatus">-</div>
        </div>
        <div class="node-detail-field">
          <div class="field-label">Content-Addressed Hash (SHA-256)</div>
          <div class="field-value" id="inspectHash" style="font-family: monospace; font-size: 0.75rem; color: #38bdf8;">-</div>
        </div>
        <div class="node-detail-field">
          <div class="field-label">Payload Content</div>
          <pre id="inspectPayload">Click on any node in the causal graph to inspect its state.</pre>
        </div>
      </div>

      <div id="blameTab" class="tab-content">
        <h3 style="margin-bottom: 12px; font-size: 1rem;">Causal Attribution Root Causes</h3>
        <div id="blameList"></div>
      </div>

      <div id="invariantsTab" class="tab-content">
        <h3 style="margin-bottom: 12px; font-size: 1rem;">Safety Invariant Results</h3>
        <div id="invariantList"></div>
      </div>

      <div class="action-tray">
        <button class="action-btn" id="copyMermaidBtn">Copy Mermaid 📋</button>
        <button class="action-btn primary" id="exportJsonBtn">Download .atrace 💾</button>
      </div>
    </aside>
  </div>

  <script>
    const traceData = ${serializedData};
    const mermaidCode = ${JSON.stringify(mermaidDiagram)};
    const nodes = traceData.nodes || [];
    const edges = traceData.edges || [];
    const blameReport = traceData.blameReport || [];
    const invariants = traceData.invariants || [];

    let currentStep = nodes.length - 1;
    let selectedNodeId = nodes[currentStep]?.id || null;
    let isPlaying = false;
    let playInterval = null;
    let filterType = 'ALL';
    let searchQuery = '';

    // Pan & Zoom state
    let panX = 0;
    let panY = 0;
    let zoomScale = 1.0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // Render Blame Tab
    const blameListEl = document.getElementById('blameList');
    if (blameReport.length === 0) {
      blameListEl.innerHTML = '<p style="color: #9ca3af; font-size: 0.85rem;">No causal failure detected. Trajectory ran cleanly!</p>';
    } else {
      blameListEl.innerHTML = blameReport.map((b, idx) => {
        const isHigh = b.blameScore > 0.5;
        return \`
          <div class="blame-card \${isHigh ? '' : 'moderate'}" onclick="selectNodeById('\${b.nodeId}')" style="cursor: pointer;">
            <div class="blame-title">
              <span>#\${idx + 1} Step \${b.stepIndex}: \${b.title}</span>
              <span class="blame-score">\${(b.blameScore * 100).toFixed(0)}% Blame</span>
            </div>
            <div class="blame-desc">\${b.explanation}</div>
            <div class="blame-rec">💡 <strong>Remedy:</strong> \${b.counterfactualRecommendation}</div>
          </div>
        \`;
      }).join('');
    }

    // Render Invariants Tab
    const invListEl = document.getElementById('invariantList');
    invListEl.innerHTML = invariants.map(inv => \`
      <div style="background: #1e293b; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid \${inv.passed ? '#10b981' : '#ef4444'};">
        <div style="font-weight: 600; font-size: 0.85rem; display: flex; justify-content: space-between;">
          <span>\${inv.ruleName}</span>
          <span style="color: \${inv.passed ? '#10b981' : '#ef4444'}; font-weight: 700;">\${inv.passed ? 'PASSED' : 'BLOCKED'}</span>
        </div>
        <div style="font-size: 0.8rem; color: #9ca3af; margin-top: 4px;">\${inv.message}</div>
      </div>
    \`).join('');

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // Inspector Update
    function updateInspector(node) {
      if (!node) return;
      document.getElementById('inspectTitle').textContent = \`Step \${node.stepIndex}: \${node.title}\`;
      document.getElementById('inspectType').textContent = node.type;
      document.getElementById('inspectStatus').textContent = node.status;
      document.getElementById('inspectStatus').className = 'field-value status-badge status-' + node.status;
      document.getElementById('inspectHash').textContent = node.contentHash;
      document.getElementById('inspectPayload').textContent = JSON.stringify(node.content, null, 2);
    }

    function selectNodeById(id) {
      const node = nodes.find(n => n.id === id);
      if (node) {
        selectedNodeId = node.id;
        currentStep = node.stepIndex;
        document.getElementById('scrubber').value = currentStep;
        document.getElementById('stepCounter').textContent = \`Step \${currentStep} / \${nodes.length - 1}\`;
        updateInspector(node);
        drawGraph();
      }
    }

    // Canvas Rendering
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
      drawGraph();
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 50);

    function isNodeVisible(n) {
      if (filterType === 'FAILURES' && n.status !== 'ERROR' && n.status !== 'VETOED') return false;
      if (filterType === 'TOOLS' && n.type !== 'TOOL_CALL' && n.type !== 'TOOL_OBSERVATION') return false;
      if (filterType === 'REASONING' && n.type !== 'MODEL_REASONING') return false;
      if (searchQuery) {
        const text = (n.title + ' ' + JSON.stringify(n.content)).toLowerCase();
        if (!text.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    }

    function drawGraph() {
      if (!canvas.width || !canvas.height) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoomScale, zoomScale);

      const visibleTimelineNodes = nodes.filter(n => n.stepIndex <= currentStep);
      if (visibleTimelineNodes.length === 0) {
        ctx.restore();
        return;
      }

      const spacingX = 140;
      const startX = 80;
      const centerY = (canvas.height / 2) / zoomScale;

      const positions = {};
      visibleTimelineNodes.forEach((n, idx) => {
        const yOffset = (idx % 2 === 0 ? -45 : 45);
        positions[n.id] = { x: startX + idx * spacingX, y: centerY + yOffset };
      });

      // Draw Edges
      edges.forEach(e => {
        const p1 = positions[e.source];
        const p2 = positions[e.target];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      });

      // Draw Nodes
      visibleTimelineNodes.forEach(n => {
        const p = positions[n.id];
        const isSelected = n.id === selectedNodeId;
        const isError = n.status === 'ERROR' || n.status === 'VETOED';
        const matchesFilter = isNodeVisible(n);

        // Alpha fade if filtered out by search/status
        ctx.globalAlpha = matchesFilter ? 1.0 : 0.25;

        // Glowing outline for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        if (isError) ctx.fillStyle = '#ef4444';
        else if (n.type === 'TOOL_CALL') ctx.fillStyle = '#38bdf8';
        else if (n.type === 'MODEL_REASONING') ctx.fillStyle = '#818cf8';
        else if (n.type === 'TOOL_OBSERVATION') ctx.fillStyle = '#10b981';
        else ctx.fillStyle = '#64748b';
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#f3f4f6';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(\`\${n.stepIndex}. \${n.title.slice(0, 16)}\`, p.x, p.y + 34);

        ctx.globalAlpha = 1.0;
      });

      ctx.restore();
    }

    // Scrubber Handlers
    const scrubber = document.getElementById('scrubber');
    scrubber.addEventListener('input', (e) => {
      currentStep = parseInt(e.target.value, 10);
      document.getElementById('stepCounter').textContent = \`Step \${currentStep} / \${nodes.length - 1}\`;
      const activeNode = nodes[currentStep];
      if (activeNode) {
        selectedNodeId = activeNode.id;
        updateInspector(activeNode);
      }
      drawGraph();
    });

    document.getElementById('prevBtn').addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        scrubber.value = currentStep;
        scrubber.dispatchEvent(new Event('input'));
      }
    });

    document.getElementById('nextBtn').addEventListener('click', () => {
      if (currentStep < nodes.length - 1) {
        currentStep++;
        scrubber.value = currentStep;
        scrubber.dispatchEvent(new Event('input'));
      }
    });

    // Playback Animation Loop
    const playBtn = document.getElementById('playBtn');
    playBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      playBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';

      if (isPlaying) {
        if (currentStep >= nodes.length - 1) currentStep = 0;
        playInterval = setInterval(() => {
          if (currentStep < nodes.length - 1) {
            currentStep++;
            scrubber.value = currentStep;
            scrubber.dispatchEvent(new Event('input'));
          } else {
            clearInterval(playInterval);
            isPlaying = false;
            playBtn.textContent = '▶ Play';
          }
        }, 600);
      } else {
        clearInterval(playInterval);
      }
    });

    // Zoom & Reset
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      zoomScale = Math.min(zoomScale * 1.25, 3.0);
      drawGraph();
    });
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      zoomScale = Math.max(zoomScale * 0.8, 0.4);
      drawGraph();
    });
    document.getElementById('resetViewBtn').addEventListener('click', () => {
      panX = 0;
      panY = 0;
      zoomScale = 1.0;
      drawGraph();
    });

    // Filters & Search
    document.getElementById('nodeFilter').addEventListener('change', (e) => {
      filterType = e.target.value;
      drawGraph();
    });
    document.getElementById('searchFilter').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      drawGraph();
    });

    // Canvas Pan & Drag
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        panX = e.clientX - dragStartX;
        panY = e.clientY - dragStartY;
        drawGraph();
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomScale = Math.max(0.4, Math.min(3.0, zoomScale * zoomFactor));
      drawGraph();
    });

    // Click Detection
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      const clickX = (rawX - panX) / zoomScale;
      const clickY = (rawY - panY) / zoomScale;

      const visibleTimelineNodes = nodes.filter(n => n.stepIndex <= currentStep);
      const spacingX = 140;
      const startX = 80;
      const centerY = (canvas.height / 2) / zoomScale;

      visibleTimelineNodes.forEach((n, idx) => {
        const yOffset = (idx % 2 === 0 ? -45 : 45);
        const px = startX + idx * spacingX;
        const py = centerY + yOffset;
        const dist = Math.sqrt((clickX - px) ** 2 + (clickY - py) ** 2);
        if (dist <= 22) {
          selectNodeById(n.id);
        }
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'j') document.getElementById('prevBtn').click();
      if (e.key === 'ArrowRight' || e.key === 'k') document.getElementById('nextBtn').click();
      if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
    });

    // Action Tray Handlers
    document.getElementById('copyMermaidBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(mermaidCode);
      alert('Mermaid diagram copied to clipboard!');
    });

    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(traceData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`\${traceData.metadata.sessionName || 'trace'}.atrace\`;
      a.click();
      URL.revokeObjectURL(url);
    });

    if (nodes[currentStep]) {
      updateInspector(nodes[currentStep]);
    }
  </script>
</body>
</html>`;
  }
}
