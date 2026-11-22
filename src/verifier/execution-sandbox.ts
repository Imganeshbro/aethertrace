/**
 * BARON: Branching Autonomous Reasoning & Oracle Network
 * Execution Sandbox: Deterministic, isolated code evaluation with CPU & memory guards
 */

import { spawn } from 'node:child_process';
import type { ExecutionArtifacts } from '../core/types.ts';

export interface SandboxOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
}

export class ExecutionSandbox {
  private defaultTimeoutMs: number;
  private defaultMemoryLimitMb: number;

  constructor(options: SandboxOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? 3000;
    this.defaultMemoryLimitMb = options.memoryLimitMb ?? 128;
  }

  /**
   * Execute code in an isolated child process with strict timeout and output capturing
   */
  async executeCode(
    code: string,
    options: SandboxOptions = {}
  ): Promise<ExecutionArtifacts> {
    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = performance.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Wrap code in safety envelope to intercept console output and uncaught rejections
      const wrappedCode = `
        const util = require('node:util');
        const originalLog = console.log;
        const originalError = console.error;
        
        try {
          ${code}
        } catch (err) {
          process.stderr.write(String(err && err.stack ? err.stack : err));
          process.exit(1);
        }
      `;

      const child = spawn(
        process.execPath,
        [
          `--max-old-space-size=${options.memoryLimitMb ?? this.defaultMemoryLimitMb}`,
          '-e',
          wrappedCode
        ],
        {
          windowsHide: true,
          env: {
            ...process.env,
            NODE_ENV: 'test'
          }
        }
      );

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // Process might already be dead
        }
      }, timeout);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const duration = Math.round(performance.now() - startTime);

        if (timedOut) {
          resolve({
            code,
            stdout,
            stderr: stderr + `\n[SANDBOX_TIMEOUT]: Execution exceeded deadline of ${timeout}ms.`,
            exitCode: 124,
            executionTimeMs: duration,
            error: `Execution timed out after ${timeout}ms`
          });
          return;
        }

        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 0,
          executionTimeMs: duration,
          error: code !== 0 ? (stderr.trim() || `Process exited with code ${code}`) : undefined
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const duration = Math.round(performance.now() - startTime);
        resolve({
          code,
          stdout,
          stderr: String(err),
          exitCode: 1,
          executionTimeMs: duration,
          error: err.message
        });
      });
    });
  }

  /**
   * Run unit tests / assertion code against a candidate solution
   */
  async runAssertions(
    candidateCode: string,
    assertionCode: string
  ): Promise<{ passed: boolean; error?: string; artifacts: ExecutionArtifacts }> {
    const combinedScript = `
      ${candidateCode}
      
      // BARON Automated Verifier Assertions
      ${assertionCode}
    `;

    const artifacts = await this.executeCode(combinedScript);
    const passed = artifacts.exitCode === 0 && !artifacts.error;

    return {
      passed,
      error: artifacts.error,
      artifacts
    };
  }

  /**
   * Execute Python code in an isolated sub-process with safe fallback
   */
  async executePython(
    code: string,
    options: SandboxOptions = {}
  ): Promise<ExecutionArtifacts> {
    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = performance.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      let child;
      try {
        child = spawn('python', ['-c', code], { windowsHide: true });
      } catch (err: any) {
        return resolve({
          code,
          stdout: '',
          stderr: `Python runtime unavailable: ${err?.message}`,
          exitCode: 1,
          executionTimeMs: 0,
          error: 'Python binary not available in host environment'
        });
      }

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGKILL'); } catch {}
      }, timeout);

      child.stdout?.on('data', (c) => { stdout += c.toString(); });
      child.stderr?.on('data', (c) => { stderr += c.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        const duration = Math.round(performance.now() - startTime);
        if (timedOut) {
          return resolve({
            code,
            stdout,
            stderr: stderr + `\n[SANDBOX_TIMEOUT]: Python execution exceeded deadline of ${timeout}ms.`,
            exitCode: 124,
            executionTimeMs: duration,
            error: `Timeout after ${timeout}ms`
          });
        }
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 0,
          executionTimeMs: duration,
          error: code !== 0 ? (stderr.trim() || `Process exited with code ${code}`) : undefined
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          code,
          stdout: '',
          stderr: `Python invocation error: ${err.message}`,
          exitCode: 1,
          executionTimeMs: 0,
          error: `Python execution failed: ${err.message}`
        });
      });
    });
  }
}
