"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logVoiceDebug } from "@/lib/voice-debug";

type RecorderState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "recording"; startedAt: number }
  | { status: "processing" };

/**
 * Microphone access requires a secure context. Browsers only expose
 * `navigator.mediaDevices` on https:// or on localhost/127.0.0.1. When the app
 * is opened over plain http on a LAN IP (e.g. http://192.168.x.x:3000),
 * `navigator.mediaDevices` is `undefined` and reading `.getUserMedia` throws
 * "Cannot read properties of undefined (reading 'getUserMedia')".
 * Surface an actionable message instead of that cryptic error.
 */
function assertMicrophoneAvailable() {
  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    return;
  }

  const host =
    typeof window !== "undefined" ? window.location.hostname : "";
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (!isLocal) {
    throw new Error(
      "Microphone needs a secure connection. Open the app via https:// or http://localhost instead of an IP address.",
    );
  }

  throw new Error(
    "Microphone is not available in this browser. Try a recent version of Chrome, Edge, or Safari.",
  );
}

export function useVoiceRecorder(options?: {
  mimeType?: string;
  onTranscript?: (text: string) => void;
  autoStopOnSilenceMs?: number | false;
}) {
  const mimeType = options?.mimeType ?? "audio/webm";
  const autoStopOnSilenceMs =
    options?.autoStopOnSilenceMs === false
      ? 0
      : options?.autoStopOnSilenceMs ?? 1600;
  // Keep a ref so the onstop closure always calls the latest callback
  // without needing options in the startRecording dependency array.
  const onTranscriptRef = useRef(options?.onTranscript);
  onTranscriptRef.current = options?.onTranscript;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const realtimeRef = useRef<{
    peerConnection: RTCPeerConnection;
    dataChannel: RTCDataChannel;
    stream: MediaStream;
  } | null>(null);
  const latestRealtimeTranscriptRef = useRef("");
  const realtimeTranscriptPartsRef = useRef<Map<string, string>>(new Map());
  const realtimeFinishedRef = useRef(false);
  const autoStopTimerRef = useRef<number | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
  const stopRequestedRef = useRef(false);
  const commitWaiterRef = useRef<{
    resolve: (text: string) => void;
    reject: (error: Error) => void;
    timer: number;
  } | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);

  const isRecording = state.status === "recording";
  const isBusy = state.status === "requesting" || state.status === "processing";

  const getRealtimeTranscript = useCallback(() => {
    const completed = Array.from(realtimeTranscriptPartsRef.current.values())
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");

    return (completed || latestRealtimeTranscriptRef.current).trim();
  }, []);

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const scheduleAutoStop = useCallback(() => {
    if (!autoStopOnSilenceMs) return;
    clearAutoStopTimer();
    autoStopTimerRef.current = window.setTimeout(() => {
      autoStopTimerRef.current = null;
      stopRecordingRef.current();
    }, autoStopOnSilenceMs);
  }, [autoStopOnSilenceMs, clearAutoStopTimer]);

  const clearCommitWaiter = useCallback(() => {
    if (!commitWaiterRef.current) return;
    window.clearTimeout(commitWaiterRef.current.timer);
    commitWaiterRef.current = null;
  }, []);

  const resolveCommitWaiter = useCallback(
    (text?: string) => {
      if (!commitWaiterRef.current) return;
      const waiter = commitWaiterRef.current;
      commitWaiterRef.current = null;
      window.clearTimeout(waiter.timer);
      waiter.resolve((text ?? getRealtimeTranscript()).trim());
    },
    [getRealtimeTranscript],
  );

  const rejectCommitWaiter = useCallback((error: Error) => {
    if (!commitWaiterRef.current) return;
    const waiter = commitWaiterRef.current;
    commitWaiterRef.current = null;
    window.clearTimeout(waiter.timer);
    waiter.reject(error);
  }, []);

  const cleanupRealtime = useCallback(() => {
    logVoiceDebug("recorder", "cleanup-realtime");
    clearAutoStopTimer();
    clearCommitWaiter();
    const session = realtimeRef.current;
    realtimeRef.current = null;
    latestRealtimeTranscriptRef.current = "";
    realtimeTranscriptPartsRef.current.clear();
    stopRequestedRef.current = false;

    if (!session) return;

    try {
      session.dataChannel.close();
    } catch {
      // no-op
    }
    try {
      session.peerConnection.close();
    } catch {
      // no-op
    }
    try {
      session.stream.getTracks().forEach((track) => track.stop());
    } catch {
      // no-op
    }
  }, [clearAutoStopTimer, clearCommitWaiter]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      } catch {
        // no-op
      }
      mediaRecorderRef.current = null;
      cleanupRealtime();
    };
  }, [cleanupRealtime]);

  const finishRealtimeTranscript = useCallback(
    (text: string) => {
      if (realtimeFinishedRef.current) return;
      realtimeFinishedRef.current = true;

      const trimmed = text.trim();
      logVoiceDebug("recorder", "final-transcript", { text: trimmed });
      if (trimmed) onTranscriptRef.current?.(trimmed);

      clearAutoStopTimer();
      cleanupRealtime();
      setState({ status: "idle" });
    },
    [cleanupRealtime, clearAutoStopTimer],
  );

  const waitForChannelOpen = useCallback(async (channel: RTCDataChannel) => {
    if (channel.readyState === "open") return;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Realtime transcription connection timed out"));
      }, 10_000);

      const cleanup = () => {
        window.clearTimeout(timer);
        channel.removeEventListener("open", onOpen);
        channel.removeEventListener("error", onError);
      };

      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Realtime transcription channel failed to open"));
      };

      channel.addEventListener("open", onOpen);
      channel.addEventListener("error", onError);
    });
  }, []);

  const stopRecording = useCallback(async () => {
    const realtime = realtimeRef.current;
    if (realtime) {
      logVoiceDebug("recorder", "stop-recording-realtime");
      clearAutoStopTimer();
      setState({ status: "processing" });
      stopRequestedRef.current = true;

      let finalText = getRealtimeTranscript();

      if (realtime.dataChannel.readyState === "open") {
        try {
          finalText = await new Promise<string>((resolve, reject) => {
            const timer = window.setTimeout(() => {
              commitWaiterRef.current = null;
              resolve(getRealtimeTranscript());
            }, 2500);

            commitWaiterRef.current = { resolve, reject, timer };
            logVoiceDebug("recorder", "input-audio-buffer-commit");
            realtime.dataChannel.send(
              JSON.stringify({ type: "input_audio_buffer.commit" }),
            );
          });
        } catch (error) {
          logVoiceDebug("recorder", "commit-error", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (finalText) {
        finishRealtimeTranscript(finalText);
        return;
      }

      cleanupRealtime();
      setState({ status: "idle" });
      return;
    }

    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    logVoiceDebug("recorder", "stop-recording-legacy");
    clearAutoStopTimer();
    setState({ status: "processing" });
    rec.stop();
  }, [
    cleanupRealtime,
    clearAutoStopTimer,
    finishRealtimeTranscript,
    getRealtimeTranscript,
  ]);

  useEffect(() => {
    stopRecordingRef.current = () => {
      void stopRecording();
    };
  }, [stopRecording]);

  const startLegacyRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      logVoiceDebug("recorder", "legacy-recording-started");
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      clearAutoStopTimer();

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
          logVoiceDebug("recorder", "legacy-transcript", { text: data.text ?? "" });
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
  }, [clearAutoStopTimer, mimeType]);

  const startRealtimeRecording = useCallback(async () => {
    if (
      process.env.NEXT_PUBLIC_ENABLE_REALTIME_VOICE === "false" ||
      typeof RTCPeerConnection === "undefined"
    ) {
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    logVoiceDebug("recorder", "realtime-recording-started");
    const peerConnection = new RTCPeerConnection();
    const dataChannel = peerConnection.createDataChannel("oai-events");

    realtimeTranscriptPartsRef.current.clear();
    latestRealtimeTranscriptRef.current = "";
    realtimeFinishedRef.current = false;
    stopRequestedRef.current = false;
    clearAutoStopTimer();

    dataChannel.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(message.data);
        logVoiceDebug("recorder", String(event.type ?? "unknown-event"), event);

        if (event.type === "input_audio_buffer.speech_started") {
          clearAutoStopTimer();
        }

        if (event.type === "input_audio_buffer.committed") {
          logVoiceDebug("recorder", "input-audio-buffer-committed", event);
        }

        if (
          event.type === "conversation.item.input_audio_transcription.delta" &&
          typeof event.delta === "string"
        ) {
          clearAutoStopTimer();
          const itemId = String(event.item_id ?? "current");
          const next =
            (realtimeTranscriptPartsRef.current.get(itemId) ?? "") +
            event.delta;
          realtimeTranscriptPartsRef.current.set(itemId, next);
          latestRealtimeTranscriptRef.current = next;
        }

        if (
          event.type ===
            "conversation.item.input_audio_transcription.completed" &&
          typeof event.transcript === "string"
        ) {
          const itemId = String(
            event.item_id ??
              event.item?.id ??
              `segment-${realtimeTranscriptPartsRef.current.size}`,
          );
          realtimeTranscriptPartsRef.current.set(itemId, event.transcript);
          latestRealtimeTranscriptRef.current = getRealtimeTranscript();
          if (stopRequestedRef.current) {
            resolveCommitWaiter(latestRealtimeTranscriptRef.current);
            return;
          }
          scheduleAutoStop();
        }

        if (
          event.type ===
          "conversation.item.input_audio_transcription.failed"
        ) {
          const message =
            event.error?.message ?? "Realtime transcription failed";
          if (stopRequestedRef.current) {
            rejectCommitWaiter(new Error(message));
            return;
          }
          throw new Error(message);
        }

        if (event.type === "error") {
          const message =
            event.error?.message ?? "Realtime transcription error";
          if (stopRequestedRef.current) {
            resolveCommitWaiter();
            return;
          }
          throw new Error(
            message,
          );
        }
      } catch (err: any) {
        setError(err?.message ?? "Realtime transcription error");
        cleanupRealtime();
        setState({ status: "idle" });
      }
    });

    dataChannel.addEventListener("error", () => {
      setError("Realtime transcription channel failed");
      cleanupRealtime();
      setState({ status: "idle" });
    });

    for (const track of stream.getTracks()) {
      peerConnection.addTrack(track, stream);
    }

    realtimeRef.current = { peerConnection, dataChannel, stream };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const response = await fetch("/api/realtime/transcription", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
      },
      body: offer.sdp ?? "",
    });

    const answer = await response.text();
    if (!response.ok) {
      throw new Error(answer || `Realtime transcription failed (${response.status})`);
    }

    await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
    await waitForChannelOpen(dataChannel);
    setState({ status: "recording", startedAt: Date.now() });
    return true;
  }, [
    cleanupRealtime,
    clearAutoStopTimer,
    getRealtimeTranscript,
    rejectCommitWaiter,
    resolveCommitWaiter,
    scheduleAutoStop,
    waitForChannelOpen,
  ]);

  const startRecording = useCallback(async () => {
    setError(null);
    clearAutoStopTimer();

    try {
      assertMicrophoneAvailable();
    } catch (err: any) {
      setError(err?.message ?? "Microphone is not available");
      setState({ status: "idle" });
      return;
    }

    setState({ status: "requesting" });

    try {
      const startedRealtime = await startRealtimeRecording();
      if (startedRealtime) return;
    } catch (err) {
      logVoiceDebug("recorder", "realtime-fallback-to-whisper", {
        message: err instanceof Error ? err.message : String(err),
      });
      console.warn("Realtime transcription unavailable, falling back to Whisper:", err);
      cleanupRealtime();
    }

    await startLegacyRecording();
  }, [cleanupRealtime, clearAutoStopTimer, startLegacyRecording, startRealtimeRecording]);

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
