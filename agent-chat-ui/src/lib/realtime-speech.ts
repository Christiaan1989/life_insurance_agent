"use client";

import { logVoiceDebug } from "@/lib/voice-debug";

type PendingSpeech = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: number;
  responseId: string | null;
  responseDoneTimer: number | null;
};

let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let audioElement: HTMLAudioElement | null = null;
let connectPromise: Promise<boolean> | null = null;
let pendingSpeech: PendingSpeech | null = null;

function clearPendingTimers(pending: PendingSpeech) {
  window.clearTimeout(pending.timer);
  if (pending.responseDoneTimer !== null) {
    window.clearTimeout(pending.responseDoneTimer);
  }
}

function finishPendingSpeech() {
  if (!pendingSpeech) return;
  const pending = pendingSpeech;
  pendingSpeech = null;
  clearPendingTimers(pending);
  pending.resolve();
}

function failPendingSpeech(error: Error) {
  if (!pendingSpeech) return;
  const pending = pendingSpeech;
  pendingSpeech = null;
  clearPendingTimers(pending);
  pending.reject(error);
}

function isBenignCancellationError(event: Record<string, any>) {
  const message = String(event.error?.message ?? "").toLowerCase();
  return (
    message.includes("cancellation failed") ||
    message.includes("no active response")
  );
}

function eventMatchesPendingResponse(event: Record<string, any>) {
  if (!pendingSpeech) return false;
  const eventResponseId =
    typeof event.response_id === "string"
      ? event.response_id
      : typeof event.response?.id === "string"
        ? event.response.id
        : null;

  return (
    !pendingSpeech.responseId ||
    !eventResponseId ||
    pendingSpeech.responseId === eventResponseId
  );
}

function realtimeVoiceDisabled() {
  return process.env.NEXT_PUBLIC_ENABLE_REALTIME_VOICE === "false";
}

function cleanupConnection() {
  logVoiceDebug("speech", "cleanup-connection");
  finishPendingSpeech();

  try {
    dataChannel?.close();
  } catch {
    // no-op
  }
  dataChannel = null;

  try {
    peerConnection?.close();
  } catch {
    // no-op
  }
  peerConnection = null;

  if (audioElement) {
    audioElement.pause();
    audioElement.srcObject = null;
    audioElement.remove();
    audioElement = null;
  }

  connectPromise = null;
}

function sendRealtimeEvent(event: Record<string, unknown>) {
  if (!dataChannel || dataChannel.readyState !== "open") {
    throw new Error("Realtime voice channel is not connected");
  }
  dataChannel.send(JSON.stringify(event));
}

async function waitForChannelOpen(channel: RTCDataChannel) {
  if (channel.readyState === "open") return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Realtime voice connection timed out"));
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
      reject(new Error("Realtime voice channel failed to open"));
    };

    channel.addEventListener("open", onOpen);
    channel.addEventListener("error", onError);
  });
}

