export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  error: string | null;
}

export interface JobStatus {
  id: string;
  document_id: string;
  feature: string;
  status: "pending" | "processing" | "done" | "failed";
  progress: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  feature: "converter" | "compressor" | "splitter" | "merger" | "watermark";
  custom_name: string | null;
  original_file: string | null;
  output_file: string | null;
  original_size: number;
  output_size: number | null;
  status: string;
  created_at: string;
}

export interface DocumentInfo {
  filename: string;
  format: string;
  total_pages: number;
  file_size: number;
  thumbnails?: string[];
}
