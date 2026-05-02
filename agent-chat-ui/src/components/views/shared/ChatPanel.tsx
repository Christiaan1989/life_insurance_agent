"use client";

import React, { ReactNode, useRef } from "react";
import { useStreamContext } from "@/providers/Stream";
import { Checkpoint } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "@/components/thread/messages/ai";
import { HumanMessage } from "@/components/thread/messages/human";
import { DO_NOT_RENDER_ID_PREFIX } from "@/lib/ensure-tool-responses";
import { VOICE_NAV_PREFIX } from "./VoiceNav";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTTS,
  ttsStop,
  ttsBeginStreaming,
  ttsFeedSentence,
  ttsEndStreaming,
  ttsSpeak,
} from "@/hooks/use-tts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the message is a voice-navigation command that should
 * be hidden from the chat display. Checks human messages whose text
 * content starts with the [VOICE_NAV] prefix.
 */
function isVoiceNavMessage(message: { type: string; content: unknown }): boolean {
  if (message.type !== "human") return false;
  const content = message.content;
  if (typeof content === "string") return content.startsWith(VOICE_NAV_PREFIX);
  if (Array.isArray(content)) {
    const firstText = content.find(
      (b: Record<string, unknown>) => b.type === "text",
    ) as { text?: string } | undefined;
    return firstText?.text?.startsWith(VOICE_NAV_PREFIX) ?? false;
  }
  return false;
}