async function connectRealtimeSpeech(): Promise<boolean> {
  if (typeof window === "undefined" || realtimeVoiceDisabled()) return false;
  if (dataChannel?.readyState === "open" && peerConnection) return true;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      cleanupConnection();

      const pc = new RTCPeerConnection();
      peerConnection = pc;

      audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.style.display = "none";
      document.body.appendChild(audioElement);

      pc.ontrack = (event) => {
        logVoiceDebug("speech", "remote-audio-track");
        if (!audioElement) return;
        audioElement.srcObject = event.streams[0] ?? null;
        audioElement.play().catch(() => {
          // Browsers may require the initial user gesture; the next ttsSpeak
          // call is normally triggered by one.
        });
      };

      pc.addTransceiver("audio", { direction: "recvonly" });

      const channel = pc.createDataChannel("oai-events");
      dataChannel = channel;

      channel.addEventListener("message", (message) => {
        try {
          const event = JSON.parse(message.data) as Record<string, any>;
          logVoiceDebug("speech", String(event.type ?? "unknown-event"), event);

          if (
            event.type === "response.created" &&
            pendingSpeech &&
            typeof event.response?.id === "string"
          ) {
            pendingSpeech.responseId = event.response.id;
          }

          if (!eventMatchesPendingResponse(event)) return;

          if (event.type === "output_audio_buffer.stopped") {
            finishPendingSpeech();
            return;
          }

          if (event.type === "output_audio_buffer.cleared") {
            finishPendingSpeech();
            return;
          }

          if (event.type === "response.done") {
            const status = event.response?.status;
            if (status === "failed" || status === "incomplete") {
              failPendingSpeech(
                new Error(
                  event.response?.status_details?.error?.message ??
                    event.response?.status_details?.reason ??
                    `Realtime voice response ${status}`,
                ),
              );
              return;
            }

            // WebRTC emits output_audio_buffer.stopped after response.done
            // when the server-side audio buffer has drained. Keep this as a
            // fallback in case a browser/API variant omits that event.
            if (pendingSpeech && pendingSpeech.responseDoneTimer === null) {
              pendingSpeech.responseDoneTimer = window.setTimeout(
                finishPendingSpeech,
                1500,
              );
            }
            return;
          }

          if (event.type === "error") {
            if (isBenignCancellationError(event)) return;
            failPendingSpeech(
              new Error(event.error?.message ?? "Realtime voice error"),
            );
          }
        } catch {
          // Ignore malformed diagnostic events.
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      logVoiceDebug("speech", "offer-created");

      const response = await fetch("/api/realtime/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });

      const answer = await response.text();
      if (!response.ok) {
        throw new Error(answer || `Realtime voice failed (${response.status})`);
      }

      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      await waitForChannelOpen(channel);
      logVoiceDebug("speech", "channel-open");
      return true;
    } catch (error) {
      logVoiceDebug("speech", "connect-error", {
        message: error instanceof Error ? error.message : String(error),
      });
      console.warn("Realtime voice unavailable, falling back to TTS:", error);
      cleanupConnection();
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function realtimeSpeak(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const connected = await connectRealtimeSpeech();
  if (!connected) return false;

  if (pendingSpeech) {
    if (pendingSpeech.responseId) {
      logVoiceDebug("speech", "cancel-active-response", {
        responseId: pendingSpeech.responseId,
      });
      sendRealtimeEvent({ type: "response.cancel" });
    }
    finishPendingSpeech();
  }

  // The audio element may have been paused by realtimeStopSpeaking().
  // Resume it before sending the new response so the incoming audio is heard.
  if (audioElement?.paused) {
    audioElement.play().catch(() => {});
  }

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pendingSpeech) {
        clearPendingTimers(pendingSpeech);
        pendingSpeech = null;
      }
      reject(new Error("Realtime voice response timed out"));
    }, Math.max(12_000, trimmed.length * 120));

    pendingSpeech = {
      resolve,
      reject,
      timer,
      responseId: null,
      responseDoneTimer: null,
    };

    logVoiceDebug("speech", "response-create", { text: trimmed });
    sendRealtimeEvent({
      type: "response.create",
      response: {
        conversation: "none",
        output_modalities: ["audio"],
        instructions: `Speak in English only. Never switch languages. Speak exactly this text. Do not add, remove, rephrase, or answer anything else:\n\n${trimmed}`,
      },
    });
  });

  return true;
}

export function realtimeStopSpeaking() {
  if (dataChannel?.readyState === "open" && pendingSpeech) {
    try {
      logVoiceDebug("speech", "stop-speaking", {
        responseId: pendingSpeech.responseId,
      });
      if (pendingSpeech.responseId) {
        sendRealtimeEvent({ type: "response.cancel" });
      }
      sendRealtimeEvent({ type: "output_audio_buffer.clear" });
    } catch {
      // no-op
    }
  }

  if (pendingSpeech) {
    finishPendingSpeech();
  }

  if (audioElement) {
    try {
      audioElement.pause();
      audioElement.currentTime = 0;
    } catch {
      // Live WebRTC streams do not always support seeking.
    }
  }
}

export function disconnectRealtimeSpeech() {
  cleanupConnection();
}
