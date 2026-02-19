interface InlineSpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

export default function InlineSpinner({ size = 'md', className = '' }: InlineSpinnerProps) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <svg
      className={`${sizeClass} animate-spin text-gray-500 ${className}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-3.357-5.357M20 15v5h-5"
      />
    </svg>
  );
}
