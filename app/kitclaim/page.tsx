"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Swal from "sweetalert2";

type KitScanEvent = {
  fullName: string;
  church: string;
  conference: string;
};

export default function KitClaimDisplayPage() {
  const [current, setCurrent] = useState<KitScanEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-clear display after 10 seconds of idle
  useEffect(() => {
    if (current) {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setCurrent(null);
        clearTimerRef.current = null;
      }, 10000);
    } else {
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
  }, [current]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("kitclaim-display")
      .on("broadcast", { event: "kit-scan" }, (msg) => {
        const payload = msg.payload as { fullName: string; church: string; conference: string; source?: string };
        if (payload.source !== "kit") return;
        setCurrent({
          fullName: payload.fullName,
          church: payload.church ?? "",
          conference: payload.conference ?? "",
        });
        setAnimKey((k) => k + 1);
      })
      .on("broadcast", { event: "kit-claimed" }, (msg) => {
        const payload = msg.payload as { fullName: string; church: string; conference: string; source?: string };
        if (payload.source !== "kit") return;

        // Update current attendee
        setCurrent({
          fullName: payload.fullName,
          church: payload.church ?? "",
          conference: payload.conference ?? "",
        });
        setAnimKey((k) => k + 1);

        // Reset auto-clear timer since SweetAlert2 takes over
        if (clearTimerRef.current) {
          clearTimeout(clearTimerRef.current);
          clearTimerRef.current = null;
        }

        // Show SweetAlert2
        Swal.fire({
          title: "🎁 KIT CLAIMED!",
          html: `
            <div style="text-align:center; padding: 8px 0;">
              <p style="font-size:2rem; font-weight:900; color:#fff; margin-bottom:10px;">${payload.fullName}</p>
              <p style="font-size:1.1rem; font-weight:700; color:#86efac; letter-spacing:0.05em;">YOU HAVE CLAIMED YOUR KIT.</p>
              <p style="font-size:1.1rem; font-weight:700; color:#86efac; letter-spacing:0.05em;">THANK YOU AND ENJOY! 🎉</p>
            </div>
          `,
          background: "linear-gradient(135deg, #0a2e1a 0%, #0f3d24 50%, #14532d 100%)",
          color: "#ffffff",
          confirmButtonText: "CLOSE",
          confirmButtonColor: "#16a34a",
          allowOutsideClick: true,
          customClass: {
            title: "swal-kit-title",
            popup: "swal-kit-popup",
          },
          timer: 8000,
          timerProgressBar: true,
          showClass: {
            popup: "swal2-show",
          },
          hideClass: {
            popup: "swal2-hide",
          },
        }).then(() => {
          setCurrent(null);
        });
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
      ? "from-teal-500/20 to-teal-600/20 border-teal-500/40 text-teal-300"
      : "from-green-500/20 to-emerald-600/20 border-green-500/40 text-green-300";

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-green-950 to-emerald-900 flex flex-col overflow-hidden">

      {/* Connection indicator */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"} shadow-lg`} />
        <span className="text-xs font-bold text-white/50 uppercase tracking-widest">
          {connected ? "LIVE" : "CONNECTING..."}
        </span>
      </div>

      {/* Page label */}
      <div className="absolute top-4 left-4 z-10">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-green-400/60">KIT CLAIM DISPLAY</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 relative">

        {/* Ambient glow */}
        {current && (
          <div
            key={`glow-${animKey}`}
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(34,197,94,0.18) 0%, transparent 70%)",
              animation: "glowPulse 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ease-out",
            }}
          />
        )}

        {current ? (
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

            {/* Welcome */}
            <p
              className="font-bold text-green-300 uppercase tracking-[0.35em] mb-4"
              style={{
                fontSize: "clamp(1rem, 2.5vw, 2rem)",
                animation: "fadeInScaleSmooth 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both",
              }}
            >
              WELCOME
            </p>

            {/* Full Name */}
            <h1
              className="font-black text-white leading-tight mb-4"
              style={{
                fontSize: "clamp(3rem, 10vw, 8rem)",
                textShadow: "0 0 60px rgba(34,197,94,0.6)",
                animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both",
              }}
            >
              {current.fullName}
            </h1>

            {/* Church */}
            {current.church && (
              <p
                className="text-green-300 font-bold tracking-wide"
                style={{
                  fontSize: "clamp(1.25rem, 3.5vw, 2.5rem)",
                  animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both",
                }}
              >
                {current.church}
              </p>
            )}

            {/* Kit icon row */}
            <div
              className="flex justify-center gap-6 mt-8"
              style={{ animation: "fadeInScaleSmooth 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.35s both" }}
            >
              <span className="text-4xl">🎒</span>
              <span className="text-4xl">☕</span>
              <span className="text-4xl">📓</span>
              <span className="text-4xl">✏️</span>
            </div>

            {/* Divider */}
            <div
              className="mt-10 mx-auto w-32 h-1 rounded-full bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-60"
              style={{ animation: "fadeInScaleSmooth 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both" }}
            />
          </div>
        ) : (
          <div
            className="text-center w-full h-full flex flex-col items-center justify-center gap-8"
            style={{ animation: "fadeInSmooth 1s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          >
            <img
              src="/JSCI_CONFERENCE.png"
              alt="JSCI Conference"
              className="max-w-4xl max-h-[60vh] object-contain"
            />
            <p className="text-green-400/60 font-bold uppercase tracking-[0.3em] text-lg">
              🎁 KIT CLAIM STATION
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
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

        :global(.swal-kit-popup) {
          border: 2px solid rgba(34, 197, 94, 0.4) !important;
          border-radius: 24px !important;
          box-shadow: 0 0 60px rgba(34, 197, 94, 0.3) !important;
        }

        :global(.swal-kit-title) {
          color: #4ade80 !important;
          font-size: 2rem !important;
          font-weight: 900 !important;
          letter-spacing: 0.08em !important;
        }
      `}</style>
    </div>
  );
}
