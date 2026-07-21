import { ReactNode } from 'react';

export type TextVariant = 'display-xl' | 'display-lg' | 'display-md' | 'title-lg' | 'title-md' | 'title-sm' | 'label-md' | 'body-md' | 'caption';

interface TextProps {
  variant?: TextVariant;
  className?: string;
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';
}

const variantClasses: Record<TextVariant, string> = {
  'display-xl': 'text-display-xl font-sans font-medium',
  'display-lg': 'text-display-lg font-sans font-normal',
  'display-md': 'text-display-md font-sans font-normal',
  'title-lg': 'text-title-lg font-sans font-normal text-primary',
  'title-md': 'text-title-md font-sans font-normal text-primary',
  'title-sm': 'text-title-sm font-sans font-medium text-primary',
  'label-md': 'text-label-md font-sans font-medium text-primary',
  'body-md': 'text-body-md font-sans font-normal text-body',
  caption: 'text-caption font-sans font-medium text-muted',
};

const defaultElement: Record<TextVariant, 'h1' | 'h2' | 'h3' | 'p' | 'span'> = {
  'display-xl': 'h2',
  'display-lg': 'h1',
  'display-md': 'h2',
  'title-lg': 'h3',
  'title-md': 'h3',
  'title-sm': 'h4',
  'label-md': 'span',
  'body-md': 'p',
  caption: 'span',
};

export function Text({
  variant = 'body-md',
  className = '',
  children,
  as,
}: TextProps) {
  const Component = as || defaultElement[variant];
  const allClasses = `${variantClasses[variant]} ${className}`;

  return (
    <Component className={allClasses}>
      {children}
    </Component>
  );
}

/* Convenience exports */
export function H1({ children, className }: { children: ReactNode; className?: string }) {
  return <Text as="h1" variant="display-lg" className={className}>{children}</Text>;
}

export function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <Text as="h2" variant="display-md" className={className}>{children}</Text>;
}

export function H3({ children, className }: { children: ReactNode; className?: string }) {
  return <Text as="h3" variant="title-lg" className={className}>{children}</Text>;
}

export function H4({ children, className }: { children: ReactNode; className?: string }) {
  return <Text as="h4" variant="title-md" className={className}>{children}</Text>;
}

export function Paragraph({ children, className }: { children: ReactNode; className?: string }) {
  return <Text as="p" variant="body-md" className={className}>{children}</Text>;
}

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <Text as="span" variant="caption" className={className}>{children}</Text>;
}
