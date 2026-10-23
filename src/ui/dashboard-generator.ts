import type { TraceBundle } from '../types/index.ts';

export class DashboardGenerator {
  /**
   * Generates a fully self-contained, responsive HTML5 + SVG + CSS interactive studio.
   * Requires zero external dependencies or internet connection to render.
   */
  public static generateHtml(bundle: TraceBundle): string {
    const serializedData = JSON.stringify(bundle);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherTrace Studio - ${bundle.metadata.sessionName}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.3);
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
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.2rem; }
    .logo-badge { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; letter-spacing: 0.05em; }
    .session-meta { display: flex; gap: 18px; font-size: 0.85rem; color: var(--text-muted); }
    .status-badge { padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
    .status-SUCCESS { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
    .status-FAILED { background: rgba(239, 68, 68, 0.2); color: var(--err); border: 1px solid var(--err); }
    .status-VETOED { background: rgba(245, 158, 11, 0.2); color: var(--warn); border: 1px solid var(--warn); }

    /* Main Layout */
    .studio-container { display: flex; flex: 1; overflow: hidden; }

    /* Left Panel: Graph & Scrubber */
    .viewport { flex: 2; display: flex; flex-direction: column; border-right: 1px solid var(--border); position: relative; }
    #graphCanvas { flex: 1; width: 100%; height: 100%; background: radial-gradient(circle at 50% 50%, #171e2e 0%, var(--bg) 100%); cursor: grab; }

    /* Scrubber Controls */
    .timeline-bar {
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .scrubber-slider { flex: 1; accent-color: var(--accent); cursor: pointer; }
    .scrub-btn {
      background: #1f2937; border: 1px solid #374151; color: var(--text); padding: 6px 14px;
      border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
    }
    .scrub-btn:hover { background: #374151; }

    /* Right Panel: Inspector & Blame Analysis */
    .sidebar { flex: 1; background: var(--card-bg); display: flex; flex-direction: column; overflow-y: auto; max-width: 480px; min-width: 380px; }
    .tab-header { display: flex; border-bottom: 1px solid var(--border); }
    .tab-btn { flex: 1; padding: 12px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-weight: 600; font-size: 0.85rem; }
    .tab-btn.active { color: var(--accent); border-bottom: 2px solid var(--accent); background: rgba(59, 130, 246, 0.05); }

    .tab-content { padding: 20px; flex: 1; overflow-y: auto; display: none; }
    .tab-content.active { display: block; }

    /* Cards */
    .blame-card {
      background: #1e293b; border-left: 4px solid var(--err); padding: 14px; border-radius: 6px; margin-bottom: 12px;
    }
    .blame-card.moderate { border-left-color: var(--warn); }
    .blame-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .blame-score { font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: var(--err); }
    .blame-desc { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px; }
    .blame-rec { font-size: 0.8rem; color: #60a5fa; background: rgba(59, 130, 246, 0.1); padding: 6px 10px; border-radius: 4px; }

    /* Node Detail */
    .node-detail-field { margin-bottom: 12px; }
    .field-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .field-value { font-size: 0.85rem; word-break: break-all; }
    pre { background: #0b0f19; padding: 12px; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; color: #e2e8f0; border: 1px solid var(--border); }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>AetherTrace</span>
      <span class="logo-badge">AGENT HYPERVISOR</span>
    </div>
    <div class="session-meta">
      <span>Session: <strong>${bundle.metadata.sessionName}</strong></span>
      <span>Steps: <strong>${bundle.nodes.length}</strong></span>
      <span>Duration: <strong>${bundle.metadata.durationMs}ms</strong></span>
      <span class="status-badge status-${bundle.metadata.status}">${bundle.metadata.status}</span>
    </div>
  </header>

  <div class="studio-container">
    <div class="viewport">
      <canvas id="graphCanvas"></canvas>
      <div class="timeline-bar">
        <button class="scrub-btn" id="prevBtn">◀ Step Back</button>
        <input type="range" id="scrubber" class="scrubber-slider" min="0" max="${Math.max(0, bundle.nodes.length - 1)}" value="${Math.max(0, bundle.nodes.length - 1)}">
        <button class="scrub-btn" id="nextBtn">Step Forward ▶</button>
        <span id="stepCounter" style="font-size: 0.85rem; font-weight: 600;">Step ${bundle.nodes.length - 1} / ${bundle.nodes.length - 1}</span>
      </div>
    </div>

    <aside class="sidebar">
      <div class="tab-header">
        <button class="tab-btn active" data-tab="inspectorTab">Node Inspector</button>
        <button class="tab-btn" data-tab="blameTab">Causal Blame (${bundle.blameReport ? bundle.blameReport.length : 0})</button>
        <button class="tab-btn" data-tab="invariantsTab">Invariants (${bundle.invariants.length})</button>
      </div>

      <div id="inspectorTab" class="tab-content active">
        <h3 id="inspectTitle" style="margin-bottom: 14px; font-size: 1.1rem;">Select a node</h3>
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
          <div class="field-value" id="inspectHash" style="font-family: monospace; font-size: 0.75rem; color: #60a5fa;">-</div>
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
    </aside>
  </div>

  <script>
    const traceData = ${serializedData};
    const nodes = traceData.nodes || [];
    const edges = traceData.edges || [];
    const blameReport = traceData.blameReport || [];
    const invariants = traceData.invariants || [];

    let currentStep = nodes.length - 1;
    let selectedNodeId = nodes[currentStep]?.id || null;

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

    // Inspector
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

    function drawGraph() {
      if (!canvas.width || !canvas.height) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const visibleNodes = nodes.filter(n => n.stepIndex <= currentStep);
      if (visibleNodes.length === 0) return;

      const spacingX = Math.max(90, Math.min(180, (canvas.width - 120) / (visibleNodes.length || 1)));
      const startX = 60;
      const centerY = canvas.height / 2;

      const positions = {};
      visibleNodes.forEach((n, idx) => {
        const yOffset = (idx % 2 === 0 ? -40 : 40);
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
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Draw Nodes
      visibleNodes.forEach(n => {
        const p = positions[n.id];
        const isSelected = n.id === selectedNodeId;
        const isError = n.status === 'ERROR' || n.status === 'VETOED';

        // Glowing outline for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        if (isError) ctx.fillStyle = '#ef4444';
        else if (n.type === 'TOOL_CALL') ctx.fillStyle = '#3b82f6';
        else if (n.type === 'MODEL_REASONING') ctx.fillStyle = '#8b5cf6';
        else if (n.type === 'TOOL_OBSERVATION') ctx.fillStyle = '#10b981';
        else ctx.fillStyle = '#6b7280';
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#f3f4f6';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(\`\${n.stepIndex}. \${n.title.slice(0, 14)}\`, p.x, p.y + 30);
      });
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

    // Canvas click detection
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const visibleNodes = nodes.filter(n => n.stepIndex <= currentStep);
      const spacingX = Math.max(90, Math.min(180, (canvas.width - 120) / (visibleNodes.length || 1)));
      const startX = 60;
      const centerY = canvas.height / 2;

      visibleNodes.forEach((n, idx) => {
        const yOffset = (idx % 2 === 0 ? -40 : 40);
        const px = startX + idx * spacingX;
        const py = centerY + yOffset;
        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (dist <= 20) {
          selectNodeById(n.id);
        }
      });
    });

    if (nodes[currentStep]) {
      updateInspector(nodes[currentStep]);
    }
  </script>
</body>
</html>`;
  }
}
