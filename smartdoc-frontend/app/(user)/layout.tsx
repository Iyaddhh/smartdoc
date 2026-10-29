import AuthGate from "@/components/layout/AuthGate";
export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
