#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mcpServerPath = resolve(__dirname, '../src/mcp/server.ts');

const args = ['--experimental-strip-types', mcpServerPath, ...process.argv.slice(2)];
const child = spawn(process.execPath, args, { stdio: 'inherit' });

child.on('exit', (code) => {
  process.exit(code || 0);
});
