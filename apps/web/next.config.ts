import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const workspaceEnv = resolve(process.cwd(), '../../.env');

if (existsSync(workspaceEnv)) {
  loadEnvFile(workspaceEnv);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // Compatible structural protections. A strict script policy needs a
      // separately verified nonce strategy for Next.js hydration.
      { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
    ],
  }],
};

export default nextConfig;
