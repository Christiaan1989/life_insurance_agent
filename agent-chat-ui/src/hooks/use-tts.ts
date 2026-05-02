"use client";

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Module-level TTS singleton — shared across all components that import this.
//
// Audio queue, playback state, and enabled flag live here so that
// unmounting/remounting views doesn't lose state.
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

let currentAudio: HTMLAudioElement | null = null;
let isSpeaking = false;
let isEnabled = false;
let initialized = false;
let generation = 0; // cancel token — incremented on stop/new session

// Progressive streaming state
let audioQueue: Promise<string | null>[] = [];
let queueIndex = 0;
let queueDraining = false;
let streamingDone = false;
let queueWakeup: (() => void) | null = null;

function init() {
  if (initialized || typeof window === "undefined") return;
  // Default to ON so the demo auto-greets; stored as "tts-enabled"
  isEnabled = localStorage.getItem("tts-enabled") !== "false";
  initialized = true;
}

function notify() {
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// Audio fetch helper
// ---------------------------------------------------------------------------

async function fetchTTSAudio(text: string): Promise<string | null> {
  try {
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "nova" }),
    });

    if (!resp.ok) {
      console.warn(`TTS skipped (${resp.status})`);
      return null;
    }

    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Playback queue — drains audio promises in order, waits for more if needed
// ---------------------------------------------------------------------------

async function drainQueue(myGen: number): Promise<void> {
  if (queueDraining) return;
  queueDraining = true;

  while (myGen === generation) {
    if (queueIndex < audioQueue.length) {
      try {
        const url = await audioQueue[queueIndex];

        if (!url) {
          // TTS fetch failed silently — skip this segment
          queueIndex++;
          continue;
        }

        if (myGen !== generation) {
          URL.revokeObjectURL(url);
          break;
        }

        const audio = new Audio(url);
        currentAudio = audio;

        await new Promise<void>((resolve) => {
          const cleanup = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onended = cleanup;
          audio.onerror = cleanup;
          audio.play().catch(cleanup);
        });
      } catch (e) {
        console.error("TTS queue error:", e);
      }
      queueIndex++;
    } else if (streamingDone) {
      // No more sentences coming — we're done
      break;
    } else {
      // Wait for ttsFeedSentence() or ttsEndStreaming() to wake us
      await new Promise<void>((resolve) => {
        queueWakeup = resolve;
      });
    }
  }

  queueDraining = false;
  if (myGen === generation) {
    currentAudio = null;
    isSpeaking = false;
    notify();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Begin a progressive TTS session.
 * Feed sentences with ttsFeedSentence() as they become available.
 * Call ttsEndStreaming() when the response is complete.
 */
export function ttsBeginStreaming(): void {
  init();
  if (!isEnabled) return;
  ttsStop();

  generation++;
  audioQueue = [];
  queueIndex = 0;
  streamingDone = false;
  queueWakeup = null;
  isSpeaking = true;
  notify();
}

/**
 * Feed a completed sentence for immediate TTS processing.
 * Audio fetch starts right away; playback proceeds in order.
 */
export function ttsFeedSentence(sentence: string): void {
  if (!isEnabled || !sentence.trim()) return;

  // Start fetching immediately — don't wait for playback to catch up
  audioQueue.push(fetchTTSAudio(sentence));

  // Wake the drain loop if it's waiting for more sentences
  if (queueWakeup) {
    const wake = queueWakeup;
    queueWakeup = null;
    wake();
  }

  // Start drain loop if not already running
  if (!queueDraining) {
    drainQueue(generation);
  }
}

/**
 * Signal that no more sentences will be fed.
 * Playback continues until the queue is fully drained.
 */
export function ttsEndStreaming(): void {
  streamingDone = true;
  // Wake drain loop so it can exit after finishing current queue
  if (queueWakeup) {
    const wake = queueWakeup;
    queueWakeup = null;
    wake();
  }
}

/**
 * One-shot speak (for greetings, etc).
 * Internally uses the progressive API — splits into sentences,
 * fetches all in parallel, plays sequentially.
 */
export async function ttsSpeak(text: string): Promise<void> {
  init();
  if (!isEnabled || !text.trim()) return;

  ttsBeginStreaming();
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [text];
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed) ttsFeedSentence(trimmed);
  }
  ttsEndStreaming();
}

/** Stop any currently playing audio and cancel pending requests. */
export function ttsStop(): void {
  generation++;
  streamingDone = true;

  // Wake drain loop so it exits
  if (queueWakeup) {
    const wake = queueWakeup;
    queueWakeup = null;
    wake();
  }

  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    if (audio.src.startsWith("blob:")) {
      URL.revokeObjectURL(audio.src);
    }
  }

  audioQueue = [];
  queueIndex = 0;
  isSpeaking = false;
  notify();
}

/** Toggle TTS enabled / disabled. Stops playback when disabling. */
export function ttsToggle(): void {
  init();
  isEnabled = !isEnabled;
  localStorage.setItem("tts-enabled", String(isEnabled));
  if (!isEnabled) ttsStop();
  notify();
}

/** Check if TTS is currently enabled. */
export function ttsIsEnabled(): boolean {
  init();
  return isEnabled;
}

// ---------------------------------------------------------------------------
// React hook — provides reactive state for UI components
// ---------------------------------------------------------------------------

export function useTTS() {
  const [, rerender] = useState(0);

  useEffect(() => {
    init();
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    // Trigger an initial render so state is in sync
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    enabled: isEnabled,
    speaking: isSpeaking,
    speak: ttsSpeak,
    stop: ttsStop,
    toggle: ttsToggle,
  };
}
