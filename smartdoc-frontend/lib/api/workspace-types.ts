export interface WorkspaceDocument { id: string; name: string; folder_id: string | null; feature: string; status: string; size: number; format?: string; download_available?: boolean }
export interface WorkspaceDocumentDetail extends WorkspaceDocument { format: string; created_at: string; folder_name: string | null; is_saved: boolean; download_available: boolean; related_items: PlannerItem[] }
export interface Folder { id: string; name: string }
export interface AgendaCategory { id: string; name: string; color: string }
export interface PlannerItem { id: string; kind: "task" | "event"; title: string; description: string; status: "todo" | "doing" | "done"; priority: "normal" | "high" | "low"; starts_at: string | null; ends_at: string | null; due_at: string | null; document_ids: string[]; category_id: string | null }
export type PlannerInput = Omit<PlannerItem, "id">;
export interface Summary { document_count: number; open_tasks: number; storage_bytes: number; quota_mb: number; reminders: PlannerItem[] }
