import type {
  TrajectoryNode,
  InvariantRule,
  InvariantResult
} from '../types/index.ts';

export class AgentFirewall {
  private rules: Map<string, InvariantRule> = new Map();
  private workspaceRoot: string;
  private maxRepeatedToolCalls: number;

  constructor(workspaceRoot: string = process.cwd(), maxRepeatedToolCalls: number = 3) {
    this.workspaceRoot = workspaceRoot.replace(/\\/g, '/');
    this.maxRepeatedToolCalls = maxRepeatedToolCalls;
    this.registerDefaultRules();
  }

  public registerRule(rule: InvariantRule): void {
    this.rules.set(rule.id, rule);
  }

  public getRules(): InvariantRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Registers out-of-the-box security and safety invariant rules.
   */
  private registerDefaultRules(): void {
    // Rule 1: Workspace Path Confinement
    this.registerRule({
      id: 'workspace-confinement',
      name: 'Workspace Path Confinement',
      description: 'Prevents file mutations or sensitive reads outside designated workspace',
      severity: 'BLOCKING',
      evaluate: (node: TrajectoryNode) => {
        const payloadStr = typeof node.content === 'string'
          ? node.content
          : JSON.stringify(node.content || '');

        const sensitivePaths = [
          '~/.ssh', '/etc/passwd', 'c:/windows/system32',
          '.git/config', '.env', 'id_rsa', 'aws/credentials',
          '../..', '..\\..'
        ];

        for (const p of sensitivePaths) {
          if (payloadStr.toLowerCase().includes(p.toLowerCase())) {
            return {
              ruleId: 'workspace-confinement',
              ruleName: 'Workspace Path Confinement',
              passed: false,
              severity: 'BLOCKING',
              message: `Attempted access to restricted path pattern: '${p}'`,
              targetNodeId: node.id,
              timestamp: new Date().toISOString()
            };
          }
        }

        return {
          ruleId: 'workspace-confinement',
          ruleName: 'Workspace Path Confinement',
          passed: true,
          severity: 'BLOCKING',
          message: 'Path check passed within boundary',
          targetNodeId: node.id,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Rule 2: Indirect Prompt Injection Defense
    this.registerRule({
      id: 'prompt-injection-guard',
      name: 'Indirect Prompt Injection Guard',
      description: 'Detects prompt injection and delimiter hijacking in tool observations',
      severity: 'BLOCKING',
      evaluate: (node: TrajectoryNode) => {
        if (node.type !== 'TOOL_OBSERVATION') {
          return {
            ruleId: 'prompt-injection-guard',
            ruleName: 'Indirect Prompt Injection Guard',
            passed: true,
            severity: 'BLOCKING',
            message: 'Not a tool observation',
            targetNodeId: node.id,
            timestamp: new Date().toISOString()
          };
        }

        const observation = typeof node.content === 'string'
          ? node.content
          : JSON.stringify(node.content || '');

        const injectionSignatures = [
          /ignore (all )?previous instructions/i,
          /disregard (the )?(above|system|previous) instructions/i,
          /you are now a(n)?\s+(unrestricted|different|evil)/i,
          /\[system instruction\]/i,
          /<\|im_start\|>/i,
          /stop being an ai and instead/i,
          /new objective:\s*ignore/i
        ];

        for (const regex of injectionSignatures) {
          if (regex.test(observation)) {
            return {
              ruleId: 'prompt-injection-guard',
              ruleName: 'Indirect Prompt Injection Guard',
              passed: false,
              severity: 'BLOCKING',
              message: `Detected indirect prompt injection signature matching: ${regex.source}`,
              targetNodeId: node.id,
              details: { matchedPattern: regex.source },
              timestamp: new Date().toISOString()
            };
          }
        }

        return {
          ruleId: 'prompt-injection-guard',
          ruleName: 'Indirect Prompt Injection Guard',
          passed: true,
          severity: 'BLOCKING',
          message: 'No prompt injection signatures detected',
          targetNodeId: node.id,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Rule 3: Loop Deadlock & Token-Burn Governor
    this.registerRule({
      id: 'loop-deadlock-governor',
      name: 'Loop Deadlock & Token-Burn Governor',
      description: 'Halts execution when identical tool calls loop repeatedly',
      severity: 'BLOCKING',
      evaluate: (node: TrajectoryNode, history: TrajectoryNode[]) => {
        if (node.type !== 'TOOL_CALL') {
          return {
            ruleId: 'loop-deadlock-governor',
            ruleName: 'Loop Deadlock & Token-Burn Governor',
            passed: true,
            severity: 'BLOCKING',
            message: 'Not a tool call',
            targetNodeId: node.id,
            timestamp: new Date().toISOString()
          };
        }

        // Count trailing repeated identical tool calls
        let consecutiveCount = 1;
        const currentHash = node.contentHash;

        for (let i = history.length - 1; i >= 0; i--) {
          const prior = history[i];
          if (prior.type === 'TOOL_CALL') {
            if (prior.contentHash === currentHash) {
              consecutiveCount++;
            } else {
              break;
            }
          }
        }

        if (consecutiveCount >= this.maxRepeatedToolCalls) {
          return {
            ruleId: 'loop-deadlock-governor',
            ruleName: 'Loop Deadlock & Token-Burn Governor',
            passed: false,
            severity: 'BLOCKING',
            message: `Agent entered infinite loop calling '${node.title}' ${consecutiveCount} times consecutively with identical arguments`,
            targetNodeId: node.id,
            details: { consecutiveCount, maxAllowed: this.maxRepeatedToolCalls },
            timestamp: new Date().toISOString()
          };
        }

        return {
          ruleId: 'loop-deadlock-governor',
          ruleName: 'Loop Deadlock & Token-Burn Governor',
          passed: true,
          severity: 'BLOCKING',
          message: `Tool call repetitions (${consecutiveCount}) within allowed threshold`,
          targetNodeId: node.id,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Rule 4: Destructive Command Guard
    this.registerRule({
      id: 'destructive-command-guard',
      name: 'Destructive Command Guard',
      description: 'Vetoes terminal commands that perform unrecoverable destruction',
      severity: 'BLOCKING',
      evaluate: (node: TrajectoryNode) => {
        const payloadStr = typeof node.content === 'string'
          ? node.content
          : JSON.stringify(node.content || '');

        const dangerousPatterns = [
          /\brm\s+-[rf]{1,2}\s+[\/\*]/i,
          /\bdrop\s+database\b/i,
          /\bformat\s+[a-z]:/i,
          /\bmkfs\b/i,
          /\bgit\s+clean\s+-fdx\b/i,
          /\bgit\s+reset\s+--hard\s+head~[0-9]+/i
        ];

        for (const regex of dangerousPatterns) {
          if (regex.test(payloadStr)) {
            return {
              ruleId: 'destructive-command-guard',
              ruleName: 'Destructive Command Guard',
              passed: false,
              severity: 'BLOCKING',
              message: `Destructive command intercepted matching: ${regex.source}`,
              targetNodeId: node.id,
              timestamp: new Date().toISOString()
            };
          }
        }

        return {
          ruleId: 'destructive-command-guard',
          ruleName: 'Destructive Command Guard',
          passed: true,
          severity: 'BLOCKING',
          message: 'Command passed safety analysis',
          targetNodeId: node.id,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Rule 5: Secret & Credential Leak Guard
    this.registerRule({
      id: 'secret-leak-guard',
      name: 'Secret & Credential Leak Guard',
      description: 'Prevents leakage of API keys, bearer tokens, and private credentials in tool payloads',
      severity: 'BLOCKING',
      evaluate: (node: TrajectoryNode) => {
        const payloadStr = typeof node.content === 'string'
          ? node.content
          : JSON.stringify(node.content || '');

        const secretPatterns = [
          /\bsk-[a-zA-Z0-9]{20,}\b/,                 // OpenAI key pattern
          /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/,          // Anthropic key pattern
          /\bghp_[a-zA-Z0-9]{36}\b/,                 // GitHub Personal Access Token
          /\bgho_[a-zA-Z0-9]{36}\b/,                 // GitHub OAuth Token
          /\bAKIA[0-9A-Z]{16}\b/,                    // AWS Access Key ID
          /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/  // Private Key Headers
        ];

        for (const pattern of secretPatterns) {
          if (pattern.test(payloadStr)) {
            return {
              ruleId: 'secret-leak-guard',
              ruleName: 'Secret & Credential Leak Guard',
              passed: false,
              severity: 'BLOCKING',
              message: 'Potential plaintext credential/API key leakage detected in payload',
              targetNodeId: node.id,
              timestamp: new Date().toISOString()
            };
          }
        }

        return {
          ruleId: 'secret-leak-guard',
          ruleName: 'Secret & Credential Leak Guard',
          passed: true,
          severity: 'BLOCKING',
          message: 'No credential leakage detected',
          targetNodeId: node.id,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Rule 6: SQL Injection & Mutation Guard
    this.registerRule({
      id: 'sql-injection-guard',
      name: 'SQL Injection Guard',
      description: 'Detects unsanitized SQL concatenation or unauthorized schema drop attempts',
      severity: 'BLOCKING',
      evaluate: (node: TrajectoryNode) => {
        if (node.type !== 'TOOL_CALL' && node.type !== 'ENVIRONMENT_MUTATION') {
          return {
            ruleId: 'sql-injection-guard',
            ruleName: 'SQL Injection Guard',
            passed: true,
            severity: 'BLOCKING',
            message: 'Not a data mutation or tool call',
            targetNodeId: node.id,
            timestamp: new Date().toISOString()
          };
        }

        const payloadStr = typeof node.content === 'string'
          ? node.content
          : JSON.stringify(node.content || '');

        const sqlPatterns = [
          /'\s+OR\s+'?1'?\s*=\s*'?1/i,
          /UNION\s+ALL\s+SELECT/i,
          /;\s*DROP\s+TABLE/i,
          /;\s*TRUNCATE\s+TABLE/i
        ];

        for (const pattern of sqlPatterns) {
          if (pattern.test(payloadStr)) {
            return {
              ruleId: 'sql-injection-guard',
              ruleName: 'SQL Injection Guard',
              passed: false,
              severity: 'BLOCKING',
              message: `Potential SQL injection/destruction signature detected: ${pattern.source}`,
              targetNodeId: node.id,
              timestamp: new Date().toISOString()
            };
          }
        }

        return {
          ruleId: 'sql-injection-guard',
          ruleName: 'SQL Injection Guard',
          passed: true,
          severity: 'BLOCKING',
          message: 'SQL safety analysis passed',
          targetNodeId: node.id,
          timestamp: new Date().toISOString()
        };
      }
    });
  }

  /**
   * Evaluates all registered invariant rules against an incoming node and prior history.
   * Returns list of evaluations and whether any BLOCKING invariant was breached.
   */
  public async evaluateNode(
    node: TrajectoryNode,
    history: TrajectoryNode[]
  ): Promise<{ passed: boolean; results: InvariantResult[] }> {
    const results: InvariantResult[] = [];
    let allPassed = true;

    for (const rule of this.rules.values()) {
      const result = await rule.evaluate(node, history);
      results.push(result);
      if (!result.passed && result.severity === 'BLOCKING') {
        allPassed = false;
      }
    }

    return { passed: allPassed, results };
  }
}
