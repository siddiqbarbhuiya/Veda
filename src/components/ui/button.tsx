import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
// "touch" and "icon-touch" are 44 px below md and shrink to the dense size from md.
export type ButtonSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "icon-sm"
  | "icon"
  | "icon-lg"
  | "touch"
  | "icon-touch"
  | "icon-sm-touch";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out " +
  "active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-control bg-elevated text-fg hover:border-accent-text/70 hover:bg-sunken active:bg-sunken",
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
  touch: "h-11 px-4 text-sm md:h-9",
  "icon-touch": "size-11 md:size-9",
  "icon-sm-touch": "size-11 sm:size-7",
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
  onClick,
  ...rest
}: ButtonProps) {
  // While loading, keep the button focusable (aria-disabled) and ignore clicks.
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : leadingIcon}
      {children}
    </button>
  );
}
