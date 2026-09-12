import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kite — Non-Custodial Neo-Brokerage on Solana',
  description: '1-Click Thematic Stock Baskets, Automated Recurring SIPs, and Stock Intelligence on Solana.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#121212] text-slate-100 font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
