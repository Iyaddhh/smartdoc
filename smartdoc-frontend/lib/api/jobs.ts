import { apiFetch } from "./client";
import type { ApiResponse, JobStatus } from "./types";

export async function getJobStatus(jobId: string): Promise<ApiResponse<JobStatus>> {
  return apiFetch<JobStatus>(`/api/jobs/${jobId}`);
}
