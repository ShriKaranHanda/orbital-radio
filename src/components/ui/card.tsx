import type { ComponentPropsWithoutRef } from "react";

export function Card({ className = "", ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={`card ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={`card-header ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: ComponentPropsWithoutRef<"h2">) {
  return <h2 className={`card-title ${className}`} {...props} />;
}

export function CardDescription({ className = "", ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={`card-description ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={`card-content ${className}`} {...props} />;
}
