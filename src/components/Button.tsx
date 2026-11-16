import React from "react";
import { Button as ShadcnButton, ButtonProps as ShadcnButtonProps, ButtonVariant, ButtonSize } from "@/components/ui/button";

export interface ButtonProps extends ShadcnButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
}

/**
 * Standardized Unified Button Component
 * Re-exports and wraps shadcn/ui button with unified loading, icon, and variant props.
 */
export const Button: React.FC<ButtonProps> = (props) => {
  return <ShadcnButton {...props} />;
};
