const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const skipInstall = process.argv.includes('--skip-install');

function write(relativePath, contents) {
  const target = join(root, relativePath);
  if (existsSync(target)) {
    console.log(`KEEP   ${relativePath}`);
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents.trimStart(), 'utf8');
  console.log(`CREATE ${relativePath}`);
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const rootPackage = {
  name: 'hotel-operations',
  private: true,
  version: '0.0.0',
  packageManager: 'pnpm@12.4.2',
  engines: { node: '>=24.15.0' },
  scripts: {
    dev: 'concurrently -k -n WEB,API,WORKER -c cyan,green,yellow "pnpm --dir apps/web dev" "pnpm --dir apps/api start:dev" "pnpm --dir apps/worker start:dev"',
    build: 'pnpm -r --if-present build',
    lint: 'pnpm -r --if-present lint',
    typecheck: 'pnpm -r --if-present typecheck',
    test: 'pnpm -r --if-present test',
    'db:generate': 'prisma generate',
    'db:migrate': 'prisma migrate dev',
    'db:seed': 'tsx prisma/seed.ts'
  },
  devDependencies: {
    concurrently: 'latest',
    dotenv: 'latest',
    prettier: 'latest',
    prisma: 'latest',
    tsx: 'latest',
    typescript: 'latest'
  }
};

const webPackage = {
  name: '@hotel-operations/web',
  private: true,
  version: '0.0.0',
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
    lint: 'eslint .',
    typecheck: 'tsc --noEmit'
  },
  dependencies: {
    '@hotel-operations/contracts': 'workspace:*',
    '@hotel-operations/domain': 'workspace:*',
    '@hotel-operations/ui': 'workspace:*',
    next: 'latest',
    react: 'latest',
    'react-dom': 'latest',
    zod: 'latest'
  },
  devDependencies: {
    '@types/node': 'latest',
    '@types/react': 'latest',
    '@types/react-dom': 'latest',
    eslint: 'latest',
    'eslint-config-next': 'latest',
    typescript: 'latest'
  }
};

function nestPackage(name) {
  return {
    name: `@hotel-operations/${name}`,
    private: true,
    version: '0.0.0',
    scripts: {
      build: 'nest build',
      start: 'nest start',
      'start:dev': 'nest start --watch',
      'start:prod': 'node dist/main.js',
      typecheck: 'tsc --noEmit'
    },
    dependencies: {
      '@hotel-operations/contracts': 'workspace:*',
      '@hotel-operations/domain': 'workspace:*',
      '@nestjs/common': 'latest',
      '@nestjs/core': 'latest',
      '@nestjs/platform-express': 'latest',
      'reflect-metadata': 'latest',
      rxjs: 'latest',
      zod: 'latest'
    },
    devDependencies: {
      '@nestjs/cli': 'latest',
      '@types/node': 'latest',
      typescript: 'latest'
    }
  };
}

const packageTsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    declaration: true,
    outDir: 'dist',
    rootDir: 'src',
    strict: true,
    skipLibCheck: true
  },
  include: ['src/**/*.ts', 'src/**/*.tsx']
};

const nestTsconfig = {
  compilerOptions: {
    module: 'commonjs',
    declaration: true,
    removeComments: true,
    emitDecoratorMetadata: true,
    experimentalDecorators: true,
    allowSyntheticDefaultImports: true,
    target: 'ES2022',
    sourceMap: true,
    outDir: './dist',
    baseUrl: './',
    incremental: true,
    strict: true,
    skipLibCheck: true
  },
  include: ['src/**/*.ts']
};

