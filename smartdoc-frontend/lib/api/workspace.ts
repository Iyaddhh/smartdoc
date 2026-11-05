import { apiFetch } from "./client";
import type { AgendaCategory, Folder, PlannerInput, PlannerItem, Summary, WorkspaceDocument, WorkspaceDocumentDetail } from "./workspace-types";

const base = "/api/workspace";
function json<T = unknown>(path: string, method: string, body: unknown) {
  return apiFetch<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export const getWorkspaceSummary = () => apiFetch<Summary>(`${base}/summary`);
export const listFolders = () => apiFetch<Folder[]>(`${base}/folders`);
export const createWorkspaceFolder = (name: string) => json(`${base}/folders`, "POST", { name });
export const renameWorkspaceFolder = (id: string, name: string) => json(`${base}/folders/${id}`, "PATCH", { name });
export const deleteWorkspaceFolder = (id: string) => apiFetch(`${base}/folders/${id}`, { method: "DELETE" });
export function listWorkspaceDocuments(params: { page?: number; search?: string; folder_id?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.search) query.set("search", params.search);
  if (params.folder_id) query.set("folder_id", params.folder_id);
  return apiFetch<{ items: WorkspaceDocument[]; total: number }>(`${base}/documents?${query}`);
}
export const uploadWorkspaceDocument = (form: FormData) => apiFetch(`${base}/documents`, { method: "POST", body: form });
export const getWorkspaceDocument = (id: string) => apiFetch<WorkspaceDocumentDetail>(`${base}/documents/${id}`);
export const moveWorkspaceDocument = (id: string, folder_id: string | null) => json(`${base}/documents/${id}/folder`, "PATCH", { folder_id });
export const listPlannerItems = () => apiFetch<PlannerItem[]>(`${base}/items`);
export const listAgendaCategories = () => apiFetch<AgendaCategory[]>(`${base}/categories`);
export const saveAgendaCategory = (body: Pick<AgendaCategory, "name" | "color">, id?: string) => json<AgendaCategory>(`${base}/categories${id ? "/" + id : ""}`, id ? "PATCH" : "POST", body);
export const deleteAgendaCategory = (id: string) => apiFetch(`${base}/categories/${id}`, { method: "DELETE" });
export const savePlannerItem = (body: PlannerInput, id?: string) => json(`${base}/items${id ? "/" + id : ""}`, id ? "PUT" : "POST", body);
export const deletePlannerItem = (id: string) => apiFetch(`${base}/items/${id}`, { method: "DELETE" });
export function completePlannerItem(item: PlannerItem) {
  const { id, ...body } = item;
  return savePlannerItem({ ...body, status: "done" }, id);
}
