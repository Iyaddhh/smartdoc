"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { FileCheck2, Upload } from "lucide-react";

export default function FilePicker({ onChange, disabled, className, ...props }: Omit<ComponentProps<"input">, "type" | "ref">) {
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setNames([]);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  const Icon = names.length ? FileCheck2 : Upload;
  const summary = names.length > 1 ? `${names.length} berkas dipilih` : names[0];
  return <div className={`file-picker${disabled ? " file-picker--disabled" : ""}`}>
    <span className="file-picker-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
    <span className="file-picker-summary" aria-hidden="true">
      <span className="file-picker-name" title={names.join(", ")}>{summary || "Pilih berkas dari perangkat"}</span>
      <span className="file-picker-hint">{names.length ? "Klik untuk mengganti pilihan" : props.multiple ? "Anda dapat memilih beberapa berkas" : "Pilih satu berkas untuk diunggah"}</span>
    </span>
    <span className="file-picker-browse" aria-hidden="true">Telusuri</span>
    <input {...props} ref={input} className={className} type="file" disabled={disabled}
      onChange={(event) => { setNames(Array.from(event.target.files || [], (file) => file.name)); onChange?.(event); }} />
  </div>;
}
