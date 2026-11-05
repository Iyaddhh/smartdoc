import { formatBytes } from "@/lib/format";

export default function AccountUsage({ usedBytes, quotaMB }: { usedBytes: number; quotaMB: number }) {
  const limit = quotaMB * 1024 * 1024;
  const percent = limit > 0 ? usedBytes / limit * 100 : 0;
  const label = percent > 0 && percent < 0.1 ? "<0,1" : percent.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  return <div className="admin-account-usage"><span>{formatBytes(usedBytes)} / {quotaMB.toLocaleString("id-ID")} MB</span><progress aria-label="Persentase kuota terpakai" value={Math.min(100, Math.max(0, percent))} max={100} /><small>{label}% terpakai{usedBytes > limit ? " · Melebihi kuota" : ""}</small></div>;
}
