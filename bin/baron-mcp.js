#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mcpPath = join(__dirname, '..', 'src', 'mcp', 'server.ts');

const child = spawn(process.execPath, ['--experimental-strip-types', mcpPath, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
