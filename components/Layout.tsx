import { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className = '' }: ContainerProps) {
  return (
    <div className={`max-w-7xl mx-auto px-lg py-section ${className}`}>
      {children}
    </div>
  );
}

export function SectionBand({ children, className = '' }: ContainerProps) {
  return (
    <section className={`py-section border-b border-hairline ${className}`}>
      {children}
    </section>
  );
}

export function SectionBandDark({ children, className = '' }: ContainerProps) {
  return (
    <section className={`py-section bg-surface-dark text-canvas ${className}`}>
      {children}
    </section>
  );
}

interface GridProps {
  children: ReactNode;
  columns?: 'dashboard' | 'dashboard-wide' | 'auto';
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Grid({
  children,
  columns = 'dashboard',
  gap = 'lg',
  className = '',
}: GridProps) {
  const columnClasses = {
    dashboard: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    'dashboard-wide': 'grid-cols-1 lg:grid-cols-4',
    auto: 'grid-cols-1',
  };

  const gapClasses = {
    sm: 'gap-sm',
    md: 'gap-md',
    lg: 'gap-lg',
  };

  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}

export function Stack({
  children,
  direction = 'vertical',
  gap = 'md',
  className = '',
}: {
  children: ReactNode;
  direction?: 'vertical' | 'horizontal';
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const directionClass = direction === 'vertical' ? 'flex flex-col' : 'flex flex-row';
  const gapClasses = {
    xs: 'gap-xs',
    sm: 'gap-sm',
    md: 'gap-md',
    lg: 'gap-lg',
    xl: 'gap-xl',
  };

  return (
    <div className={`${directionClass} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}
