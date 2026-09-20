import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const workspaceEnv = resolve(process.cwd(), '../../.env');

if (existsSync(workspaceEnv)) {
  loadEnvFile(workspaceEnv);
}

const nextConfig: NextConfig = {};

export default nextConfig;
