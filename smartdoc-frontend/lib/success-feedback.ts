import type { ApiResponse, JobStatus } from "@/lib/api/types";

/** A successful read/accepted request is not evidence of a completed mutation. */
export function isCompletedResponse(response: ApiResponse<unknown>): boolean {
  return response.success === true && [200, 201, 204].includes(response.httpStatus ?? 0);
}

export function isDownloadReady(job: JobStatus | null | undefined): boolean {
  return job?.status === "done" && job.download_available === true &&
    typeof job.output_size === "number" && Number.isFinite(job.output_size) && job.output_size > 0;
}

export function mutationFailure(response: ApiResponse<unknown>): string {
  return response.success && response.httpStatus === 202
    ? "Permintaan diterima dan masih diproses. Periksa status sebelum mencoba lagi."
    : response.message || "Perubahan belum dapat dikonfirmasi. Periksa status sebelum mencoba lagi.";
}

export function isCompletedFile(response: Pick<Response, "status" | "headers">, blob: Blob): boolean {
  const type = (response.headers.get("Content-Type") || blob.type).split(";")[0].trim().toLowerCase();
  return response.status === 200 && blob.size > 0 &&
    ["application/pdf", "application/zip", "application/x-zip-compressed", "application/octet-stream",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/jpeg", "image/png"].includes(type);
}