/**
 * Extract plain text from an AI message's content field.
 * Skips tool_call blocks — only returns conversational text.
 */
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StickyToBottomContent(props: {
  content: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div ref={context.contentRef} className={props.contentClassName}>
        {props.content}
      </div>
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="h-4 w-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  /** Optional footer element (e.g., input bar) rendered below messages */
  footer?: ReactNode;
  /** Extra classes for the outer wrapper */
  className?: string;
  /** Extra classes for the scroll content area */
  contentClassName?: string;
}

/**
 * Shared scrollable message list component.
 * Renders all messages from the stream and sticks to the bottom.
 * Automatically speaks new AI messages via TTS when enabled.
 */
export function ChatPanel({ footer, className, contentClassName }: ChatPanelProps) {
  const stream = useStreamContext();
  const messages = stream.messages;
  const isLoading = stream.isLoading;

  const prevMessageLength = useRef(0);
  const [firstTokenReceived, setFirstTokenReceived] = React.useState(false);

  // TTS integration — progressive: speaks sentences as they stream in
  const { enabled: ttsEnabled } = useTTS();
  const prevIsLoadingRef = useRef(false);
  const oldAiIdsRef = useRef<Set<string>>(new Set()); // AI IDs present before loading
  const ttsMsgIdRef = useRef<string | null>(null); // AI message we're speaking
  const spokenLengthRef = useRef(0); // chars already sent to TTS
  const spokenPrefixRef = useRef(""); // actual text we've spoken — for prefix verification
  const streamingTTSRef = useRef(false);

  React.useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }
    prevMessageLength.current = messages.length;
  }, [messages]);

  // ── TTS: progressively speak AI sentences as they stream in ──
  React.useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    // When loading starts, stop any in-progress TTS and snapshot the
    // IDs of AI messages already present so we never re-read them.
    // NOTE: no early return — fall through so we can detect new AI text
    // on the very same render that loading starts (reduces latency).
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

    // While agent is streaming, detect complete clauses in NEW AI messages only
    if (isLoading && ttsEnabled) {
      // Find the last AI message whose ID was NOT present before loading started
      const lastNewAI = [...messages]
        .reverse()
        .find((m) => m.type === "ai" && m.id && !oldAiIdsRef.current.has(m.id));

      if (lastNewAI) {
        // If we switched to a different AI message, reset the cursor
        const msgId = lastNewAI.id ?? null;
        if (msgId !== ttsMsgIdRef.current) {
          ttsMsgIdRef.current = msgId;
          spokenLengthRef.current = 0;
          spokenPrefixRef.current = "";
        }

        const fullText = extractAIText(lastNewAI.content);

        // Safety: if cursor overshot (content replaced), clamp to end
        // and wait for the next render — never reset to 0 (that replays).
        if (spokenLengthRef.current > fullText.length) {
          spokenLengthRef.current = fullText.length;
          spokenPrefixRef.current = fullText;
          return;
        }

        // Prefix verification: ensure the text before our cursor still
        // matches what we've already spoken. If content was replaced or
        // reordered, skip this render to avoid repeats.
        if (spokenPrefixRef.current.length > 0) {
          const currentPrefix = fullText.slice(0, spokenLengthRef.current);
          if (currentPrefix !== spokenPrefixRef.current) {
            spokenLengthRef.current = fullText.length;
            spokenPrefixRef.current = fullText;
            return;
          }
        }

        // Scan forward from the cursor for sentence boundaries.
        // We work in absolute positions within fullText so the cursor
        // never drifts — no gaps, no double-counting.
        let cursor = spokenLengthRef.current;
        let fed = false;

        while (cursor < fullText.length) {
          // Look for sentence-ending punctuation (.!?) followed by
          // a space, newline, or end-of-string.
          let boundary = -1;
          for (let i = cursor; i < fullText.length; i++) {
            const ch = fullText[i];
            if (ch === "." || ch === "!" || ch === "?") {
              const next = fullText[i + 1];
              if (next === undefined || next === " " || next === "\n" || next === "\r") {
                boundary = i + 1; // include the punctuation
                break;
              }
            }
          }

          if (boundary === -1) break; // no complete sentence yet — wait for more tokens

          const sentence = fullText.slice(cursor, boundary).trim();
          if (sentence) {
            if (!streamingTTSRef.current) {
              ttsBeginStreaming();
              streamingTTSRef.current = true;
            }
            ttsFeedSentence(sentence);
            fed = true;
          }
          // Skip any whitespace after the boundary so the next
          // sentence starts cleanly (avoids leading spaces).
          cursor = boundary;
          while (cursor < fullText.length && (fullText[cursor] === " " || fullText[cursor] === "\n")) {
            cursor++;
          }
        }

        if (fed) {
          spokenLengthRef.current = cursor;
          spokenPrefixRef.current = fullText.slice(0, cursor);
        }
      }
    }

    // When agent finishes, feed any remaining text and close the stream
    if (wasLoading && !isLoading) {
      if (streamingTTSRef.current) {
        const lastNewAI = [...messages]
          .reverse()
          .find((m) => m.type === "ai" && m.id && !oldAiIdsRef.current.has(m.id));
        if (lastNewAI) {
          const fullText = extractAIText(lastNewAI.content);
          const remaining = fullText
            .slice(spokenLengthRef.current)
            .trim();
          if (remaining) ttsFeedSentence(remaining);
        }
        ttsEndStreaming();
      } else if (ttsEnabled) {
        // Fallback: speak full new response if progressive detection missed it
        const lastNewAI = [...messages]
          .reverse()
          .find((m) => m.type === "ai" && m.id && !oldAiIdsRef.current.has(m.id));
        if (lastNewAI) {
          const text = extractAIText(lastNewAI.content);
          if (text.trim()) ttsSpeak(text);
        }
      }
      ttsMsgIdRef.current = null;
      spokenLengthRef.current = 0;
      spokenPrefixRef.current = "";
      streamingTTSRef.current = false;
    }
  }, [isLoading, messages, ttsEnabled]);

  // Stop TTS when this panel unmounts (e.g., view transition)
  React.useEffect(() => {
    return () => {
      ttsStop();
    };
  }, []);

  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  const handleRegenerate = (parentCheckpoint: Checkpoint | null | undefined) => {
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ["values"],
      streamSubgraphs: true,
      streamResumable: true,
    });
  };

  return (
    <div className={cn("relative flex flex-1 flex-col overflow-hidden", className)}>
      {/* Scrollable messages area */}
      <StickToBottom className="relative flex-1 overflow-hidden">
        <StickyToBottomContent
          className="absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent"
          contentClassName={cn(
            "pt-8 pb-4 max-w-3xl mx-auto flex flex-col gap-4 w-full",
            contentClassName,
          )}
          content={
            <>
              {messages
                .filter(
                  (m) =>
                    !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX) &&
                    !isVoiceNavMessage(m),
                )
                .map((message, index) =>
                  message.type === "human" ? (
                    <HumanMessage
                      key={message.id || `${message.type}-${index}`}
                      message={message}
                      isLoading={isLoading}
                    />
                  ) : (
                    <AssistantMessage
                      key={message.id || `${message.type}-${index}`}
                      message={message}
                      isLoading={isLoading}
                      handleRegenerate={handleRegenerate}
                    />
                  ),
                )}
              {hasNoAIOrToolMessages && !!stream.interrupt && (
                <AssistantMessage
                  key="interrupt-msg"
                  message={undefined}
                  isLoading={isLoading}
                  handleRegenerate={handleRegenerate}
                />
              )}
              {isLoading && !firstTokenReceived && <AssistantMessageLoading />}
            </>
          }
        />

        {/* Scroll to bottom button — inside StickToBottom context */}
        <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-2 left-1/2 z-10 -translate-x-1/2" />
      </StickToBottom>

      {/* Footer (input bar) — OUTSIDE the scroll area so messages never go under it */}
      {footer && (
        <div className="relative z-10 shrink-0">
          {/* Gradient fade — creates smooth visual transition from messages to input */}
          <div className="pointer-events-none absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-[#030303] to-transparent" />
          {footer}
        </div>
      )}
    </div>
  );
}
