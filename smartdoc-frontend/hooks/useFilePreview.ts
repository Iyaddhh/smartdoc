"use client";

import { useEffect, useState } from "react";
import { fetchFile } from "@/lib/api/files";
import { showToast } from "@/components/Toast";

export function useFilePreview(endpoint: string | null) {
  const [preview, setPreview] = useState<{ endpoint: string; url: string } | null>(null);
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    fetchFile(endpoint, controller.signal).then(({ blob }) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ endpoint, url: objectUrl });
    }).catch((error) => {
      if (!controller.signal.aborted) showToast("error", error.message || "Gagal memuat pratinjau.");
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint]);
  return preview?.endpoint === endpoint ? preview.url : undefined;
}
