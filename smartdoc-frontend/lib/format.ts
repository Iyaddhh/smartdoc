export function formatBytes(bytes: number | null | undefined, empty = "0 B"): string {
  if (!bytes || !Number.isFinite(bytes) || bytes < 0) return empty;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
