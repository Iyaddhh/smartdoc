import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PublicShell from "@/components/layout/PublicShell";
import PageHeading from "@/components/ui/PageHeading";
import GuestToolForm from "@/components/GuestToolForm";
import { guestTools, type GuestToolId } from "@/lib/guest-tools";

export default function GuestToolPage({ tool }: { tool: GuestToolId }) {
  const selected = guestTools.find((item) => item.id === tool)!;
  return <PublicShell>
    <section className="guest-tools guest-tool-page">
      <Link className="guest-tool-back" href="/#tools"><ArrowLeft size={16} aria-hidden="true" />Semua tools</Link>
      <PageHeading title={selected.name} />
      <GuestToolForm key={tool} tool={tool} />
    </section>
  </PublicShell>;
}
