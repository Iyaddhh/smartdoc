import { apiFetch } from "./client";
import type { Account, AccountDetail, AdminAudit, AdminOverview, AdminProcess, PageResult, ServiceHealth, ServiceSettings } from "./admin-types";

export const listAccounts = (search: string, page: number) => apiFetch<PageResult<Account>>(`/api/admin/users?${new URLSearchParams({ search, page: String(page) })}`);
export const getAccount = (id: string) => apiFetch<AccountDetail>(`/api/admin/users/${encodeURIComponent(id)}`);
export const getAdminOverview = () => apiFetch<AdminOverview>("/api/admin/overview");
export const listAdminAudit = (page: number) => apiFetch<PageResult<AdminAudit>>(`/api/admin/audit?page=${page}`);
export const listAdminProcesses = (feature: string, status: string, page: number, period: "24h" | "7d" | "all" = "24h") => apiFetch<PageResult<AdminProcess>>(`/api/admin/jobs?${new URLSearchParams({ feature, status, page: String(page), period })}`);
export const getServiceHealth = () => apiFetch<ServiceHealth>("/api/admin/health");
export const getServiceSettings = () => apiFetch<ServiceSettings>("/api/admin/settings");
export const updateAccount = (id: string, body: Pick<Account, "is_active" | "storage_quota_mb">) => apiFetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const revokeAccountSessions = (id: string) => apiFetch(`/api/admin/users/${id}/revoke-sessions`, { method: "POST" });
