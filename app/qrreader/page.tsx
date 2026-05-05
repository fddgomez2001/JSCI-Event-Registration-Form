"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

const sharedPassword = "JesusIsLord!";
const committeeNames = [
  "Frank",
  "Psalm",
  "Cathy",
  "Cris",
  "Merianne",
  "Caroline",
  "Josiah",
  "Julie",
  "Quennie",
] as const;
const loginStorageKey = "qrreader-committee-login";
const SCAN_INTERVAL_MS = 180;
const MAX_SCAN_WIDTH = 720;
const tableViews = ["scanner", "checkin", "lunch", "log"] as const;

type TableView = (typeof tableViews)[number];

type ScanModalState = {
  conference: "LEYTE Conference" | "CEBU Conference";
  fullName: string;
  ministry: string;
  church: string;
  attendeeId: string;
  checkedIn: boolean;
  lunch: boolean;
};

type TableRow = {
  id: string;
  fullName: string;
  church: string;
  ministry: string;
  checkedInAt?: string | null;
  lunchAt?: string | null;
  committeeName?: string | null;
  actionType?: string | null;
  scannedAt?: string | null;
  conference?: "LEYTE Conference" | "CEBU Conference";
};

export default function QRReaderPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [committeeName, setCommitteeName] = useState<typeof committeeNames[number] | "">("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginReady, setLoginReady] = useState(false);
  const [error, setError] = useState("");
  const [tableView, setTableView] = useState<TableView>("scanner");
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableTitle, setTableTitle] = useState("Scanner");
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastDecodeAtRef = useRef(0);
  const lastScanRef = useRef("");
  const scannerActiveRef = useRef(false);
  const keyboardBufferRef = useRef("");
  const keyboardTimerRef = useRef<number | null>(null);
  const tableViewRef = useRef<TableView>("scanner");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [modal, setModal] = useState<ScanModalState | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [manualScanBusy, setManualScanBusy] = useState(false);

  useEffect(() => {
    setLoginReady(true);
    try {
      const saved = window.localStorage.getItem(loginStorageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved) as {
        committeeName?: string;
        password?: string;
        rememberMe?: boolean;
      };

      if (!parsed.rememberMe) return;
      if (typeof parsed.committeeName === "string" && committeeNames.includes(parsed.committeeName as typeof committeeNames[number])) {
        setCommitteeName(parsed.committeeName as typeof committeeNames[number]);
      }
      if (typeof parsed.password === "string") {
        setPassword(parsed.password);
      }
      setRememberMe(true);
      setIsAuthenticated(true);
    } catch {
      window.localStorage.removeItem(loginStorageKey);
    }
  }, []);

  useEffect(() => {
    lastScanRef.current = lastScan ?? "";
  }, [lastScan]);

  useEffect(() => {
    tableViewRef.current = tableView;
  }, [tableView]);

  useEffect(() => {
    if (!isAuthenticated || tableView !== "scanner") return;
    void startScanner();
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, tableView]);

  useEffect(() => {
    if (!isAuthenticated || tableView !== "scanner") return;

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
  }, [isAuthenticated, lastScan, modal, tableView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || !isAuthenticated || tableView !== "scanner") return;
    const normalized = normalizeScannedValue(code);
    if (normalized) {
      setLastScan(normalized);
      void handleScanned(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, tableView]);

  function normalizeScannedValue(raw: string) {
    const value = String(raw ?? "").trim();
    if (!value) return "";

    try {
      const url = new URL(value);
      const sourceType = url.searchParams.get("sourceType");
      const sourceId = url.searchParams.get("sourceId");
      const name = url.searchParams.get("name");
      if (sourceType && sourceId) {
        return url.toString();
      }

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
    if (scannerActiveRef.current) return;
    scannerActiveRef.current = true;
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
      scannerActiveRef.current = false;
      setScanning(false);
    }
  }

  function stopScanner() {
    scannerActiveRef.current = false;
    setScanning(false);
    setLastScan("");
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
        body: JSON.stringify({ attendeeKey: raw, attendeeId: raw, committeeName }),
      });

      if (!res.ok) {
        setError("Attendee not found.");
        return;
      }

      const body = await res.json();
      setModal({
        conference: body.conference,
        fullName: body.fullName,
        ministry: body.ministry ?? "",
        church: body.church ?? "",
        attendeeId: raw,
        checkedIn: !!body.checkedIn,
        lunch: !!body.lunch,
      });
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
        body: JSON.stringify({ attendeeKey: modal.attendeeId, attendeeId: modal.attendeeId, action, committeeName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Unable to save.");
        return;
      }

      const body = await res.json();
      setModal({
        ...modal,
        checkedIn: !!body.checkedIn,
        lunch: !!body.lunch,
      } as ScanModalState);
    } catch {
      setError("Unable to save.");
    }
  }

  async function loadTable(view: Exclude<TableView, "scanner">) {
    setTableView(view);
    setTableError("");
    setTableLoading(true);
    stopScanner();
    setShowTableModal(true);
    setModal(null);

    const nextTitle =
      view === "checkin" ? "Check-in List" : view === "lunch" ? "Lunch Table" : "Scan Log";
    setTableTitle(nextTitle);

    try {
      const response = await fetch(`/api/qr/tables?view=${view}&committeeName=${encodeURIComponent(committeeName)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to load table.");
      }
      const body = (await response.json()) as { rows: TableRow[] };
      setTableRows(body.rows ?? []);
    } catch (loadError) {
      setTableRows([]);
      setTableError(loadError instanceof Error ? loadError.message : "Unable to load table.");
    } finally {
      setTableLoading(false);
    }
  }

  async function saveManualCode() {
    const normalized = normalizeScannedValue(manualCode);
    if (!normalized) return;
    setManualScanBusy(true);
    try {
      setLastScan(normalized);
      await handleScanned(normalized);
    } finally {
      setManualScanBusy(false);
    }
  }

  function logout() {
    stopScanner();
    setIsAuthenticated(false);
    setTableView("scanner");
    setTableRows([]);
    setTableError("");
    setModal(null);
  }

  function renderLogin() {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(248,205,112,0.2),transparent_40%),linear-gradient(135deg,#0b1220_0%,#0f172a_45%,#1f2937_100%)] px-4 py-8">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300/80">Committee Login</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Welcome Committee</h1>
          <p className="mt-2 text-sm text-slate-300">Enter your committee name and password to open the QR scanner.</p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-200">Committee Name</label>
              <select
                value={committeeName}
                onChange={(event) => setCommitteeName(event.target.value as typeof committeeNames[number])}
                className="w-full rounded-2xl border border-white/10 bg-white/95 px-4 py-3 text-slate-950 outline-none ring-0 transition focus:border-amber-300 focus:shadow-[0_0_0_4px_rgba(251,191,36,0.14)]"
                required
              >
                <option value="">Select committee name</option>
                {committeeNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-200">Password</label>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="w-full rounded-2xl border border-white/10 bg-white/95 px-4 py-3 text-slate-950 outline-none ring-0 transition focus:border-amber-300 focus:shadow-[0_0_0_4px_rgba(251,191,36,0.14)]"
                placeholder="Enter password"
                required
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-slate-900 text-amber-400 accent-amber-400"
              />
              Remember me on this device
            </label>

            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

            <button className="w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-4 py-3 font-black text-slate-950 shadow-[0_12px_30px_rgba(251,191,36,0.25)] transition hover:brightness-105">
              Enter Scanner
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-semibold text-amber-200">Allowed committee names</p>
            <p className="mt-2 leading-relaxed">Frank, Psalm, Cathy, Cris, Merianne, Caroline, Josiah, Julie, Quennie</p>
          </div>
        </div>
      </div>
    );
  }

  function renderScannerContent() {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.7fr] items-start">
        <section className="rounded-[2rem] border border-white/10 bg-white/8 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/80">Scanner</p>
              <h2 className="mt-2 text-2xl font-black text-white">Point the camera at the attendee QR</h2>
              <p className="mt-2 text-sm text-slate-300">Logged in as {committeeName || "Committee"}. Use the buttons to open the filtered tables or the scan log.</p>
            </div>
            {/* scanner-only view: buttons below open table modal */}
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-right">
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-amber-200/80">Active Committee</p>
              <p className="mt-1 text-lg font-black text-white">{committeeName || "Unknown"}</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900/70 to-slate-900/40 p-3 shadow-lg">
            <video
              ref={videoRef}
              className="w-full h-[360px] sm:h-[420px] md:h-[520px] lg:h-[620px] rounded-[1.2rem] bg-black object-cover"
              playsInline
              muted
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadTable("checkin")}
              className="rounded-full bg-amber-400 px-4 py-2.5 font-semibold text-slate-950 shadow-sm hover:brightness-105 transition"
            >
              Check-in List
            </button>
            <button
              type="button"
              onClick={() => void loadTable("lunch")}
              className="rounded-full bg-amber-400/90 px-4 py-2.5 font-semibold text-slate-950 shadow-sm hover:brightness-105 transition"
            >
              Lunch Table
            </button>
            <button
              type="button"
              onClick={() => void loadTable("log")}
              className="rounded-full bg-white/10 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-white/20 transition"
            >
              Scan Log
            </button>
            <button
              type="button"
              onClick={() => {
                stopScanner();
                void startScanner();
              }}
              className="rounded-full bg-white/6 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-white/10 transition"
            >
              Restart Scanner
            </button>
            <button type="button" onClick={logout} className="rounded-full bg-rose-500 px-4 py-2.5 font-semibold text-white shadow-sm hover:brightness-95 transition">
              Logout
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-200">USB scanner / manual code</label>
              <div className="flex gap-2">
                <input
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="Paste scan result or UUID"
                  className="w-full rounded-2xl border border-white/6 bg-slate-900/80 px-4 py-3 text-slate-100 outline-none transition focus:border-amber-300 focus:shadow-[0_0_0_4px_rgba(251,191,36,0.12)]"
                />
                <button
                  type="button"
                  onClick={() => void saveManualCode()}
                  disabled={manualScanBusy}
                  className="rounded-2xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {manualScanBusy ? "Saving..." : "Use"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <p className="font-semibold text-amber-200">What happens on scan</p>
              <p className="mt-2 leading-relaxed">The modal shows conference, attendee name, ministry, and church at the top. Every lookup and action is written to the scan log with your committee name.</p>
            </div>
          </div>

          {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
        </section>

        {/* tables are shown in a modal only; removed right-side quick panel for a cleaner scanner-first UI */}
      </div>
    );
  }

  function renderTableModal() {
    if (!showTableModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
        <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-white">{tableTitle}</h3>
              <p className="text-sm text-slate-400">{tableRows.length} record{tableRows.length === 1 ? "" : "s"}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowTableModal(false);
                  setTableView("scanner");
                  void startScanner();
                }}
                className="rounded-2xl bg-white/6 px-4 py-2 font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 p-3">
            {tableLoading ? (
              <p className="text-sm text-slate-300">Loading {tableTitle.toLowerCase()}...</p>
            ) : tableError ? (
              <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">{tableError}</p>
            ) : (
              <div className="space-y-3">
                <div className="max-h-[64vh] overflow-auto">
                  <div className="overflow-auto rounded-2xl border border-white/10 bg-slate-900/80">
                    <table className="w-full border-collapse text-left text-sm text-slate-100">
                      <thead className="sticky top-0 bg-slate-950 text-amber-200">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Ministry</th>
                          <th className="px-4 py-3">Church</th>
                          {tableView === "log" ? <th className="px-4 py-3">Committee</th> : null}
                          {tableView === "log" ? <th className="px-4 py-3">Action</th> : null}
                          {tableView === "log" ? <th className="px-4 py-3">Conference</th> : null}
                          {tableView === "log" ? <th className="px-4 py-3">Time</th> : null}
                          {tableView !== "log" ? <th className="px-4 py-3">Status</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.length ? tableRows.map((row) => (
                          <tr key={`${row.id}-${row.actionType ?? row.scannedAt ?? row.checkedInAt ?? row.lunchAt ?? row.fullName}`} className="border-t border-white/5">
                            <td className="px-4 py-3 font-semibold text-white">{row.fullName}</td>
                            <td className="px-4 py-3">{row.ministry || "-"}</td>
                            <td className="px-4 py-3">{row.church || "-"}</td>
                            {tableView === "log" ? <td className="px-4 py-3">{row.committeeName || "-"}</td> : null}
                            {tableView === "log" ? <td className="px-4 py-3 uppercase tracking-[0.18em] text-amber-200">{row.actionType || "-"}</td> : null}
                            {tableView === "log" ? <td className="px-4 py-3 text-slate-300">{row.conference || "-"}</td> : null}
                            {tableView === "log" ? <td className="px-4 py-3 text-slate-300">{row.scannedAt || "-"}</td> : null}
                            {tableView !== "log" ? <td className="px-4 py-3 text-emerald-300">{tableView === "checkin" ? (row.checkedInAt ? `Checked in ${row.checkedInAt}` : "Checked in") : row.lunchAt ? `Lunch ${row.lunchAt}` : "Lunch marked"}</td> : null}
                          </tr>
                        )) : (
                          <tr>
                            <td className="px-4 py-6 text-slate-400" colSpan={tableView === "log" ? 6 : 4}>
                              No records found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderModal() {
    if (!modal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-gradient-to-b from-white to-slate-100 p-6 text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-amber-700">{modal.conference}</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{modal.fullName}</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setModal(null);
                if (tableView === "scanner") void startScanner();
              }}
              className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-300"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-amber-300">Fullname of the Attendee</p>
              <p className="mt-1 text-lg font-black">{modal.fullName}</p>
            </div>
            <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-amber-300">Ministry</p>
              <p className="mt-1 text-lg font-black">{modal.ministry || "-"}</p>
            </div>
            <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white sm:col-span-2">
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-amber-300">Church</p>
              <p className="mt-1 text-lg font-black">{modal.church || "-"}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{modal.conference}</p>
            <p className="mt-1">Confirmed through committee login and written to the scan log.</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {!modal.checkedIn ? (
              <button onClick={() => void doAction("checkin")} className="rounded-full bg-emerald-500 px-5 py-3 font-black text-white transition hover:brightness-105">
                Check In
              </button>
            ) : null}
            <button onClick={() => void doAction("lunch")} className="rounded-full bg-amber-400 px-5 py-3 font-black text-slate-950 transition hover:brightness-105">
              Lunch
            </button>
            <button
              onClick={() => {
                setModal(null);
                if (tableView === "scanner") void startScanner();
              }}
              className="rounded-full bg-slate-700 px-5 py-3 font-black text-white transition hover:bg-slate-800"
            >
              Return to Scanner
            </button>
          </div>
        </div>
      </div>
    );
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCommitteeName = committeeName.trim();

    if (!committeeNames.includes(trimmedCommitteeName as typeof committeeNames[number])) {
      setError("Please choose a valid committee name.");
      return;
    }

    if (password !== sharedPassword) {
      setError("Invalid password.");
      return;
    }

    if (rememberMe) {
      window.localStorage.setItem(
        loginStorageKey,
        JSON.stringify({ committeeName: trimmedCommitteeName, password, rememberMe: true }),
      );
    } else {
      window.localStorage.removeItem(loginStorageKey);
    }

    setCommitteeName(trimmedCommitteeName as typeof committeeNames[number]);
    setIsAuthenticated(true);
    setError("");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_28%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.16),transparent_26%),linear-gradient(135deg,#07111f_0%,#0b1628_55%,#13263f_100%)] px-4 py-6 text-white sm:px-6 lg:px-8 lg:py-8">
      {!loginReady ? null : !isAuthenticated ? renderLogin() : (
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_16px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300/80">QR Reader</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Committee scanning console</h1>
            </div>
            <div className="text-sm text-slate-300">
              Logged in as <span className="font-bold text-white">{committeeName}</span>
            </div>
          </header>

          {renderScannerContent()}
          {renderModal()}
          {renderTableModal()}

          {/* mobile floating button to quickly reopen scanner */}
          {(tableView !== "scanner" || showTableModal) ? (
            <button
              onClick={() => {
                setTableView("scanner");
                setShowTableModal(false);
                void startScanner();
              }}
              className="fixed bottom-6 right-4 z-50 rounded-full bg-amber-400 px-4 py-3 font-black text-slate-950 shadow-lg lg:hidden"
            >
              Open Scanner
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}
