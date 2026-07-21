interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export function Input({
  label,
  error,
  hint,
  fullWidth = true,
  className = '',
  disabled,
  ...props
}: InputProps) {
  const baseClasses = 'w-full px-lg py-md text-body-md font-sans border rounded-sm bg-canvas text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200';
  const disabledClasses = disabled ? 'bg-surface-soft text-muted cursor-not-allowed opacity-60' : '';
  const errorClasses = error ? 'border-signature-coral focus:ring-signature-coral' : 'border-hairline';
  
  const widthClass = fullWidth ? 'w-full' : '';
  const allClasses = `${baseClasses} ${disabledClasses} ${errorClasses} ${widthClass} ${className}`;

  return (
    <div>
      {label && (
        <label className="block text-label-md text-primary mb-md font-medium">
          {label}
        </label>
      )}
      <input
        className={allClasses}
        disabled={disabled}
        {...props}
      />
      {error && (
        <p className="text-caption text-signature-coral mt-sm">
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-caption text-muted mt-sm">
          {hint}
        </p>
      )}
    </div>
  );
}
