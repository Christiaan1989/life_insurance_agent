"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "recording"; startedAt: number }
  | { status: "processing" };

export function useVoiceRecorder(options?: {
  mimeType?: string;
  onTranscript?: (text: string) => void;
}) {
  const mimeType = options?.mimeType ?? "audio/webm";
  // Keep a ref so the onstop closure always calls the latest callback
  // without needing options in the startRecording dependency array.
  const onTranscriptRef = useRef(options?.onTranscript);
  onTranscriptRef.current = options?.onTranscript;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);

  const isRecording = state.status === "recording";
  const isBusy = state.status === "requesting" || state.status === "processing";

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      } catch {
        // no-op
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  const stopRecording = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setState({ status: "processing" });
    rec.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setState({ status: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const form = new FormData();
          form.set("file", blob, `audio.${mimeType.includes("webm") ? "webm" : "ogg"}`);

          const res = await fetch("/api/transcribe", { method: "POST", body: form });

          const data = await res.json().catch(() => ({})) as { text?: string; error?: string };
          if (!res.ok) {
            throw new Error(data?.error || `Transcription failed (${res.status})`);
          }

          onTranscriptRef.current?.(data.text ?? "");
        } catch (err: any) {
          setError(err?.message ?? "Failed to transcribe audio");
        } finally {
          try {
            rec.stream.getTracks().forEach((t) => t.stop());
          } catch {
            // no-op
          }
          mediaRecorderRef.current = null;
          setState({ status: "idle" });
        }
      };

      mediaRecorderRef.current = rec;
      rec.start();
      setState({ status: "recording", startedAt: Date.now() });
    } catch (e: any) {
      setError(
        e?.message?.includes("denied")
          ? "Microphone permission denied. Please allow mic access in your browser."
          : e?.message || "Unable to access microphone",
      );
      setState({ status: "idle" });
    }
  }, [mimeType]);

  const toggle = useCallback(() => {
    if (isRecording) return stopRecording();
    return startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (state.status !== "recording") {
      setElapsedMs(0);
      return;
    }

    const { startedAt } = state;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 100);

    return () => clearInterval(interval);
  }, [state]);

  return {
    state,
    isRecording,
    isBusy,
    error,
    startRecording,
    stopRecording,
    toggle,
    elapsedMs,
  } as const;
}
