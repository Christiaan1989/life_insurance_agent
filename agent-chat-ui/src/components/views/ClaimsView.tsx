"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  FileText,
  HeartHandshake,
  ImagePlus,
  Upload,
  XCircle,
} from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput } from "./shared/ChatInput";
import { TopBar } from "./shared/TopBar";
import { ClaimMetadata } from "./shared/ClaimMetadata";
import { useClaimState } from "@/hooks/use-claim-state";
import { useStreamContext } from "@/providers/Stream";
import { cn } from "@/lib/utils";
import { fileToContentBlock } from "@/lib/multimodal-utils";
import { ensureToolCallsHaveResponses } from "@/lib/ensure-tool-responses";
import { Message } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";

interface ClaimsViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

function Stepper({
  steps,
}: {
  steps: { key: string; label: string; completed: boolean }[];
}) {
  const activeIndex = Math.max(0, steps.findIndex((s) => !s.completed));

  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const done = step.completed;
        const active = !done && index === activeIndex;
        return (
          <div
            key={step.key}
            className={cn(
              "sl-step",
              done && "sl-step-done",
              active && "sl-step-active",
            )}
          >
            <span className="sl-step-num">
              {done ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ClaimsView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onHome,
  onNewThread,
}: ClaimsViewProps) {
  const stream = useStreamContext();
  const claimState = useClaimState(stream.messages);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const steps = [
    { key: "created", label: "Opened", completed: claimState.steps.created },
    { key: "assessed", label: "Eligibility", completed: claimState.steps.assessed },
    { key: "documents", label: "Documents", completed: claimState.steps.documents },
    { key: "payout", label: "Payout", completed: claimState.steps.payout },
    { key: "decided", label: "Decision", completed: claimState.steps.decided },
  ];

  const addPhotos = (files: File[]) => {
    setPhotoFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    addPhotos(files);
    e.target.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf",
    );
    if (files.length > 0) addPhotos(files);
  };

  const sendPhotos = async () => {
    if (photoFiles.length === 0) return;
    const blocks = await Promise.all(photoFiles.map(fileToContentBlock));

    let text = "Here are the supporting documents for my life insurance claim.";
    if (!policySubmitted && policyNumber?.trim()) {
      text = `[Policy: ${policyNumber.trim()}] ${text}`;
      onPolicySubmitted();
    }

    const newMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [{ type: "text", text }, ...blocks] as Message["content"],
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);

    stream.submit(
      { messages: [...toolMessages, newMessage] },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          messages: [...(prev.messages ?? []), ...toolMessages, newMessage],
        }),
      },
    );

    setPhotoFiles([]);
    setPhotoPreviews([]);
  };

  return (
    <div className="sl-view-fade-in flex h-full flex-col overflow-hidden bg-[var(--sl-bg)]">
      <TopBar
        viewLabel="Filing a claim"
        onHome={onHome}
        onNewThread={onNewThread}
        rightContent={
          <div className="sl-pill">
            <span className="sl-mono font-semibold text-[var(--sl-primary-ink)]">
              {policyNumber}
            </span>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_1fr]">
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="sl-scroll min-h-0 overflow-y-auto border-r border-[var(--sl-line)] px-6 py-8 lg:px-10"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <section>
              <div className="sl-eyebrow mb-3">Claim support</div>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[var(--sl-accent-soft)] text-[#6B2A11]">
                  <HeartHandshake className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="sl-h-display text-[34px] text-[var(--sl-ink)]">
                    We are here for you.
                  </h1>
                  <p className="mt-2 text-[15px] leading-6 text-[var(--sl-ink-2)]">
                    Take your time. Add whatever documents you have, and I will
                    guide the next step without rushing you.
                  </p>
                </div>
              </div>
            </section>

            <Stepper steps={steps} />

            <section
              className="sl-card relative overflow-hidden p-5"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--sl-primary) 2%, var(--sl-surface)) 0%, var(--sl-surface) 100%)",
              }}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[color-mix(in_oklab,var(--sl-primary)_6%,transparent)] blur-2xl" />
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--sl-ink)]">
                    Add what you have
                  </h2>
                  <p className="mt-1 text-sm text-[var(--sl-ink-3)]">
                    A photo from your phone is fine. I will work out what it is.
                  </p>
                </div>
                <FileText className="h-5 w-5 text-[var(--sl-primary)]" />
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed p-8 text-center transition-all",
                  dragOver
                    ? "border-[var(--sl-primary)] bg-[color-mix(in_oklab,var(--sl-primary)_8%,transparent)]"
                    : "border-[var(--sl-line-2)] bg-[color-mix(in_oklab,var(--sl-primary)_4%,transparent)] hover:border-[var(--sl-primary)]",
                )}
              >
                {photoPreviews.length === 0 ? (
                  <>
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--sl-primary-soft)] text-[var(--sl-primary-ink)]">
                      <Upload className="h-6 w-6" />
                    </div>
                    <p className="text-base font-semibold text-[var(--sl-ink)]">
                      Drop files here, or tap to browse
                    </p>
                    <p className="mt-1 max-w-sm text-sm text-[var(--sl-ink-3)]">
                      Death certificate, medical report, ID, hospital letter, or
                      anything you already have.
                    </p>
                  </>
                ) : (
                  <div className="w-full">
                    <div className="flex flex-wrap gap-3">
                      {photoPreviews.map((src, i) => (
                        <div key={`${src}-${i}`} className="group relative">
                          {src.startsWith("data:application/pdf") ? (
                            <div className="flex h-24 w-28 flex-col items-center justify-center gap-2 rounded-[14px] border border-[var(--sl-line)] bg-[var(--sl-surface)] p-2 text-center">
                              <FileText className="h-5 w-5 text-[var(--sl-primary)]" />
                              <span className="line-clamp-2 text-[10px] text-[var(--sl-ink-2)]">
                                {photoFiles[i]?.name ?? "PDF"}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={src}
                              alt={`Supporting document ${i + 1}`}
                              className="h-24 w-28 rounded-[14px] border border-[var(--sl-line)] object-cover"
                            />
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removePhoto(i);
                            }}
                            className="absolute -right-2 -top-2 rounded-full bg-[var(--sl-surface)] opacity-0 shadow-[var(--sl-shadow-sm)] transition-opacity group-hover:opacity-100"
                            aria-label="Remove document"
                          >
                            <XCircle className="h-5 w-5 text-[var(--sl-danger)]" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="flex h-24 w-28 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[var(--sl-line-2)] bg-[var(--sl-surface)] text-[var(--sl-ink-3)] transition-colors hover:border-[var(--sl-primary)] hover:text-[var(--sl-primary)]"
                      >
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-[11px] font-medium">Add more</span>
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </div>

              {photoFiles.length > 0 && (
                <button
                  type="button"
                  onClick={sendPhotos}
                  className="sl-btn sl-btn-primary mt-4 w-full"
                >
                  Send {photoFiles.length} document
                  {photoFiles.length !== 1 ? "s" : ""} to agent
                </button>
              )}
            </section>

            <section
              className="sl-card-soft relative overflow-hidden p-5"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--sl-accent) 4%, var(--sl-surface-2)) 0%, var(--sl-surface-2) 100%)",
              }}
            >
              <div className="pointer-events-none absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-[color-mix(in_oklab,var(--sl-accent)_6%,transparent)] blur-2xl" />
              <h2 className="text-base font-semibold text-[var(--sl-ink)]">
                Claim details
              </h2>
              <p className="mt-1 text-sm text-[var(--sl-ink-3)]">
                These update as the agent opens the claim, checks eligibility,
                records documents, and reaches a decision.
              </p>
              <ClaimMetadata claim={claimState} className="mt-4" />
            </section>
          </div>
        </motion.main>

        <aside className="flex min-h-0 flex-col bg-[color-mix(in_oklab,var(--sl-bg)_80%,var(--sl-surface))]">
          <div className="border-b border-[var(--sl-line)] px-6 py-4">
            <p className="text-sm font-medium text-[var(--sl-ink-2)]">
              I am here with you through the claim. You can ask questions or add
              details at any point.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "What documents do I need?",
                "How long will this take?",
                "Can someone call me?",
              ].map((prompt) => (
                <span key={prompt} className="sl-chip">
                  {prompt}
                </span>
              ))}
            </div>
          </div>
          <ChatPanel
            className="min-h-0 flex-1"
            footer={
              <div className="w-full px-4 pb-4">
                <ChatInput
                  policyNumber={policyNumber}
                  policySubmitted={policySubmitted}
                  onPolicySubmitted={onPolicySubmitted}
                  placeholder="Describe the claim or provide additional details..."
                  showFileUpload={true}
                  showToolCallsToggle={true}
                />
              </div>
            }
          />
        </aside>
      </div>
    </div>
  );
}
