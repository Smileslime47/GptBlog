import { spawnSync } from 'node:child_process';

// 前端与后端一并构建，保证从新的源码检出也能完整部署。
for (const args of [
  ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.client.config.ts'],
  ['scripts/run-framework.mjs', 'build'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
