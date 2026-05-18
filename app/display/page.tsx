"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type ScanEvent = {
  fullName: string;
  church: string;
  conference: string;
  arrivedAt: Date;
  paymentMethod?: "cash" | "online" | "pending";
};

export default function DisplayPage() {
  const [current, setCurrent] = useState<ScanEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [showingPaymentMethod, setShowingPaymentMethod] = useState<"cash" | "online" | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear attendee display after 6 seconds and return to default image
  useEffect(() => {
    // Only start timer if showing attendee info (not payment method)
    if (current && showingPaymentMethod === null) {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
      clearTimerRef.current = setTimeout(() => {
        setCurrent(null);
        clearTimerRef.current = null;
      }, 6000); // 6 seconds
    } else {
      // Cancel timer if showing payment method or no current attendee
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    }

    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, [current, showingPaymentMethod]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("display-scans")
      .on("broadcast", { event: "scan" }, (msg) => {
        const payload = msg.payload as { fullName: string; church: string; conference: string; paymentMethod?: string; source?: string };
        if (payload.source !== "payment") return;
        const event: ScanEvent = {
          fullName: payload.fullName,
          church: payload.church ?? "",
          conference: payload.conference ?? "",
          arrivedAt: new Date(),
          paymentMethod: (payload.paymentMethod as any) || "pending",
        };
        setCurrent(event);
        setAnimKey((k) => k + 1);
        setShowingPaymentMethod(null);
      })
      .on("broadcast", { event: "payment-method-selected" }, (msg) => {
        const payload = msg.payload as { paymentMethod: string; source?: string };
        if (payload.source !== "payment") return;
        setShowingPaymentMethod((payload.paymentMethod as any) || null);
      })
      .on("broadcast", { event: "display-reset" }, () => {
        setCurrent(null);
        setShowingPaymentMethod(null);
        setAnimKey((k) => k + 1);
      })
      .on("broadcast", { event: "payment-confirmed" }, (msg) => {
        const payload = msg.payload as { fullName: string; church: string; conference: string; paymentMethod: string; source?: string };
        if (payload.source !== "payment") return;
        const event: ScanEvent = {
          fullName: payload.fullName,
          church: payload.church ?? "",
          conference: payload.conference ?? "",
          arrivedAt: new Date(),
          paymentMethod: (payload.paymentMethod as any) || "cash",
        };
        setCurrent(event);
        setAnimKey((k) => k + 1);
        setShowingPaymentMethod(null);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const conferenceColor =
    current?.conference?.toLowerCase().includes("cebu")
      ? "from-orange-500/20 to-orange-600/20 border-orange-500/40 text-orange-300"
      : "from-amber-500/20 to-orange-600/20 border-amber-500/40 text-amber-300";

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-orange-900 to-orange-800 flex flex-col overflow-hidden">
      {/* Main spotlight */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 relative">

        {/* Ambient glow */}
        {current && (
          <div
            key={`glow-${animKey}`}
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,115,22,0.2) 0%, transparent 70%)",
              animation: "glowPulse 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ease-out",
            }}
          />
        )}

        {/* Show QR Codes when online payment selected */}
        {showingPaymentMethod === "online" && current ? (
          <div
            key={`online-${animKey}`}
            className="text-center w-full max-w-5xl"
            style={{ animation: "slideUpSmooth 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          >
            {/* Name and Church Header */}
            <div className="mb-8" style={{ animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both" }}>
              <h2 className="text-6xl font-black text-white mb-2 leading-tight">{current.fullName}</h2>
              {current.church && <p className="text-3xl text-orange-300 font-bold">{current.church}</p>}
            </div>

            {/* Payment Instructions */}
            <p className="text-amber-400 font-black text-4xl mb-12 uppercase tracking-widest" style={{ animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both" }}>💳 ONLINE PAYMENT REQUIRED</p>

            {/* QR Code Grid - Large Display */}
            <div className="grid grid-cols-2 gap-8 mb-12">
              {/* GCash */}
              <div className="bg-orange-900/20 border-2 border-orange-500/50 rounded-2xl p-8" style={{ animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both" }}>
                <p className="text-orange-300 font-black text-3xl mb-8 text-center">GCash</p>
                <div className="mb-6 w-80 h-80 mx-auto rounded-xl border-2 border-dashed border-orange-400/40 bg-black/30 flex items-center justify-center">
                  <p className="text-center text-orange-200/80 font-bold text-xl px-4">Use cashier QR standee for GCash scan</p>
                </div>
                <p className="text-orange-200 text-2xl font-black text-center">09123456789</p>
              </div>

              {/* Maya */}
              <div className="bg-orange-900/20 border-2 border-orange-500/50 rounded-2xl p-8" style={{ animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.35s both" }}>
                <p className="text-orange-300 font-black text-3xl mb-8 text-center">Maya</p>
                <div className="mb-6 w-80 h-80 mx-auto rounded-xl border-2 border-dashed border-orange-400/40 bg-black/30 flex items-center justify-center">
                  <p className="text-center text-orange-200/80 font-bold text-xl px-4">Use cashier QR standee for Maya scan</p>
                </div>
                <p className="text-orange-200 text-2xl font-black text-center">09876543210</p>
              </div>
            </div>
          </div>
        ) : current ? (
          <div
            key={animKey}
            className="text-center w-full max-w-4xl"
            style={{ animation: "slideUpSmooth 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          >
            {/* Conference badge */}
            <div className="flex justify-center mb-6" style={{ animation: "fadeInScaleSmooth 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
              <span
                className={`inline-block px-5 py-1.5 rounded-full text-sm font-black uppercase tracking-widest border bg-gradient-to-r ${conferenceColor}`}
              >
                {current.conference}
              </span>
            </div>

            {/* Full Name */}
            <h1
              className="font-black text-white leading-tight mb-4"
              style={{
                fontSize: "clamp(3rem, 10vw, 8rem)",
                textShadow: "0 0 60px rgba(249,115,22,0.6)",
                animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both",
              }}
            >
              {current.fullName}
            </h1>

            {/* Church */}
            {current.church && (
              <p
                className="text-orange-300 font-bold tracking-wide"
                style={{
                  fontSize: "clamp(1.25rem, 3.5vw, 2.5rem)",
                  animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both",
                }}
              >
                {current.church}
              </p>
            )}

            {/* Divider */}
            <div className="mt-10 mx-auto w-32 h-1 rounded-full bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-60" style={{ animation: "fadeInScaleSmooth 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.35s both" }} />
          </div>
        ) : (
          <div
            className="text-center w-full h-full flex items-center justify-center"
            style={{ animation: "fadeInSmooth 1s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          >
            {/* Idle state - Display Conference Image */}
            <img
              src="/JSCI_CONFERENCE.png"
              alt="JSCI Conference"
              className="max-w-4xl max-h-full object-contain"
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(32px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideUpSmooth {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeInScaleSmooth {
          from {
            opacity: 0;
            transform: scale(0.92);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes glowPulse {
          from { 
            opacity: 0;
          }
          to { 
            opacity: 1;
          }
        }
        @keyframes fadeGlow {
          from { 
            opacity: 0;
          }
          to { 
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes fadeInSmooth {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
