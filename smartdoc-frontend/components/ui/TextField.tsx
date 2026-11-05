"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, Search } from "lucide-react";

export default function TextField({ type = "text", className, disabled, ...props }: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  const Icon = password ? LockKeyhole : type === "email" ? Mail : type === "search" ? Search : null;
  return <div className={`field-shell${disabled ? " field-shell--disabled" : ""}`}>
    {Icon && <Icon className="field-leading" size={17} strokeWidth={1.75} aria-hidden="true" />}
    <input {...props} className={`field-control${className ? " " + className : ""}`} type={password && visible ? "text" : type} disabled={disabled} />
    {password && <button className="field-reveal" type="button" disabled={disabled}
      aria-label={visible ? "Sembunyikan password" : "Tampilkan password"} aria-pressed={visible}
      onClick={() => setVisible((previous) => !previous)}>
      {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
    </button>}
  </div>;
}
