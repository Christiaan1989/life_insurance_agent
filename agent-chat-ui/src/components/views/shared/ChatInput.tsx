"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Plus, Mic, Square } from "lucide-react";
import { useStreamContext } from "@/providers/Stream";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { ContentBlocksPreview } from "@/components/thread/ContentBlocksPreview";
import { fileToContentBlock } from "@/lib/multimodal-utils";
import { ensureToolCallsHaveResponses } from "@/lib/ensure-tool-responses";
import { Message } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { useQueryState, parseAsBoolean } from "nuqs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function VoiceControls({
  disabled,
  onTranscript,
}: {
  disabled?: boolean;
  onTranscript: (text: string) => void;
}) {
  const { toggle, isRecording, isBusy, elapsedMs, error } = useVoiceRecorder({
    onTranscript,
  });

  useEffect(() => {
    if (!error) return;
    toast.error("Voice input error", { description: error });
  }, [error]);

  const title = isRecording
    ? "Stop recording"
    : disabled
      ? "Voice disabled while assistant is responding"
      : "Click to start recording";

  return (
    <button
      type="button"
      aria-label="Voice input"
      title={title}
      disabled={disabled || isBusy}
      onClick={toggle}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-all",
        isRecording
          ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
          : "text-white/40 hover:text-white/70 hover:bg-white/5",
        (disabled || isBusy) && "opacity-40 cursor-not-allowed",
      )}
    >
      {isRecording ? (
        <>
          <Square className="h-4 w-4" />
          <span className="font-medium text-xs">Stop</span>
          <span className="ml-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            REC
          </span>
          <span className="ml-1 tabular-nums text-xs text-red-400">
            {formatMs(elapsedMs)}
          </span>
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}

interface ChatInputProps {
  /** Policy number to prepend on first message (optional) */
  policyNumber?: string;
  /** Callback when policy has been submitted (so caller can track it) */
  onPolicySubmitted?: () => void;
  /** Whether the policy has already been submitted in this thread */
  policySubmitted?: boolean;
  /** Extra classes for the outer wrapper */
  className?: string;
  /** Optional artifact context to include with messages */
  artifactContext?: Record<string, unknown>;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to show the file upload button */
  showFileUpload?: boolean;
  /** Whether to show the hide-tool-calls toggle */
  showToolCallsToggle?: boolean;
}

/**
 * Shared chat input bar with voice, file upload, and send functionality.
 * Styled for the dark futuristic theme.
 */
export function ChatInput({
  policyNumber,
  onPolicySubmitted,
  policySubmitted = false,
  className,
  artifactContext,
  placeholder = "Describe your incident or ask a question...",
  showFileUpload = true,
  showToolCallsToggle = false,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasSubmittedPolicy = useRef(policySubmitted);

  const [hideToolCalls, setHideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );

  const {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    dragOver,
    handlePaste,
  } = useFileUpload();

  const stream = useStreamContext();
  const isLoading = stream.isLoading;

  // Keep ref in sync with prop
  useEffect(() => {
    hasSubmittedPolicy.current = policySubmitted;
  }, [policySubmitted]);

  const submitMessage = (messageText: string, blocks: typeof contentBlocks = []) => {
    if ((messageText.trim().length === 0 && blocks.length === 0) || isLoading)
      return;

    let finalText = messageText;
    if (!hasSubmittedPolicy.current && policyNumber?.trim()) {
      finalText = `[Policy: ${policyNumber.trim()}] ${messageText}`;
      hasSubmittedPolicy.current = true;
      onPolicySubmitted?.();
    }

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(finalText.trim().length > 0
          ? [{ type: "text", text: finalText }]
          : []),
        ...blocks,
      ] as Message["content"],
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);

    const context =
      artifactContext && Object.keys(artifactContext).length > 0
        ? artifactContext
        : undefined;

    stream.submit(
      { messages: [...toolMessages, newHumanMessage], context },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          context,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      },
    );

    setInput("");
    setContentBlocks([]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitMessage(input, contentBlocks);
  };

  return (
    <div
      ref={dropRef}
      className={cn(
        "relative z-10 mx-auto w-full max-w-3xl rounded-2xl transition-all",
        "bg-white/[0.04] border border-white/[0.08]",
        "focus-within:border-[#C5961A]/30 focus-within:glow-gold-sm",
        dragOver && "border-[#C5961A]/50 border-dashed",
        className,
      )}
    >
      <form
        onSubmit={handleSubmit}
        className="grid grid-rows-[1fr_auto] gap-2"
      >
        <ContentBlocksPreview
          blocks={contentBlocks}
          onRemove={removeBlock}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.metaKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              const el = e.target as HTMLElement | undefined;
              const form = el?.closest("form");
              form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 text-white/90 shadow-none ring-0 outline-none placeholder:text-white/25 focus:ring-0 focus:outline-none"
        />

        <div className="flex items-center gap-3 p-2 pt-3">
          <VoiceControls
            disabled={isLoading}
            onTranscript={(text) => {
              if (!text) return;
              setInput((prev) =>
                prev ? prev + (prev.endsWith(" ") ? "" : " ") + text : text,
              );
              textareaRef.current?.focus();
            }}
          />

          {showToolCallsToggle && (
            <div className="flex items-center space-x-2">
              <Switch
                id="render-tool-calls"
                checked={hideToolCalls ?? false}
                onCheckedChange={setHideToolCalls}
              />
              <Label
                htmlFor="render-tool-calls"
                className="text-xs text-white/30"
              >
                Hide Tools
              </Label>
            </div>
          )}

          {showFileUpload && (
            <>
              <Label
                htmlFor="file-input-shared"
                className="flex cursor-pointer items-center gap-1.5 text-white/30 hover:text-white/50 transition-colors"
              >
                <Plus className="size-4" />
                <span className="text-xs">Upload</span>
              </Label>
              <input
                id="file-input-shared"
                type="file"
                onChange={handleFileUpload}
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                className="hidden"
              />
            </>
          )}

          {stream.isLoading ? (
            <Button
              key="stop"
              onClick={() => stream.stop()}
              className="ml-auto bg-white/10 text-white/70 hover:bg-white/15"
              size="sm"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              className="ml-auto bg-[#C5961A] text-black font-medium hover:bg-[#d4a520] shadow-md transition-all"
              size="sm"
              disabled={isLoading || (!input.trim() && contentBlocks.length === 0)}
            >
              Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Convenience: submit a message programmatically from outside the input.
 * Used by quick-action cards, etc.
 */
export function useSubmitMessage() {
  const stream = useStreamContext();

  return (messageText: string, files?: File[], policyNumber?: string) => {
    const doSubmit = async () => {
      let finalText = messageText;
      if (policyNumber?.trim()) {
        finalText = `[Policy: ${policyNumber.trim()}] ${messageText}`;
      }

      const blocks = files
        ? await Promise.all(files.map(fileToContentBlock))
        : [];

      const newHumanMessage: Message = {
        id: uuidv4(),
        type: "human",
        content: [
          ...(finalText.trim().length > 0
            ? [{ type: "text", text: finalText }]
            : []),
          ...blocks,
        ] as Message["content"],
      };

      const toolMessages = ensureToolCallsHaveResponses(stream.messages);

      stream.submit(
        { messages: [...toolMessages, newHumanMessage] },
        {
          streamMode: ["values"],
          streamSubgraphs: true,
          streamResumable: true,
          optimisticValues: (prev) => ({
            ...prev,
            messages: [
              ...(prev.messages ?? []),
              ...toolMessages,
              newHumanMessage,
            ],
          }),
        },
      );
    };
    doSubmit();
  };
}
