'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from './WalletButton';
import { FaucetButton } from './FaucetButton';
import { Mark } from './Mark';

const navItems = [
  { name: 'Markets', href: '/' },
  { name: 'Baskets', href: '/baskets' },
  { name: 'SIPs', href: '/sip' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-accent">
            <Mark className="h-6 w-6" />
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Kite</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-out ${
                    isActive ? 'bg-raised font-medium text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center space-x-3">
          <FaucetButton />
          <WalletButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-line px-4 py-1 sm:hidden" aria-label="Mobile">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                isActive ? 'bg-raised font-medium text-ink' : 'text-muted'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
