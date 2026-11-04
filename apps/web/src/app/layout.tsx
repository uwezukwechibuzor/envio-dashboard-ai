import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers.js';

export const metadata: Metadata = {
  title: 'Envio Dashboard AI',
  description: 'Generate live DeFi analytics dashboards from natural language — powered by Envio HyperSync.',
  openGraph: {
    title: 'Envio Dashboard AI',
    description: 'Generate live DeFi analytics dashboards from natural language.',
    siteName: 'Envio Dashboard AI',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
