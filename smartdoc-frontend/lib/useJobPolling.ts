"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getJobStatus, JobStatus } from "./api";

interface UseJobPollingOptions {
  onDone?: (job: JobStatus) => void;
  onFailed?: (job: JobStatus) => void;
  intervalMs?: number;
}

interface UseJobPollingResult {
  job: JobStatus | null;
  isPolling: boolean;
  error: string | null;
  elapsedSeconds: number;
  stop: () => void;
}

export function useJobPolling(
  jobId: string | null,
  options: UseJobPollingOptions = {}
): UseJobPollingResult {
  const { onDone, onFailed, intervalMs = 1000 } = options;
  const [job, setJob] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onDone);
  const onFailedRef = useRef(onFailed);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => { onFailedRef.current = onFailed; }, [onFailed]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setElapsedSeconds(0);
      return;
    }

    setIsPolling(true);
    setError(null);
    setElapsedSeconds(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const poll = async () => {
      try {
        const res = await getJobStatus(jobId);
        if (!res.success || !res.data) {
          setError(res.error || "Gagal mendapatkan status job");
          stop();
          return;
        }

        setJob(res.data);

        if (res.data.status === "done") {
          stop();
          onDoneRef.current?.(res.data);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("SmartDoc — Selesai!", { body: "Proses dokumen berhasil diselesaikan." });
          }
        } else if (res.data.status === "failed") {
          stop();
          setError(res.data.error || "Proses gagal");
          onFailedRef.current?.(res.data);
        }
      } catch {
        setError("Gagal terhubung ke server");
        stop();
      }
    };

    poll();
    intervalRef.current = setInterval(poll, intervalMs);

    return () => stop();
  }, [jobId, intervalMs, stop]);

  return { job, isPolling, error, elapsedSeconds, stop };
}
