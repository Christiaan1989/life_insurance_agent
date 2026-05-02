"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ImagePlus, XCircle, Home, SquarePen, ScanLine, FileText } from "lucide-react";
import { ChatPanel } from "./shared/ChatPanel";
import { ChatInput } from "./shared/ChatInput";
import { VoiceNav } from "./shared/VoiceNav";
import { TTSToggle } from "./shared/TTSToggle";
import { useStreamContext } from "@/providers/Stream";
import { cn } from "@/lib/utils";
import { fileToContentBlock } from "@/lib/multimodal-utils";
import { ensureToolCallsHaveResponses } from "@/lib/ensure-tool-responses";
import { Message } from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Background — scan-grid / crosshatch pattern (technical scanner feel)
// ---------------------------------------------------------------------------
function ScanBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Cool blue-gold glow from center */}
      <div className="absolute top-[10%] left-[30%] h-[80%] w-[50%] bg-[radial-gradient(ellipse,rgba(197,150,26,0.04)_0%,transparent_60%)]" />

      {/* Scan grid SVG */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.025]"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Horizontal scan lines — evenly spaced */}
        {[0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800].map(
          (y) => (
            <line
              key={`h-${y}`}
              x1="0"
              y1={y}
              x2="1200"
              y2={y}
              stroke="#C5961A"
              strokeWidth={y % 200 === 0 ? 1 : 0.3}
            />
          ),
        )}

        {/* Vertical scan lines — wider spacing */}
        {[0, 150, 300, 450, 600, 750, 900, 1050, 1200].map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="800"
            stroke="#C5961A"
            strokeWidth={x % 300 === 0 ? 0.8 : 0.2}
            strokeDasharray={x % 300 === 0 ? "none" : "4,8"}
          />
        ))}

        {/* Dots at major intersections */}
        {[300, 600, 900].map((x) =>
          [200, 400, 600].map((y) => (
            <circle
              key={`dot-${x}-${y}`}
              cx={x}
              cy={y}
              r="2.5"
              fill="#C5961A"
              opacity="0.3"
            />
          )),
        )}

        {/* Crosshair at center */}
        <circle cx="600" cy="400" r="30" stroke="#C5961A" strokeWidth="0.5" />
        <circle cx="600" cy="400" r="50" stroke="#C5961A" strokeWidth="0.3" />
        <line x1="570" y1="400" x2="630" y2="400" stroke="#C5961A" strokeWidth="0.6" />
        <line x1="600" y1="370" x2="600" y2="430" stroke="#C5961A" strokeWidth="0.6" />
      </svg>

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.75)_100%)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentUploadView — The Scanner
// ---------------------------------------------------------------------------
interface DocumentUploadViewProps {
  policyNumber: string;
  policySubmitted: boolean;
  onPolicySubmitted: () => void;
  onHome: () => void;
  onNewThread: () => void;
}

export function DocumentUploadView({
  policyNumber,
  policySubmitted,
  onPolicySubmitted,
  onHome,
  onNewThread,
}: DocumentUploadViewProps) {
  const stream = useStreamContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    addPhotos(files);
    e.target.value = "";
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

    let text = "Here are the supporting documents for my claim. Please analyse them carefully.";
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
    <div className="relative flex h-full flex-col overflow-hidden">
      <ScanBackground />

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
            Document Upload
          </span>
        </div>

        <button
          onClick={onNewThread}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-white/20 hover:text-white/50 hover:bg-white/5 transition-all"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Header band: bold title ─── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 border-b border-white/[0.04] px-8 pb-5 pt-1"
      >
        <div className="flex items-end gap-6">
          <div>
            <h1 className="text-[clamp(1.8rem,4vw,3.5rem)] font-black leading-[0.9] tracking-tighter text-white">
              DOCUMENT
            </h1>
            <h2 className="text-[clamp(1.8rem,4vw,3.5rem)] font-black leading-[0.9] tracking-tighter text-[#C5961A]/25">
              UPLOAD.
            </h2>
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-3 h-px flex-1 max-w-xs origin-left bg-gradient-to-r from-[#C5961A]/30 to-transparent"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mb-2.5 hidden md:block max-w-xs text-xs text-white/15 leading-relaxed"
          >
            Upload death certificates, medical reports, or other supporting documents for AI analysis.
          </motion.p>
        </div>
      </motion.div>

      {/* ─── Split: Photo scanner + Chat ─── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* LEFT: Photo upload / scanner zone */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-[45%] flex-col overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent"
        >
          {/* Scanner badge */}
          <div className="mb-4 flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-[#C5961A]/30" />
            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/15">
              Document Scanner
            </span>
          </div>

          {/* Photo upload zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "relative flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200",
              dragOver
                ? "border-[#C5961A]/50 bg-[#C5961A]/5"
                : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12]",
            )}
          >
            {photoPreviews.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-10">
                <div
                  className={cn(
                    "flex h-20 w-20 items-center justify-center rounded-2xl border transition-colors",
                    dragOver
                      ? "border-[#C5961A]/30 bg-[#C5961A]/10"
                      : "border-white/[0.05] bg-white/[0.02]",
                  )}
                >
                  <Camera
                    className={cn(
                      "h-9 w-9 transition-colors",
                      dragOver ? "text-[#C5961A]" : "text-white/10",
                    )}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white/25">
                    Drop documents here
                  </p>
                  <p className="mt-1 text-white/30">
                    or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer text-[#C5961A]/50 hover:text-[#C5961A] underline underline-offset-2 transition-colors"
                    >
                      browse files
                    </button>
                  </p>
                  <p className="mt-2 text-[10px] text-white/10">
                    Death certificates, medical reports, supporting documents
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
                        <div className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-center">
                          <FileText className="h-5 w-5 text-[#C5961A]/50" />
                          <span className="line-clamp-2 text-[9px] text-white/35">
                            {photoFiles[i]?.name ?? "PDF"}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={src}
                          alt={`Supporting document ${i + 1}`}
                          className="h-28 w-28 rounded-xl border border-white/[0.06] object-cover"
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
                    className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/8 bg-white/[0.01] text-white/15 transition-colors hover:border-[#C5961A]/20 hover:text-[#C5961A]/40"
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
                  Submit {photoFiles.length} document
                  {photoFiles.length !== 1 ? "s" : ""}
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
        </motion.div>

        {/* Vertical separator */}
        <div className="w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />

        {/* RIGHT: Chat panel */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-[55%] flex-col"
        >
          <ChatPanel
            className="flex-1"
            footer={
              <div className="w-full px-4 pb-4">
                <ChatInput
                  policyNumber={policyNumber}
                  policySubmitted={policySubmitted}
                  onPolicySubmitted={onPolicySubmitted}
                  placeholder="Ask about the documents, or describe additional context..."
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
