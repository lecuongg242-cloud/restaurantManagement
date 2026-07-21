import { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-canvas hover:bg-primary-active',
  secondary: 'bg-canvas text-primary border border-hairline hover:bg-surface-soft',
  ghost: 'text-primary hover:bg-surface-soft',
  success: 'bg-success text-canvas hover:opacity-90',
  danger: 'bg-signature-coral text-canvas hover:opacity-90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-md py-sm text-body-md',
  md: 'px-lg py-md text-button',
  lg: 'px-xl py-lg text-label-md',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) {
  const baseClasses = 'font-sans font-medium rounded-lg transition-colors duration-200 cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed';
  const widthClass = fullWidth ? 'w-full' : '';
  const allClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`;

  return (
    <button className={allClasses} {...props} />
  );
}
