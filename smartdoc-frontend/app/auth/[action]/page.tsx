import AuthScreen from "@/components/auth/AuthScreen";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action === "onboarding" || action === "verify-email" || action === "check-email" || action === "forgot-password" || action === "reset-password") return <AuthScreen mode={action} />;
  notFound();
}
