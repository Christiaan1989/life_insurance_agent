"use client";

type VoiceDebugEntry = {
  ts: string;
  source: string;
  event: string;
  data?: unknown;
};

declare global {
  interface Window {
    __sentinelVoiceLogs?: VoiceDebugEntry[];
    downloadSentinelVoiceLogs?: () => void;
  }
}

const MAX_LOGS = 500;

function ensureVoiceDebugHelpers() {
  if (typeof window === "undefined") return;

  if (!window.__sentinelVoiceLogs) {
    window.__sentinelVoiceLogs = [];
  }

  if (!window.downloadSentinelVoiceLogs) {
    window.downloadSentinelVoiceLogs = () => {
      const logs = window.__sentinelVoiceLogs ?? [];
      const blob = new Blob([JSON.stringify(logs, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sentinel-voice-logs-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };
  }
}

export function logVoiceDebug(source: string, event: string, data?: unknown) {
  if (typeof window === "undefined") return;
  ensureVoiceDebugHelpers();

  const entry = {
    ts: new Date().toISOString(),
    source,
    event,
    data,
  };

  const logs = window.__sentinelVoiceLogs!;
  logs.push(entry);

  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  // Keep a low-friction trail in DevTools as well as the downloadable buffer.
  // This is intentionally compact because Realtime emits a lot of events.
  console.debug(`[sentinel-voice:${source}] ${event}`, data ?? "");
}
