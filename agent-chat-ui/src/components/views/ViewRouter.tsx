"use client";

import { useState, useEffect, useRef } from "react";
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
import { PaymentsView } from "./PaymentsView";
import { ClaimsView } from "./ClaimsView";
import { ClaimOutcomeView } from "./ClaimOutcomeView";
import { DashboardView } from "./DashboardView";
import { AuthView } from "./AuthView";
import { ProductsView } from "./ProductsView";
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

  // When true, show the home view without wiping the active thread.
  // Only handleNewThread does a full reset — handleHome just overlays home.
  const [overrideHome, setOverrideHome] = useState(false);
  // Client-side view override for the Products page. Lets the user open
  // Products without sending a message. Cleared only when the agent
  // navigates away from whatever view was active at pin time.
  const [localView, setLocalView] = useState<ViewType | null>(null);
  const [localViewAnchor, setLocalViewAnchor] = useState<ViewType | null>(null);
  const prevMessageCountRef = useRef(messages.length);

  // As soon as a new message is submitted from the home view,
  // drop the override so the agent's set_active_view takes over.
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      setOverrideHome(false);
    }
  }, [messages.length]);

  // Drop the local pin only when the agent moves *away* from whatever
  // view was active at the moment we pinned. This prevents the pin from
  // self-clearing immediately when the user opens Products from, say,
  // an active payments view.
  useEffect(() => {
    if (!localView) return;
    if (activeView === "products") return;
    if (activeView === localViewAnchor) return;
    setLocalView(null);
    setLocalViewAnchor(null);
  }, [activeView, localView, localViewAnchor]);

  const chatStarted = !!threadId || messages.length > 0;
  const currentView: ViewType = overrideHome
    ? "home"
    : activeView === "auth"
      ? "auth"
      : localView
        ? localView
        : !chatStarted
          ? "home"
          : activeView;

  // Go home but keep the thread alive — verification state is preserved.
  const handleHome = () => {
    setOverrideHome(true);
    setLocalView(null);
    setLocalViewAnchor(null);
  };

  // Full reset — new thread, new conversation.
  const handleNewThread = () => {
    _setThreadId(null);
    setPolicySubmitted(false);
    setOverrideHome(false);
    setLocalView(null);
    setLocalViewAnchor(null);
  };

  const handlePolicySubmitted = () => {
    setPolicySubmitted(true);
    setOverrideHome(false);
  };

  const handleOpenProducts = () => {
    setLocalViewAnchor(activeView);
    setLocalView("products");
    setOverrideHome(false);
  };

  return (
    <div className="sl-body flex h-screen w-full overflow-hidden bg-[var(--sl-bg)] text-[var(--sl-ink)]">
      {/* Thread history sidebar */}
      <div className="relative hidden lg:flex">
        <motion.div
          className="absolute z-30 h-full overflow-hidden border-r border-[var(--sl-line)] bg-[var(--sl-surface)]"
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
                onOpenProducts={handleOpenProducts}
              />
            )}
            {currentView === "products" && (
              <ProductsView
                policyNumber={policyNumber}
                policySubmitted={policySubmitted}
                onPolicySubmitted={handlePolicySubmitted}
                onHome={handleHome}
                onNewThread={handleNewThread}
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
            {currentView === "payments" && (
              <PaymentsView
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
