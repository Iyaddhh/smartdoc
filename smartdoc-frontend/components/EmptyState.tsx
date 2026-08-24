"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onActionClick?: () => void;
}

export default function EmptyState({
  icon = <FolderOpen size={36} strokeWidth={1.5} style={{ color: "var(--color-ash-gray)" }} />,
  title,
  description,
  actionText,
  actionHref,
  onActionClick,
}: EmptyStateProps) {
  return (
    <div
      className="card animate-fade-in"
      style={{
        textAlign: "center",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="stat-icon"
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "var(--radius-cards)",
          marginBottom: "16px",
          background: "var(--color-stone-canvas)",
        }}
      >
        {icon}
      </div>

      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-ink-black)", marginBottom: "4px" }}>
        {title}
      </h3>

      <p
        style={{
          color: "var(--color-warm-gray)",
          fontSize: "13.5px",
          maxWidth: "420px",
          lineHeight: 1.6,
          marginBottom: actionText ? "20px" : "0",
        }}
      >
        {description}
      </p>

      {actionText && (
        actionHref ? (
          <Link href={actionHref}>
            <button className="btn btn-primary btn-sm">{actionText}</button>
          </Link>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onActionClick}>
            {actionText}
          </button>
        )
      )}
    </div>
  );
}
