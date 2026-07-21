import { ReactNode } from 'react';

export type CardVariant = 'default' | 'elevated' | 'flat' | 'coral' | 'forest' | 'dark';

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-canvas border border-hairline rounded-md shadow-none',
  elevated: 'bg-canvas border border-hairline rounded-md shadow-lg',
  flat: 'bg-surface-soft border-0 rounded-md',
  coral: 'bg-signature-coral text-canvas rounded-lg',
  forest: 'bg-signature-forest text-canvas rounded-lg',
  dark: 'bg-surface-dark text-canvas rounded-lg',
};

export function Card({
  variant = 'default',
  className = '',
  children,
}: CardProps) {
  return (
    <div className={`${variantClasses[variant]} p-lg ${className}`}>
      {children}
    </div>
  );
}
