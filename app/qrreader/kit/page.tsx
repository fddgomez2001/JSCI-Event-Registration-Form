"use client";

import { useEffect, useRef, useState } from "react";

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

      setModal((current) =>
        current
          ? {
              ...current,
              kit: {
                toteBag: !!body.data.toteBag,
                mug: !!body.data.mug,
                notebook: !!body.data.notebook,
                pencil: !!body.data.pencil,
                claimedAt: body.data.claimedAt,
                claimedByCommittee: body.data.claimedByCommittee,
              },
            }
          : current,
      );
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
      <div className="min-h-screen bg-gradient-to-br from-cyan-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-cyan-900 mb-2">Kit Scanner</h1>
            <p className="text-gray-600">Committee Login</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">Committee Name</label>
              <select
                value={committeeName}
                onChange={(e) => setCommitteeName(e.target.value as (typeof committeeNames)[number])}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-cyan-500 font-semibold"
                required
              >
                <option value="">Select committee</option>
                {committeeNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-cyan-500 font-semibold"
                required
              />
            </div>

            <label className="flex items-center gap-3 text-gray-700 font-semibold">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-5 h-5 accent-cyan-600" />
              Remember me
            </label>

            {error && <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-xl text-sm font-semibold">{error}</div>}

            <button type="submit" className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black py-3 rounded-xl hover:shadow-lg transition">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-900 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <p className="text-cyan-300 font-bold text-sm tracking-widest uppercase">QR Kit Scanner</p>
          <h1 className="text-4xl font-black text-white mt-2">Kit Claim</h1>
          <p className="text-cyan-100 mt-2">Logged in as <span className="font-bold text-cyan-200">{committeeName}</span></p>
          <div className="mt-4 flex gap-2 justify-center">
            <a href="/qrreader" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold">Payment</a>
            <a href="/qrreader/lunch" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">Lunch</a>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-500/30 p-8 mb-8">
          <label className="block text-center mb-4">
            <p className="text-cyan-300 font-bold text-sm uppercase tracking-wider mb-3">Scan QR or Paste ID</p>
            <input
              ref={scanInputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan USB QR code or paste ID..."
              className="w-full px-6 py-4 bg-slate-950 border-2 border-cyan-500/50 text-white text-lg font-semibold rounded-xl placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-center"
            />
          </label>

          <div className="mb-6 relative">
            <label className="block text-center mb-3">
              <p className="text-cyan-300 font-bold text-sm uppercase tracking-wider mb-3">Or Search for User</p>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  debounceSearch(e.target.value);
                }}
                placeholder="Type attendee name..."
                className="w-full px-6 py-4 bg-slate-950 border-2 border-cyan-500/50 text-white text-lg font-semibold rounded-xl placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-center"
              />
            </label>

            {userSearch.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 z-40">
                {isSearching && <div className="bg-slate-950 border border-cyan-500/50 rounded-lg p-4 text-center text-cyan-200">Searching...</div>}

                {!isSearching && searchResults.length > 0 && (
                  <div className="bg-slate-950 border border-cyan-500/50 rounded-lg overflow-hidden max-h-80 overflow-y-auto shadow-lg">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleUserSelect(result.id)}
                        className="w-full px-4 py-3 text-left hover:bg-cyan-700/20 transition border-b border-slate-800 last:border-0 flex items-start justify-between"
                      >
                        <div>
                          <p className="text-white font-bold">{result.fullName}</p>
                          {(result.ministry || result.church) && (
                            <p className="text-cyan-200 text-xs mt-1">
                              {result.ministry && <span>{result.ministry}</span>}
                              {result.ministry && result.church && <span> • </span>}
                              {result.church && <span>{result.church}</span>}
                            </p>
                          )}
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ml-2 ${result.paymentStatus === "paid" ? "bg-green-600/40 border border-green-500 text-green-300" : "bg-orange-600/40 border border-orange-500 text-orange-300"}`}>
                          {result.paymentStatus === "paid" ? "PAID" : "PENDING"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {processing && <p className="text-center text-cyan-200 font-semibold">Reading attendee...</p>}
          {error && <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 text-red-300 rounded-lg text-center text-sm font-semibold">{error}</div>}
        </div>

        <div className="text-center">
          <button onClick={logout} className="px-6 py-2 bg-red-600/80 hover:bg-red-700 text-white font-bold rounded-lg transition">Logout</button>
        </div>

        {modal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-cyan-500/30 p-8 max-w-md w-full shadow-2xl">
              <div className="text-center mb-5">
                <p className="text-cyan-300 text-xs font-bold uppercase tracking-wider">{modal.conference}</p>
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

              <div className="bg-cyan-600/10 border border-cyan-500/40 rounded-lg p-4 mb-6">
                <p className="text-xs font-bold uppercase tracking-wider mb-3 text-cyan-300 text-center">Kit Items</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <label className="flex items-center gap-2 bg-slate-950/50 rounded px-3 py-2 cursor-pointer"><input type="checkbox" checked={modal.kit.toteBag} onChange={() => toggleKitItem("toteBag")} className="accent-cyan-500" /><span className="text-sm text-white font-semibold">Tote Bag</span></label>
                  <label className="flex items-center gap-2 bg-slate-950/50 rounded px-3 py-2 cursor-pointer"><input type="checkbox" checked={modal.kit.mug} onChange={() => toggleKitItem("mug")} className="accent-cyan-500" /><span className="text-sm text-white font-semibold">Mug</span></label>
                  <label className="flex items-center gap-2 bg-slate-950/50 rounded px-3 py-2 cursor-pointer"><input type="checkbox" checked={modal.kit.notebook} onChange={() => toggleKitItem("notebook")} className="accent-cyan-500" /><span className="text-sm text-white font-semibold">Notebook</span></label>
                  <label className="flex items-center gap-2 bg-slate-950/50 rounded px-3 py-2 cursor-pointer"><input type="checkbox" checked={modal.kit.pencil} onChange={() => toggleKitItem("pencil")} className="accent-cyan-500" /><span className="text-sm text-white font-semibold">Pencil</span></label>
                </div>

                {modal.kit.claimedByCommittee && (
                  <p className="text-xs text-gray-300 text-center mb-3">
                    Last update by {modal.kit.claimedByCommittee}
                    {modal.kit.claimedAt ? ` at ${new Date(modal.kit.claimedAt).toLocaleTimeString()}` : ""}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={checkAllKitItems} className="bg-cyan-700/70 hover:bg-cyan-700 text-white font-bold py-2 rounded-lg transition text-sm">CHECK ALL</button>
                  <button onClick={() => claimKitItems(true)} disabled={kitProcessing || modal.paymentStatus !== "paid"} className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-bold py-2 rounded-lg transition text-sm">CLAIM ALL</button>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => claimKitItems(false)}
                  disabled={kitProcessing || modal.paymentStatus !== "paid"}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
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
