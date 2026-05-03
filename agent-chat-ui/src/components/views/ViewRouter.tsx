"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamContext } from "@/providers/Stream";
import {
  useActiveView,
  usePendingAuth,
  type ViewType,
} from "@/hooks/use-active-view";
import { useQueryState, parseAsBoolean } from "nuqs";
import { useTTSOrchestrator } from "@/hooks/use-tts-orchestrator";
import { HomeView } from "./HomeView";
import { PolicyOverviewView } from "./PolicyOverviewView";
import { ClaimsView } from "./ClaimsView";
import { ClaimOutcomeView } from "./ClaimOutcomeView";
import { DashboardView } from "./DashboardView";
import { AuthView } from "./AuthView";
import ThreadHistory from "@/components/thread/history";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * Top-level view orchestrator.
 *
 * Reads the `activeView` derived from stream messages (via the
 * `set_active_view` tool call), and renders the corresponding
 * full-screen view with animated transitions.
 */
export function ViewRouter() {
  const stream = useStreamContext();
  const messages = stream.messages;
  const activeView = useActiveView(messages);

  // TTS orchestration lives here so it survives view transitions
  useTTSOrchestrator();
  const pendingAuth = usePendingAuth(messages);

  const [threadId, _setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  // Policy number state (shared across all views)
  const [policyNumber, setPolicyNumber] = useState("POL-2024-001");
  const [policySubmitted, setPolicySubmitted] = useState(false);

  const setThreadId = (id: string | null) => {
    _setThreadId(id);
    // Reset policy submission flag for new threads
    if (id === null) {
      setPolicySubmitted(false);
    }
  };

  // Determine which view to show:
  // - If no thread started (no messages), show Home
  // - Otherwise use the activeView from the agent's tool calls
  const chatStarted = !!threadId || messages.length > 0;
  const currentView: ViewType = chatStarted ? activeView : "home";

  const handleHome = () => {
    setThreadId(null);
  };

  const handleNewThread = () => {
    setThreadId(null);
  };

  const handlePolicySubmitted = () => {
    setPolicySubmitted(true);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0a0a0a]">
      {/* Thread history sidebar */}
      <div className="relative hidden lg:flex">
        <motion.div
          className="absolute z-30 h-full overflow-hidden border-r border-white/[0.06] bg-[#080808]"
          style={{ width: 280 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -280 }
              : { x: chatHistoryOpen ? 0 : -280 }
          }
          initial={{ x: -280 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div className="relative h-full" style={{ width: 280 }}>
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      {/* Main view area */}
      <motion.div
        className="relative flex-1 overflow-hidden"
        animate={{
          marginLeft: chatHistoryOpen && isLargeScreen ? 280 : 0,
          width:
            chatHistoryOpen && isLargeScreen
              ? "calc(100% - 280px)"
              : "100%",
        }}
        transition={
          isLargeScreen
            ? { type: "spring", stiffness: 300, damping: 30 }
            : { duration: 0 }
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full w-full"
          >
            {currentView === "home" && (
              <HomeView
                policyNumber={policyNumber}
                onPolicyChange={setPolicyNumber}
                onPolicySubmitted={handlePolicySubmitted}
                policySubmitted={policySubmitted}
                onOpenHistory={() => setChatHistoryOpen((p) => !p)}
                historyOpen={chatHistoryOpen ?? false}
              />
            )}
            {currentView === "policy_overview" && (
              <PolicyOverviewView
                policyNumber={policyNumber}
                policySubmitted={policySubmitted}
                onPolicySubmitted={handlePolicySubmitted}
                onHome={handleHome}
                onNewThread={handleNewThread}
              />
            )}
            {currentView === "claims" && (
              <ClaimsView
                policyNumber={policyNumber}
                policySubmitted={policySubmitted}
                onPolicySubmitted={handlePolicySubmitted}
                onHome={handleHome}
                onNewThread={handleNewThread}
              />
            )}
            {currentView === "claim_outcome" && (
              <ClaimOutcomeView
                policyNumber={policyNumber}
                policySubmitted={policySubmitted}
                onPolicySubmitted={handlePolicySubmitted}
                onHome={handleHome}
                onNewThread={handleNewThread}
              />
            )}
            {currentView === "dashboard" && (
              <DashboardView
                policyNumber={policyNumber}
                onHome={handleHome}
                onNewThread={handleNewThread}
              />
            )}
            {currentView === "auth" && pendingAuth && (
              <AuthView pendingAuth={pendingAuth} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
