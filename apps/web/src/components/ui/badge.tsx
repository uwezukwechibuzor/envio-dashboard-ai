type BadgeProps = { children: React.ReactNode; variant?: 'default' | 'green' | 'orange' | 'red'; className?: string };

const VARIANTS = {
  default: 'bg-[rgb(var(--card))] text-[rgb(var(--muted))] border border-[rgb(var(--border))]',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