write('package.json', json(rootPackage));
write('pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
write('.npmrc', 'shared-workspace-lockfile=true\n');
write('.env.example', `NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:3001
DATABASE_URL=postgresql://hotel:hotel@localhost:5432/hotel_operations
AUTH_SECRET=replace-with-a-generated-local-secret
HOTEL_TIME_ZONE=
DAILY_INSPECTION_LOCAL_TIME=
`);
write('.gitignore', `node_modules/
.next/
dist/
coverage/
.env
.env.local
!.env.example
*.log
`);

write('apps/web/package.json', json(webPackage));
write('apps/web/tsconfig.json', json({
  compilerOptions: {
    target: 'ES2017',
    lib: ['dom', 'dom.iterable', 'esnext'],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: 'preserve',
    incremental: true,
    plugins: [{ name: 'next' }],
    paths: { '@/*': ['./src/*'] }
  },
  include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
  exclude: ['node_modules']
}));
write('apps/web/next-env.d.ts', `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`);
write('apps/web/next.config.ts', `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`);
write('apps/web/eslint.config.mjs', `import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
`);
write('apps/web/src/app/globals.css', `:root {
  --sage: #98a086;
  --rose: #a76d5e;
  --tan: #c4a071;
  --beige: #dfccb1;
  --brown: #846044;
  color-scheme: light;
}

* { box-sizing: border-box; }
html { font-family: Arial, sans-serif; }
body { margin: 0; }
`);
write('apps/web/src/app/layout.tsx', `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hotel Operations',
  description: 'Staff-only hotel operations workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);
write('apps/web/src/app/page.tsx', `import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/overview');
}
`);
write('apps/web/src/app/(auth)/login/page.tsx', `export default function LoginPage() {
  return <main><h1>Staff sign in</h1></main>;
}
`);
write('apps/web/src/app/(operations)/layout.tsx', `export default function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
`);

const pages = {
  overview: ['OverviewPage', 'Hotel overview'],
  rooms: ['RoomsPage', 'Room board'],
  stays: ['StaysPage', 'Guest stays'],
  'departure-due': ['DepartureDuePage', 'Departure due'],
  inspections: ['InspectionsPage', 'Room inspections'],
  maintenance: ['MaintenancePage', 'Maintenance'],
  payments: ['PaymentsPage', 'Payments recorded'],
  activity: ['ActivityPage', 'Activity history']
};

for (const [route, [component, title]] of Object.entries(pages)) {
  write(`apps/web/src/app/(operations)/${route}/page.tsx`, `export default function ${component}() {
  return <main><h1>${title}</h1></main>;
}
`);
}

write('apps/web/src/components/.gitkeep', '');
write('apps/web/src/features/.gitkeep', '');
write('apps/web/src/lib/.gitkeep', '');

write('apps/api/package.json', json(nestPackage('api')));
write('apps/api/tsconfig.json', json(nestTsconfig));
write('apps/api/tsconfig.build.json', json({ extends: './tsconfig.json', exclude: ['node_modules', 'dist', 'test', '**/*.spec.ts'] }));
write('apps/api/nest-cli.json', json({ collection: '@nestjs/schematics', sourceRoot: 'src' }));
write('apps/api/src/main.ts', `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
`);
write('apps/api/src/app.module.ts', `import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
`);

for (const moduleName of [
  'auth', 'staff', 'rooms', 'room-categories', 'stays', 'payments',
  'inspections', 'maintenance', 'activity', 'operations-stream', 'health'
]) {
  write(`apps/api/src/modules/${moduleName}/.gitkeep`, '');
}

write('apps/worker/package.json', json(nestPackage('worker')));
write('apps/worker/tsconfig.json', json(nestTsconfig));
write('apps/worker/tsconfig.build.json', json({ extends: './tsconfig.json', exclude: ['node_modules', 'dist', 'test', '**/*.spec.ts'] }));
write('apps/worker/nest-cli.json', json({ collection: '@nestjs/schematics', sourceRoot: 'src' }));
write('apps/worker/src/main.ts', `import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);
}

void bootstrap();
`);
write('apps/worker/src/worker.module.ts', `import { Module } from '@nestjs/common';

@Module({})
export class WorkerModule {}
`);
write('apps/worker/src/jobs/.gitkeep', '');

const sharedPackages = {
  domain: 'Pure hotel business rules and state transitions.',
  contracts: 'Shared request, response, event, and validation contracts.',
  ui: 'Shared staff-interface components and design tokens.',
  config: 'Shared project configuration.'
};

for (const [name, description] of Object.entries(sharedPackages)) {
  write(`packages/${name}/package.json`, json({
    name: `@hotel-operations/${name}`,
    private: true,
    version: '0.0.0',
    description,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts'
  }));
  write(`packages/${name}/tsconfig.json`, json(packageTsconfig));
  write(`packages/${name}/src/index.ts`, `// ${description}\nexport {};\n`);
}

write('prisma/schema.prisma', `generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// Add models only after the product rules and relationships are mapped.
`);
write('prisma.config.ts', `import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
`);
write('prisma/seed.ts', `async function main() {
  console.log('No production seed data has been defined yet.');
}

void main();
`);
write('docs/decisions/.gitkeep', '');
write('docs/decisions/0001-approved-prototype.md', `# Approved production baseline

The approved product baseline is \`03-hotel-operations.html\`, supported by
\`operations-shell.html\` and \`operations-app.js\`.

Production implementation must port the approved interface, responsive behaviour,
roles, page hierarchy, terminology, and operational workflows. Do not redesign or
simplify an approved flow merely because the implementation framework changes.

Replace only prototype infrastructure:

- localStorage becomes authoritative PostgreSQL persistence;
- demo profiles become authenticated staff identities;
- browser-only permission checks become server-enforced authorization;
- client-side state transitions become transactional domain/API operations;
- same-browser synchronization becomes server-driven updates with refetch recovery;
- sample records become controlled development seed data.

The prototype remains a visual and behavioural reference. Product rules in
\`prd.md\` remain authoritative when implementation details are ambiguous.
`);

if (skipInstall) {
  console.log('\nFiles created. Dependency installation was skipped.');
  process.exit(0);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const check = spawnSync(pnpm, ['--version'], { cwd: root, stdio: 'inherit' });
if (check.status !== 0) {
  console.error('\nERROR: pnpm was not found. Install or enable pnpm, then run setup-main-build.cmd again.');
  process.exit(1);
}

console.log('\nInstalling workspace dependencies...');
const install = spawnSync(pnpm, ['install'], { cwd: root, stdio: 'inherit' });
if (install.status !== 0) process.exit(install.status ?? 1);

console.log('\nSetup complete. Next command: pnpm dev');
