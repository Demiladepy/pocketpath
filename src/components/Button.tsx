import type { ButtonHTMLAttributes } from "react"
import type { LucideIcon } from "lucide-react"

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon
  variant?: ButtonVariant
}

export function Button({
  icon: Icon,
  variant = "secondary",
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`.trim()} {...props}>
      {Icon ? <Icon aria-hidden="true" size={20} strokeWidth={2} /> : null}
      <span>{children}</span>
    </button>
  )
}
