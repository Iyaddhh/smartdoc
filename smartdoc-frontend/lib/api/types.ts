export interface ApiResponse<T = unknown> {
  httpStatus?: number;
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
  original_size?: number;
  output_size?: number | null;
  download_available?: boolean;
  is_saved?: boolean;
  expires_at?: string | null;
  storage_notice?: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface DocumentItem {
  is_saved: boolean;
  stored_size_bytes: number;
  download_available: boolean;
  expires_at: string | null;
  storage_notice: string | null;
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
