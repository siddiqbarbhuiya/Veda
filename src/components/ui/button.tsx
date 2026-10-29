import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon-sm" | "icon" | "icon-lg";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out " +
  "active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-line-strong bg-elevated text-fg hover:border-control hover:bg-overlay active:bg-sunken",
  ghost: "text-fg-2 hover:bg-fg/[0.07] hover:text-fg active:bg-fg/[0.11]",
  danger: "bg-danger-subtle text-danger hover:bg-danger hover:text-app active:bg-danger",
  success: "bg-success text-app hover:brightness-110 active:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-caption",
  sm: "h-8 px-3 text-ui",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  "icon-sm": "size-7",
  icon: "size-9",
  "icon-lg": "size-11",
};

export function buttonStyles({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : leadingIcon}
      {children}
    </button>
  );
}
