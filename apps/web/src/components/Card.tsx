import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
}

export default function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-white shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}
