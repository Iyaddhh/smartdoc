import AuthScreen from "./AuthScreen";
import type { UserRole } from "@/lib/auth-token";

export default function LoginForm({ role }: { role: UserRole }) {
  return <AuthScreen mode="login" role={role} />;
}
