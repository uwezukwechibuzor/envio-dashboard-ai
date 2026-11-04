'use client';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[rgb(var(--accent))] text-white hover:opacity-90',
  secondary: 'bg-[rgb(var(--card))] border border-[rgb(var(--border))] hover:bg-[rgb(var(--border))]',
  ghost: 'hover:bg-[rgb(var(--card))]',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--accent))] disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && (
        <span className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
      )}
      {children}
    </button>
  );
});
