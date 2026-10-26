import type { Metadata } from 'next';
import './globals.css';
import { SetupLinkRedirect } from '@/features/auth/setup-link-redirect';

export const metadata: Metadata = {
  title: 'Hotel Operations',
  description: 'Staff-only hotel operations workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><SetupLinkRedirect />{children}</body>
    </html>
  );
}
