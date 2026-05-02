"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ImagePlus, XCircle, Home, SquarePen, FileText } from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput } from "./shared/ChatInput";
import { VoiceNav } from "./shared/VoiceNav";
import { TTSToggle } from "./shared/TTSToggle";
import { ClaimStepper } from "./shared/ClaimStepper";
import { ClaimMetadata } from "./shared/ClaimMetadata";
import { useClaimState } from "@/hooks/use-claim-state";
import { useStreamContext } from "@/providers/Stream";
import { cn } from "@/lib/utils";
import { fileToContentBlock } from "@/lib/multimodal-utils";
import { ensureToolCallsHaveResponses } from "@/lib/ensure-tool-responses";
import { Message } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Background — angular chevrons / V-shapes (21 Capital–inspired)
// ---------------------------------------------------------------------------
function ChevronBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Warm glow from right */}
      <div className="absolute -right-[15%] top-[10%] h-[80%] w-[55%] bg-[radial-gradient(ellipse_at_70%_40%,rgba(197,150,26,0.05)_0%,transparent_60%)]" />

      {/* Subtle glow from left-bottom */}
      <div className="absolute -left-[10%] bottom-[5%] h-[40%] w-[35%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.03)_0%,transparent_60%)]" />

      {/* Chevron / V-shape SVG pattern */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.03]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Nested chevrons pointing right — angular, structured */}
        <path d="M200,0 L550,400 L200,800" stroke="#C5961A" strokeWidth="1.5" />
        <path d="M260,40 L580,400 L260,760" stroke="#C5961A" strokeWidth="0.6" />

        <path d="M350,0 L700,400 L350,800" stroke="#C5961A" strokeWidth="1.5" />
        <path d="M410,40 L730,400 L410,760" stroke="#C5961A" strokeWidth="0.6" />

        <path d="M500,0 L850,400 L500,800" stroke="#C5961A" strokeWidth="1.5" />
        <path d="M560,40 L880,400 L560,760" stroke="#C5961A" strokeWidth="0.6" />

        <path d="M650,0 L1000,400 L650,800" stroke="#C5961A" strokeWidth="1" />
        <path d="M800,0 L1100,400 L800,800" stroke="#C5961A" strokeWidth="0.6" />

        {/* Horizontal accent lines */}
        <line x1="0" y1="400" x2="1200" y2="400" stroke="#C5961A" strokeWidth="0.4" />
        <line x1="100" y1="200" x2="800" y2="200" stroke="#C5961A" strokeWidth="0.2" />
        <line x1="100" y1="600" x2="800" y2="600" stroke="#C5961A" strokeWidth="0.2" />

        {/* Corner dots */}
        <circle cx="550" cy="400" r="3" fill="#C5961A" opacity="0.3" />
        <circle cx="700" cy="400" r="3" fill="#C5961A" opacity="0.3" />
        <circle cx="850" cy="400" r="3" fill="#C5961A" opacity="0.3" />
        <circle cx="1000" cy="400" r="2.5" fill="#C5961A" opacity="0.2" />
      </svg>

      {/* Grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-8" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,transparent_30%,rgba(0,0,0,0.75)_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClaimsView — The Command Center
// ---------------------------------------------------------------------------
interface ClaimsViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

export function ClaimsView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onHome,
  onNewThread,
}: ClaimsViewProps) {
  const stream = useStreamContext();
  const messages = stream.messages;
  const claimState = useClaimState(messages);
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
    { key: "reported", label: "Reported", completed: claimState.steps.reported },
  ];

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    addPhotos(files);
    e.target.value = "";
  };

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
      content: [
        { type: "text", text },
        ...blocks,
      ] as Message["content"],
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
    <div className="relative flex h-full flex-col overflow-hidden">
      <ChevronBackground />

      {/* ─── Top nav ─── */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onHome}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
          >
            <Home className="h-4 w-4" />
            <span className="text-xs font-medium">Home</span>
          </button>
          <VoiceNav />
          <TTSToggle />
        </div>

        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-[#C5961A]/40 animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/15">
            Life Insurance Claim
          </span>
        </div>

        <button
          onClick={onNewThread}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Header band: bold title + stepper ─── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 border-b border-white/[0.04] px-8 pb-6 pt-2"
      >
        <div className="flex items-end justify-between gap-8">
          {/* Bold heading */}
          <div className="shrink-0">
            <h1 className="text-[clamp(2rem,5vw,4rem)] font-black leading-[0.9] tracking-tighter text-white">
              FILE A
            </h1>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black leading-[0.9] tracking-tighter text-[#C5961A]/30">
              CLAIM.
            </h2>
          </div>

          {/* Stepper — right side of header */}
          <div className="flex-1 max-w-lg pb-2">
            <ClaimStepper steps={steps} />
          </div>
        </div>

        {/* Accent line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 h-px w-12 origin-left bg-gradient-to-r from-[#C5961A]/40 to-transparent"
        />
      </motion.div>

      {/* ─── Split: Workspace + Chat ─── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
          {/* LEFT: Document workspace */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-[50%] flex-col overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent"
        >
          {/* Document upload zone */}
          <div className="mb-6">
            <label className="mb-2.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-white/20">
              <Camera className="h-3 w-3" />
              Supporting Documents
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "relative flex min-h-[180px] flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200",
                dragOver
                  ? "border-[#C5961A]/50 bg-[#C5961A]/5"
                  : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12]",
              )}
            >
              {photoPreviews.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors",
                      dragOver
                        ? "border-[#C5961A]/30 bg-[#C5961A]/10"
                        : "border-white/[0.05] bg-white/[0.02]",
                    )}
                  >
                    <Camera
                      className={cn(
                        "h-7 w-7 transition-colors",
                        dragOver ? "text-[#C5961A]" : "text-white/12",
                      )}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-white/25">
                      Drop documents here or{" "}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer text-[#C5961A]/50 hover:text-[#C5961A] underline underline-offset-2 transition-colors"
                      >
                        browse
                      </button>
                    </p>
                    <p className="mt-1.5 text-[10px] text-white/10">
                      Images or PDF supported
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full p-4">
                  <div className="flex flex-wrap gap-3">
                    {photoPreviews.map((src, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative"
                      >
                        {src.startsWith("data:application/pdf") ? (
                          <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-center">
                            <FileText className="h-5 w-5 text-[#C5961A]/50" />
                            <span className="line-clamp-2 text-[9px] text-white/35">
                              {photoFiles[i]?.name ?? "PDF"}
                            </span>
                          </div>
                        ) : (
                          <img
                            src={src}
                            alt={`Supporting document ${i + 1}`}
                            className="h-24 w-24 rounded-xl border border-white/[0.06] object-cover"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute -top-2 -right-2 cursor-pointer rounded-full bg-black border border-white/10 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <XCircle className="h-5 w-5 text-red-400" />
                        </button>
                      </motion.div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/8 bg-white/[0.01] text-white/15 transition-colors hover:border-[#C5961A]/20 hover:text-[#C5961A]/40"
                    >
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[9px] font-medium">Add more</span>
                    </button>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={sendPhotos}
                    className="mt-4 w-full cursor-pointer rounded-xl bg-[#C5961A] py-2.5 text-sm font-semibold text-black transition-all hover:bg-[#d4a520]"
                  >
                    Send {photoFiles.length} document
                    {photoFiles.length !== 1 ? "s" : ""} to agent
                  </motion.button>
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
          </div>

          {/* Claim metadata cards */}
          <ClaimMetadata claim={claimState} />
        </motion.div>

        {/* Vertical separator */}
        <div className="w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />

        {/* RIGHT: Chat panel */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-[50%] flex-col"
        >
          <ChatPanel
            className="flex-1"
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
        </motion.div>
      </div>
    </div>
  );
}
