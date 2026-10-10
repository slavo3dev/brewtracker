"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel: string };

export function SubmitButton({ pendingLabel, children, disabled, ...props }: Props) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={disabled || pending} aria-disabled={disabled || pending}>{pending ? pendingLabel : children}</button>;
}