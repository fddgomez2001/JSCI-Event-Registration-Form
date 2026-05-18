"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

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
  "Qien",
] as const;
const loginStorageKey = "qrreader-committee-login";

type KitState = {
  toteBag: boolean;
  mug: boolean;
  notebook: boolean;
  pencil: boolean;
  claimedAt?: string | null;
  claimedByCommittee?: string | null;
};

type ModalState = {
  attendeeId: string;
  fullName: string;
  ministry: string;
  church: string;
  conference: "LEYTE Conference" | "CEBU Conference";
  paymentStatus: "pending" | "paid";
  kit: KitState;
};

export default function KitPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [committeeName, setCommitteeName] = useState<typeof committeeNames[number] | "">("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginReady, setLoginReady] = useState(false);
  const [error, setError] = useState("");

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [kitProcessing, setKitProcessing] = useState(false);

  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; fullName: string; church?: string; ministry?: string; paymentStatus?: "paid" | "pending" }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const kitDisplayChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const kitDisplayReadyRef = useRef(false);
  const pendingKitEventsRef = useRef<Array<{ event: "kit-scan" | "kit-claimed"; payload: { fullName: string; church: string; conference: string; source: "kit" } }>>([]);

  const sendKitDisplayEvent = (event: "kit-scan" | "kit-claimed", payload: { fullName: string; church: string; conference: string }) => {
    if (!kitDisplayReadyRef.current || !kitDisplayChannelRef.current) {
      pendingKitEventsRef.current.push({
        event,
        payload: {
          ...payload,
          source: "kit",
        },
      });
      return;
    }

    void kitDisplayChannelRef.current.send({
      type: "broadcast",
      event,
      payload: {
        ...payload,
        source: "kit",
      },
    });
  };

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("kitclaim-display").subscribe((status) => {
      if (status === "SUBSCRIBED") {
        kitDisplayReadyRef.current = true;

        if (pendingKitEventsRef.current.length > 0) {
          const queued = [...pendingKitEventsRef.current];
          pendingKitEventsRef.current = [];
          queued.forEach((queuedEvent) => {
            void channel.send({
              type: "broadcast",
              event: queuedEvent.event,
              payload: queuedEvent.payload,
            });
          });
        }
      }
    });
    kitDisplayChannelRef.current = channel;
    return () => {
      kitDisplayReadyRef.current = false;
      pendingKitEventsRef.current = [];
      supabase.removeChannel(channel);
    };
  }, []);

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
      if (typeof parsed.committeeName === "string" && committeeNames.includes(parsed.committeeName as (typeof committeeNames)[number])) {
        setCommitteeName(parsed.committeeName as (typeof committeeNames)[number]);
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
    if (isAuthenticated && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (modal) return;
      if (event.key === "Enter") {
        void handleScan(manualCode);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthenticated, manualCode, modal]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCommitteeName = committeeName.trim();

    if (!committeeNames.includes(trimmedCommitteeName as (typeof committeeNames)[number])) {
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

    setCommitteeName(trimmedCommitteeName as (typeof committeeNames)[number]);
    setIsAuthenticated(true);
    setError("");
  }

  async function handleScan(rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;

    setProcessing(true);
    setError("");
    setManualCode("");

    try {
      const lookupRes = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeKey: value, attendeeId: value, committeeName }),
      });

      if (!lookupRes.ok) {
        setError("Attendee not found.");
        return;
      }

      const lookup = await lookupRes.json();
      const attendeeId = lookup.attendeeId ?? value;

      let paymentStatus: "pending" | "paid" = "pending";
      let kitState: KitState = { toteBag: false, mug: false, notebook: false, pencil: false, claimedAt: null, claimedByCommittee: null };

      try {
        const paymentRes = await fetch(`/api/qr/payment?attendeeId=${encodeURIComponent(attendeeId)}`);
        if (paymentRes.ok) {
          const payment = await paymentRes.json();
          paymentStatus = payment?.data?.paymentStatus === "paid" ? "paid" : "pending";
        }
      } catch {
        paymentStatus = "pending";
      }

      try {
        const kitRes = await fetch(`/api/qr/kit?attendeeId=${encodeURIComponent(attendeeId)}`);
        if (kitRes.ok) {
          const kit = await kitRes.json();
          if (kit.data) {
            kitState = {
              toteBag: !!kit.data.toteBag,
              mug: !!kit.data.mug,
              notebook: !!kit.data.notebook,
              pencil: !!kit.data.pencil,
              claimedAt: kit.data.claimedAt,
              claimedByCommittee: kit.data.claimedByCommittee,
            };
          }
        }
      } catch {
        // Keep defaults.
      }

      setModal({
        attendeeId,
        fullName: lookup.fullName,
        ministry: lookup.ministry ?? "",
        church: lookup.church ?? "",
        conference: lookup.conference,
        paymentStatus,
        kit: kitState,
      });

      // Broadcast attendee name to kitclaim display only.
      sendKitDisplayEvent("kit-scan", {
        fullName: lookup.fullName,
        church: lookup.church ?? "",
        conference: lookup.conference,
      });
    } catch {
      setError("Lookup failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  function toggleKitItem(item: "toteBag" | "mug" | "notebook" | "pencil") {
    setModal((current) =>
      current
        ? {
            ...current,
            kit: {
              ...current.kit,
              [item]: !current.kit[item],
            },
          }
        : current,
    );
  }

  function checkAllKitItems() {
    setModal((current) =>
      current
        ? {
            ...current,
            kit: {
              ...current.kit,
              toteBag: true,
              mug: true,
              notebook: true,
              pencil: true,
            },
          }
        : current,
    );
  }

  async function claimKitItems(claimAll = false) {
    if (!modal) return;
    if (modal.paymentStatus !== "paid") {
      setError("Payment must be confirmed before kit can be claimed.");
      return;
    }

    const payload = claimAll
      ? { attendeeId: modal.attendeeId, committeeName, claimAll: true }
      : {
          attendeeId: modal.attendeeId,
          committeeName,
          toteBag: modal.kit.toteBag,
          mug: modal.kit.mug,
          notebook: modal.kit.notebook,
          pencil: modal.kit.pencil,
        };

    setKitProcessing(true);
    setError("");

    try {
      const res = await fetch("/api/qr/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.data) {
        setError(body.message ?? "Unable to save kit claim.");
        return;
      }

      setModal((current) => {
        if (current) {
          sendKitDisplayEvent("kit-claimed", {
            fullName: current.fullName,
            church: current.church,
            conference: current.conference,
          });
          return {
            ...current,
            kit: {
              toteBag: !!body.data.toteBag,
              mug: !!body.data.mug,
              notebook: !!body.data.notebook,
              pencil: !!body.data.pencil,
              claimedAt: body.data.claimedAt,
              claimedByCommittee: body.data.claimedByCommittee,
            },
          };
        }
        return current;
      });
    } catch {
      setError("Unable to save kit claim.");
    } finally {
      setKitProcessing(false);
    }
  }

  async function performSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch("/api/qr/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        setSearchResults([]);
        return;
      }

      const body = await res.json();
      if (Array.isArray(body.data)) {
        setSearchResults(
          body.data.map((att: any) => ({
            id: att.id,
            fullName: att.full_name,
            church: att.church,
            ministry: att.ministry,
            paymentStatus: att.payment_status || "pending",
          })),
        );
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function debounceSearch(query: string) {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      void performSearch(query);
    }, 300);
  }

  function handleUserSelect(userId: string) {
    setUserSearch("");
    setSearchResults([]);
    void handleScan(userId);
  }

  function logout() {
    setIsAuthenticated(false);
    setManualCode("");
    setModal(null);
    setSearchResults([]);
    setUserSearch("");
  }

  if (!loginReady) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-orange-950 to-orange-900 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <img src="/JSCI_CONFERENCE.png" alt="JSCI Conference" className="w-72 object-contain drop-shadow-2xl" />
          </div>
          <div className="bg-black/60 border border-orange-500/40 backdrop-blur-sm rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-black text-white mb-2">Kit Scanner</h1>
              <p className="text-orange-300 font-semibold tracking-wide">Committee Login</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-orange-200 mb-2">Committee Name</label>
                <select
                  value={committeeName}
                  onChange={(e) => setCommitteeName(e.target.value as (typeof committeeNames)[number])}
                  className="w-full px-4 py-3 bg-black/50 border-2 border-orange-500/50 rounded-xl focus:outline-none focus:border-orange-400 font-semibold text-white"
                  required
                >
                  <option value="" className="bg-black">Select committee</option>
                  {committeeNames.map((name) => (
                    <option key={name} value={name} className="bg-black">{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-orange-200 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border-2 border-orange-500/50 rounded-xl focus:outline-none focus:border-orange-400 font-semibold text-white"
                  required
                />
              </div>

              <label className="flex items-center gap-3 text-orange-200 font-semibold">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-5 h-5 accent-orange-500" />
                Remember me
              </label>

              {error && <div className="p-3 bg-red-900/40 border border-red-500/50 text-red-300 rounded-xl text-sm font-semibold">{error}</div>}

              <button type="submit" className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black py-3 rounded-xl shadow-lg shadow-orange-900/50 transition">
                Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.14),transparent_30%),linear-gradient(135deg,#140704_0%,#241008_45%,#381507_100%)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -right-24 top-24 h-96 w-96 rounded-full bg-orange-700/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col justify-center">
        <div className="space-y-6 sm:space-y-8">
          <div className="text-center">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.38em] text-orange-300/90 sm:text-xs">QR Kit Scanner</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">Kit Claim</h1>
            <p className="mt-3 text-sm text-orange-100/75 sm:text-base">Logged in as <span className="font-bold text-orange-300">{committeeName}</span></p>
          </div>

          <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 rounded-2xl border border-orange-500/30 bg-black/25 p-2 shadow-xl shadow-black/25 backdrop-blur-sm">
            <a href="/qrreader" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-black/35 px-4 text-sm font-bold text-orange-100 transition hover:border-orange-400/50 hover:bg-orange-500/10">
              Payment
            </a>
            <a href="/qrreader/lunch" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-black/35 px-4 text-sm font-bold text-orange-100 transition hover:border-orange-400/50 hover:bg-orange-500/10">
              Lunch
            </a>
          </div>

          <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-orange-500/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-7">
            <input
              ref={scanInputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            />

            <div className="relative">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-white sm:text-2xl">Search For Attendee</h2>
                  <p className="mt-1 text-sm text-orange-100/60">Search attendee names to start kit lookup.</p>
                </div>
              </div>

              <div className="relative mt-4">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    debounceSearch(e.target.value);
                  }}
                  placeholder="Type attendee name..."
                  className="h-14 w-full rounded-2xl border border-orange-500/35 bg-black/55 pl-14 pr-6 text-base font-semibold text-white placeholder-orange-100/25 outline-none transition-colors focus:border-orange-400 sm:text-lg"
                />
                <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-orange-200/65">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
              </div>

              {userSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-3 z-40">
                  {isSearching && <div className="rounded-2xl border border-orange-500/40 bg-black/90 p-4 text-center text-orange-200 shadow-xl shadow-black/30">Searching...</div>}

                  {!isSearching && searchResults.length > 0 && (
                    <div className="max-h-80 overflow-y-auto rounded-2xl border border-orange-500/40 bg-black/95 shadow-xl shadow-black/40">
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => handleUserSelect(result.id)}
                          className={`flex w-full items-start justify-between gap-3 border-b border-orange-500/10 px-4 py-4 text-left transition last:border-0 hover:bg-orange-600/15 ${
                            result.paymentStatus === "paid" ? "bg-green-900/15" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white">{result.fullName}</p>
                            {(result.ministry || result.church) && (
                              <p className="mt-1 text-xs text-orange-200/90">
                                {result.ministry && <span>{result.ministry}</span>}
                                {result.ministry && result.church && <span> • </span>}
                                {result.church && <span>{result.church}</span>}
                              </p>
                            )}
                          </div>
                          <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${result.paymentStatus === "paid" ? "border-green-500 bg-green-600/30 text-green-300" : "border-orange-500 bg-orange-600/30 text-orange-300"}`}>
                            {result.paymentStatus === "paid" ? "✓ PAID" : "PENDING"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!isSearching && searchResults.length === 0 && userSearch.length > 0 && (
                    <div className="rounded-2xl border border-orange-500/20 bg-black/90 p-4 text-center text-sm text-orange-100/60 shadow-xl shadow-black/30">
                      No attendees found. Try another name.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {processing && (
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-3 rounded-full border border-orange-500/25 bg-black/35 px-4 py-2 text-sm font-semibold text-orange-200 shadow-lg shadow-black/20">
                <div className="h-5 w-5 rounded-full border-[3px] border-orange-500 border-t-green-400 animate-spin" />
                Reading attendee...
              </div>
            </div>
          )}

          {error && (
            <div className="mx-auto w-full max-w-3xl rounded-2xl border border-red-500/40 bg-red-900/25 px-4 py-3 text-center text-sm font-semibold text-red-300 shadow-lg shadow-black/20">
              {error}
            </div>
          )}

          <div className="flex justify-center pt-2">
            <button
              onClick={logout}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>

        {modal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-neutral-950 to-orange-950 rounded-3xl border border-orange-500/30 p-8 max-w-md w-full shadow-2xl">
              <div className="text-center mb-5">
                <p className="text-orange-300 text-xs font-bold uppercase tracking-wider">{modal.conference}</p>
                <p className="text-4xl font-black text-white mt-3">{modal.fullName}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="bg-slate-950/50 rounded-lg p-3"><p className="text-xs text-gray-400 uppercase font-bold mb-1">Ministry</p><p className="text-white font-semibold">{modal.ministry || "-"}</p></div>
                <div className="bg-slate-950/50 rounded-lg p-3"><p className="text-xs text-gray-400 uppercase font-bold mb-1">Church</p><p className="text-white font-semibold">{modal.church || "-"}</p></div>
              </div>

              <div className={`rounded-lg p-4 mb-5 text-center ${modal.paymentStatus === "paid" ? "bg-green-600/20 border border-green-500/50" : "bg-orange-600/20 border border-orange-500/50"}`}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-300">Payment</p>
                <p className={`text-sm font-bold uppercase tracking-wider ${modal.paymentStatus === "paid" ? "text-green-300" : "text-orange-300"}`}>
                  {modal.paymentStatus === "paid" ? "PAID" : "PENDING"}
                </p>
              </div>

              <div className="bg-orange-600/10 border border-orange-500/40 rounded-lg p-4 mb-6">
                <p className="text-xs font-bold uppercase tracking-wider mb-3 text-orange-300 text-center">Kit Items</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <label className="flex items-center gap-2 bg-black/40 rounded px-3 py-2 cursor-pointer border border-orange-500/10"><input type="checkbox" checked={modal.kit.toteBag} onChange={() => toggleKitItem("toteBag")} className="accent-orange-500" /><span className="text-sm text-white font-semibold">Tote Bag</span></label>
                  <label className="flex items-center gap-2 bg-black/40 rounded px-3 py-2 cursor-pointer border border-orange-500/10"><input type="checkbox" checked={modal.kit.mug} onChange={() => toggleKitItem("mug")} className="accent-orange-500" /><span className="text-sm text-white font-semibold">Mug</span></label>
                  <label className="flex items-center gap-2 bg-black/40 rounded px-3 py-2 cursor-pointer border border-orange-500/10"><input type="checkbox" checked={modal.kit.notebook} onChange={() => toggleKitItem("notebook")} className="accent-orange-500" /><span className="text-sm text-white font-semibold">Notebook</span></label>
                  <label className="flex items-center gap-2 bg-black/40 rounded px-3 py-2 cursor-pointer border border-orange-500/10"><input type="checkbox" checked={modal.kit.pencil} onChange={() => toggleKitItem("pencil")} className="accent-orange-500" /><span className="text-sm text-white font-semibold">Pencil</span></label>
                </div>

                {modal.kit.claimedByCommittee && (
                  <p className="text-xs text-gray-300 text-center mb-3">
                    Last update by {modal.kit.claimedByCommittee}
                    {modal.kit.claimedAt ? ` at ${new Date(modal.kit.claimedAt).toLocaleTimeString()}` : ""}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={checkAllKitItems} className="bg-black/40 border border-orange-500/30 hover:bg-orange-500/10 text-orange-100 font-bold py-2 rounded-lg transition text-sm">CHECK ALL</button>
                  <button onClick={() => claimKitItems(true)} disabled={kitProcessing || modal.paymentStatus !== "paid"} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-bold py-2 rounded-lg transition text-sm">CLAIM ALL</button>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => claimKitItems(false)}
                  disabled={kitProcessing || modal.paymentStatus !== "paid"}
                  className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
                >
                  {kitProcessing ? "Saving..." : modal.paymentStatus === "paid" ? "CLAIM SELECTED KIT ITEMS" : "PAYMENT REQUIRED BEFORE KIT CLAIM"}
                </button>

                <button
                  onClick={() => {
                    setModal(null);
                    if (scanInputRef.current) scanInputRef.current.focus();
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
