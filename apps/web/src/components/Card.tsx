import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
}

export default function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-100/90 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.03)] transition-all ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
