export function Mark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path fill="currentColor" d="M16 3 28 16 16 29 4 16 16 3Z" />
      <path fill="var(--bg)" d="M16 11 22 16 16 21 10 16 16 11Z" />
    </svg>
  );
}
