"use client";

import { useRef, useEffect } from "react";
import { useStreamContext } from "@/providers/Stream";
import {
  useTTS,
  ttsStop,
  ttsBeginStreaming,
  ttsFeedSentence,
  ttsEndStreaming,
  ttsSpeak,
} from "@/hooks/use-tts";

const spokenAiMessageIds = new Set<string>();

function extractAIText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: Record<string, unknown>) => b.type === "text")
      .map((b: Record<string, unknown>) => b.text as string)
      .join(" ");
  }
  return "";
}

/**
 * Orchestrates TTS playback of AI messages across view transitions.
 *
 * Must be called from a component that stays mounted for the entire
 * session (e.g. ViewRouter). This prevents view transitions from
 * interrupting or losing track of which messages have been spoken.
 */
export function useTTSOrchestrator() {
  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;

  const { enabled: ttsEnabled, speaking: ttsSpeaking } = useTTS();
  const prevIsLoadingRef = useRef(false);
  const oldAiIdsRef = useRef<Set<string>>(new Set());
  const ttsMsgIdRef = useRef<string | null>(null);
  const spokenLengthRef = useRef(0);
  const spokenPrefixRef = useRef("");
  const streamingTTSRef = useRef(false);

  // Progressive TTS: speak AI sentences as they stream in
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    if (isLoading && !wasLoading) {
      ttsStop();
      const existingIds = new Set<string>();
      for (const m of messages) {
        if (m.type === "ai" && m.id) existingIds.add(m.id);
      }
      oldAiIdsRef.current = existingIds;
      ttsMsgIdRef.current = null;
      spokenLengthRef.current = 0;
      spokenPrefixRef.current = "";
      streamingTTSRef.current = false;
    }

    if (isLoading && ttsEnabled) {
      const lastNewAI = [...messages]
        .reverse()
        .find((m) => m.type === "ai" && m.id && !oldAiIdsRef.current.has(m.id));

      if (lastNewAI) {
        const msgId = lastNewAI.id ?? null;
        if (msgId !== ttsMsgIdRef.current) {
          ttsMsgIdRef.current = msgId;
          spokenLengthRef.current = 0;
          spokenPrefixRef.current = "";
        }

        const fullText = extractAIText(lastNewAI.content);

        if (spokenLengthRef.current > fullText.length) {
          spokenLengthRef.current = fullText.length;
          spokenPrefixRef.current = fullText;
          return;
        }

        if (spokenPrefixRef.current.length > 0) {
          const currentPrefix = fullText.slice(0, spokenLengthRef.current);
          if (currentPrefix !== spokenPrefixRef.current) {
            spokenLengthRef.current = fullText.length;
            spokenPrefixRef.current = fullText;
            return;
          }
        }

        let cursor = spokenLengthRef.current;
        let fed = false;

        while (cursor < fullText.length) {
          let boundary = -1;
          for (let i = cursor; i < fullText.length; i++) {
            const ch = fullText[i];
            if (ch === "." || ch === "!" || ch === "?") {
              const next = fullText[i + 1];
              if (
                next === undefined ||
                next === " " ||
                next === "\n" ||
                next === "\r"
              ) {
                boundary = i + 1;
                break;
              }
            }
          }

          if (boundary === -1) break;

          const sentence = fullText.slice(cursor, boundary).trim();
          if (sentence) {
            if (!streamingTTSRef.current) {
              ttsBeginStreaming();
              streamingTTSRef.current = true;
            }
            ttsFeedSentence(sentence);
            fed = true;
          }
          cursor = boundary;
          while (
            cursor < fullText.length &&
            (fullText[cursor] === " " || fullText[cursor] === "\n")
          ) {
            cursor++;
          }
        }

        if (fed) {
          spokenLengthRef.current = cursor;
          spokenPrefixRef.current = fullText.slice(0, cursor);
        }
      }
    }

    if (wasLoading && !isLoading) {
      const lastNewAI = [...messages]
        .reverse()
        .find((m) => m.type === "ai" && m.id && !oldAiIdsRef.current.has(m.id));

      if (streamingTTSRef.current) {
        if (lastNewAI) {
          const fullText = extractAIText(lastNewAI.content);
          const remaining = fullText.slice(spokenLengthRef.current).trim();
          if (remaining) ttsFeedSentence(remaining);
          if (lastNewAI.id) spokenAiMessageIds.add(lastNewAI.id);
        }
        ttsEndStreaming();
      } else if (ttsEnabled) {
        if (
          lastNewAI &&
          lastNewAI.id &&
          !spokenAiMessageIds.has(lastNewAI.id)
        ) {
          const text = extractAIText(lastNewAI.content);
          if (text.trim()) {
            spokenAiMessageIds.add(lastNewAI.id);
            ttsSpeak(text);
          }
        }
      }
      ttsMsgIdRef.current = null;
      spokenLengthRef.current = 0;
      spokenPrefixRef.current = "";
      streamingTTSRef.current = false;
    }
  }, [isLoading, messages, ttsEnabled]);

  // Catch-up: speak any AI message that was never spoken
  // (e.g. messages that arrived while TTS was busy, or on initial load)
  useEffect(() => {
    if (isLoading || !ttsEnabled || ttsSpeaking) return;

    const lastAi = [...messages]
      .reverse()
      .find((m) => m.type === "ai" && m.id);

    if (!lastAi?.id || spokenAiMessageIds.has(lastAi.id)) return;

    const text = extractAIText(lastAi.content);
    if (!text.trim()) return;

    spokenAiMessageIds.add(lastAi.id);
    ttsSpeak(text);
  }, [isLoading, messages, ttsEnabled, ttsSpeaking]);
}
