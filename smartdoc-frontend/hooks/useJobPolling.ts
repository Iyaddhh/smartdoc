"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getJobStatus, JobStatus } from "@/lib/api";

interface UseJobPollingOptions {
  onDone?: (job: JobStatus) => void;
  onFailed?: (job: JobStatus) => void;
  /** Interval polling awal dalam ms (default: 1000ms) */
  intervalMs?: number;
  /** Interval polling maksimum dalam ms (default: 10000ms = 10 detik) */
  maxIntervalMs?: number;
  /** Faktor pengali untuk exponential backoff (default: 2) */
  backoffFactor?: number;
}

interface UseJobPollingResult {
  job: JobStatus | null;
  isPolling: boolean;
  error: string | null;
  elapsedSeconds: number;
  /** Interval polling saat ini (berguna untuk debugging/UI feedback) */
  currentIntervalMs: number;
  stop: () => void;
}

export function useJobPolling(
  jobId: string | null,
  options: UseJobPollingOptions = {}
): UseJobPollingResult {
  const {
    onDone,
    onFailed,
    intervalMs = 1000,
    maxIntervalMs = 10000,
    backoffFactor = 2,
  } = options;

  const [job, setJob] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentIntervalMs, setCurrentIntervalMs] = useState(intervalMs);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onDone);
  const onFailedRef = useRef(onFailed);
  const isHandledRef = useRef(false);
  // Ref untuk melacak backoff interval tanpa memicu re-render
  const currentIntervalRef = useRef(intervalMs);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => { onFailedRef.current = onFailed; }, [onFailed]);

  const stop = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (secondTimerRef.current) {
      clearInterval(secondTimerRef.current);
      secondTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      // Reset the state of the external polling subscription when it is removed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJob(null);
      setElapsedSeconds(0);
      setCurrentIntervalMs(intervalMs);
      currentIntervalRef.current = intervalMs;
      isHandledRef.current = false;
      stop();
      return;
    }

    let isMounted = true;
    isHandledRef.current = false;
    currentIntervalRef.current = intervalMs; // Reset backoff untuk job baru
    setCurrentIntervalMs(intervalMs);
    setIsPolling(true);
    setError(null);
    setElapsedSeconds(0);

    const startTime = Date.now();
    secondTimerRef.current = setInterval(() => {
      if (isMounted) {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);

    const poll = async () => {
      if (!isMounted || isHandledRef.current) return;
      try {
        const res = await getJobStatus(jobId);
        if (!isMounted || isHandledRef.current) return;

        if (!res.success || !res.data) {
          isHandledRef.current = true;
          setError(res.error || "Gagal mendapatkan status job");
          stop();
          return;
        }

        setJob(res.data);

        if (res.data.status === "done") {
          isHandledRef.current = true;
          stop();
          onDoneRef.current?.(res.data);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("SmartDoc — Selesai!", { body: "Proses dokumen berhasil diselesaikan." });
            } catch {
              // Ignore notification permission error
            }
          }
          return;
        }

        if (res.data.status === "failed") {
          isHandledRef.current = true;
          stop();
          setError(res.data.error || "Proses gagal");
          onFailedRef.current?.(res.data);
          return;
        }

        // Exponential backoff: gandakan interval setiap polling hingga maxIntervalMs
        // Contoh: 1000 → 2000 → 4000 → 8000 → 10000ms (cap)
        const nextInterval = Math.min(
          currentIntervalRef.current * backoffFactor,
          maxIntervalMs
        );
        currentIntervalRef.current = nextInterval;
        setCurrentIntervalMs(nextInterval);

        // Jadwalkan poll berikutnya secara sequential setelah response diterima
        if (isMounted && !isHandledRef.current) {
          pollTimeoutRef.current = setTimeout(poll, nextInterval);
        }
      } catch {
        if (isMounted && !isHandledRef.current) {
          isHandledRef.current = true;
          setError("Gagal terhubung ke server");
          stop();
        }
      }
    };

    poll();

    return () => {
      isMounted = false;
      stop();
    };
  }, [jobId, intervalMs, maxIntervalMs, backoffFactor, stop]);

  return { job, isPolling, error, elapsedSeconds, currentIntervalMs, stop };
}
