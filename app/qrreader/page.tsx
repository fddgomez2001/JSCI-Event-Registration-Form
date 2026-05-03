"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

const sharedPassword = "JesusIsLord!";
const SCAN_INTERVAL_MS = 180;
const MAX_SCAN_WIDTH = 720;

export default function QRReaderPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastDecodeAtRef = useRef(0);
  const lastScanRef = useRef("");
  const keyboardBufferRef = useRef("");
  const keyboardTimerRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [modal, setModal] = useState<{ fullName: string; attendeeId: string; checkedIn: boolean; lunch: boolean } | null>(null);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    lastScanRef.current = lastScan ?? "";
  }, [lastScan]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void startScanner();
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (modal) return;

      if (event.key === "Enter") {
        const raw = keyboardBufferRef.current.trim();
        keyboardBufferRef.current = "";
        if (keyboardTimerRef.current) {
          window.clearTimeout(keyboardTimerRef.current);
          keyboardTimerRef.current = null;
        }
        if (raw.length >= 8) {
          const normalized = normalizeScannedValue(raw);
          if (normalized && normalized !== lastScanRef.current) {
            setLastScan(normalized);
            void handleScanned(normalized);
          }
        }
        return;
      }

      if (event.key.length === 1) {
        keyboardBufferRef.current += event.key;
        if (keyboardTimerRef.current) {
          window.clearTimeout(keyboardTimerRef.current);
        }
        keyboardTimerRef.current = window.setTimeout(() => {
          keyboardBufferRef.current = "";
          keyboardTimerRef.current = null;
        }, 300);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (keyboardTimerRef.current) {
        window.clearTimeout(keyboardTimerRef.current);
        keyboardTimerRef.current = null;
      }
    };
  }, [isAuthenticated, lastScan, modal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || !isAuthenticated) return;
    const normalized = normalizeScannedValue(code);
    if (normalized) {
      setLastScan(normalized);
      void handleScanned(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  function normalizeScannedValue(raw: string) {
    const value = String(raw ?? "").trim();
    if (!value) return "";

    try {
      const url = new URL(value);
      const codeFromQuery = url.searchParams.get("code");
      if (codeFromQuery) return codeFromQuery.trim();
      const maybeUuidPath = url.pathname.split("/").filter(Boolean).pop() ?? "";
      if (maybeUuidPath) return maybeUuidPath.trim();
    } catch {
      // Not a URL, treat as raw code
    }

    return value;
  }

  async function startScanner() {
    if (scanning) return;
    setScanning(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = (window as any).BarcodeDetector ? new (window as any).BarcodeDetector({ formats: ["qr_code"] }) : null;

      const loop = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        const now = performance.now();
        if (now - lastDecodeAtRef.current < SCAN_INTERVAL_MS) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        lastDecodeAtRef.current = now;

        try {
          if (detector) {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length) {
              const raw = normalizeScannedValue(String(barcodes[0].rawValue ?? ""));
              if (raw && raw !== lastScanRef.current) {
                setLastScan(raw);
                await handleScanned(raw);
              }
            }
          } else {
            await scanWithCanvas(videoRef.current);
          }
        } catch {
          // ignore
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setError("Camera access denied or unavailable.");
      setScanning(false);
    }
  }

  function stopScanner() {
    setScanning(false);
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function scanWithCanvas(video: HTMLVideoElement) {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      contextRef.current = canvasRef.current.getContext("2d");
    }
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!ctx) return;

    if (!video || video.readyState < 2) {
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const scale = sourceWidth > MAX_SCAN_WIDTH ? MAX_SCAN_WIDTH / sourceWidth : 1;
    canvas.width = Math.max(1, Math.floor(sourceWidth * scale));
    canvas.height = Math.max(1, Math.floor(sourceHeight * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    if (result?.data) {
      const raw = normalizeScannedValue(result.data);
      if (raw && raw !== lastScanRef.current) {
        setLastScan(raw);
        await handleScanned(raw);
      }
    }
  }

  async function handleScanned(raw: string) {
    // Payload is attendee UUID
    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: raw }),
      });

      if (!res.ok) {
        setError("Attendee not found.");
        return;
      }

      const body = await res.json();
      setModal({ fullName: body.fullName, attendeeId: raw, checkedIn: !!body.checkedIn, lunch: !!body.lunch });
      // stop camera while modal is open
      stopScanner();
    } catch (e) {
      setError("Lookup error.");
    }
  }

  async function doAction(action: "checkin" | "lunch") {
    if (!modal) return;
    setError("");
    try {
      const res = await fetch("/api/qr/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: modal.attendeeId, action }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Unable to save.");
        return;
      }

      const body = await res.json();
      setModal({ fullName: modal.fullName, attendeeId: modal.attendeeId, checkedIn: !!body.checkedIn, lunch: !!body.lunch });
    } catch {
      setError("Unable to save.");
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === sharedPassword) {
      setIsAuthenticated(true);
      setError("");
    } else {
      setError("Invalid password.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-black">Welcome Committee</h1>
        {!isAuthenticated ? (
          <form onSubmit={handleLogin} className="mt-6">
            <label className="block text-sm font-medium">Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="mt-2 w-full rounded p-2 text-black" />
            {error ? <p className="mt-2 text-red-400">{error}</p> : null}
            <button className="mt-4 rounded bg-amber-400 px-4 py-2 font-bold text-black">Enter</button>
          </form>
        ) : (
          <div className="mt-6">
            <p className="mb-3">Scanner active — point camera at attendee QR.</p>
            <div className="rounded bg-black p-2">
              <video ref={videoRef} className="w-full h-auto rounded" playsInline muted />
            </div>
            <div className="mt-4">
              <label className="text-sm">USB scanner / manual code</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Paste scan result or UUID"
                  className="w-full rounded p-2 text-black"
                />
                <button
                  type="button"
                  onClick={() => {
                    const normalized = normalizeScannedValue(manualCode);
                    if (!normalized) return;
                    setLastScan(normalized);
                    void handleScanned(normalized);
                  }}
                  className="rounded bg-amber-400 px-4 py-2 font-bold text-black"
                >
                  Use
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Tip: USB QR scanners usually type the code then press Enter automatically.
              </p>
            </div>
            {error ? <p className="mt-2 text-red-400">{error}</p> : null}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { stopScanner(); startScanner(); }} className="rounded bg-slate-800 px-3 py-2">Restart Scanner</button>
              <button onClick={() => { stopScanner(); setIsAuthenticated(false); }} className="rounded bg-rose-600 px-3 py-2">Logout</button>
            </div>
          </div>
        )}

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded bg-white p-6 text-black">
              <h2 className="text-xl font-bold">{modal.fullName}</h2>
              <p className="mt-2">Please confirm:</p>
              <div className="mt-4 flex gap-3">
                {!modal.checkedIn ? (
                  <button onClick={() => void doAction("checkin")} className="rounded bg-emerald-500 px-4 py-2 font-bold">Check In</button>
                ) : null}
                <button onClick={() => void doAction("lunch")} className="rounded bg-amber-400 px-4 py-2 font-bold">Lunch</button>
                <button onClick={() => { setModal(null); void startScanner(); }} className="rounded bg-slate-700 px-4 py-2">Close</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
