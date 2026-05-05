"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { createClient as createSupabaseClient } from "../../utils/supabase/client";

type CallerSlug = "cathy" | "jewel" | "geneveve";
type Conference = "cebu" | "leyte";
type CallStatus = "available" | "calling" | "confirmed" | "not_attending" | "follow_up_needed" | "no_number";

type CallerDashboardProps = {
  callerSlug: CallerSlug;
  displayName: string;
};

type AttendeeRow = {
  attendeeId?: string;
  attendeeKey: string;
  sourceType: "individual" | "bulk";
  sourceId: string;
  sourceIndex: number;
  conference: Conference;
  fullName: string;
  phoneNumber: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  callStatus: CallStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  callLockExpiresAt: string | null;
  statusSetBy: string | null;
  statusSetAt: string | null;
  numberRequestedAt: string | null;
  numberRequestedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type AttendeeResponse = {
  attendees?: AttendeeRow[];
  error?: string;
};

type StatusOption = {
  value: Exclude<CallStatus, "available" | "calling">;
  label: string;
  tone: string;
};

const sharedPassword = "JesusIsLord!";
const DEFAULT_PUBLIC_APP_URL = "https://jsci-conference.vercel.app";

const statusOptions: StatusOption[] = [
  {
    value: "confirmed",
    label: "Confirmed",
    tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25",
  },
  {
    value: "not_attending",
    label: "Not Attending",
    tone: "bg-rose-500/15 text-rose-200 ring-rose-400/25",
  },
  {
    value: "follow_up_needed",
    label: "Follow-Up Needed",
    tone: "bg-amber-500/15 text-amber-100 ring-amber-400/25",
  },
];

const conferenceLabels: Record<Conference, string> = {
  cebu: "Cebu",
  leyte: "Leyte",
};

const statusLabels: Record<CallStatus, string> = {
  available: "Available",
  calling: "On Call",
  confirmed: "Confirmed",
  not_attending: "Not Attending",
  follow_up_needed: "Follow-Up Needed",
  no_number: "No Number",
};

const statusPriority: Record<CallStatus, number> = {
  calling: 0,
  available: 1,
  no_number: 1.5,
  follow_up_needed: 2,
  confirmed: 3,
  not_attending: 4,
};

function buildStorageKey(slug: CallerSlug) {
  return `caller-dashboard-access:${slug}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildTelHref(phoneNumber: string) {
  if (!phoneNumber) return "";
  const cleaned = phoneNumber.replace(/[^0-9+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function isLockActive(row: AttendeeRow) {
  if (!row.claimedBy || !row.callLockExpiresAt) return false;
  const expiresAt = new Date(row.callLockExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function fileSafeName(value: string) {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function downloadFile(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

async function buildQrWebp(attendeeId: string, fullName: string) {
  const cleanId = String(attendeeId ?? "").trim();
  const configuredBaseUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = configuredBaseUrl || DEFAULT_PUBLIC_APP_URL || runtimeOrigin;
  const qrContent = `${baseUrl.replace(/\/$/, "")}/qrreader?code=${encodeURIComponent(cleanId)}`;
  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1200,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    type: "image/png",
  });

  const image = new Image();
  image.src = qrDataUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 640;

  const context = canvas.getContext("2d");
  if (!context) {
    return qrDataUrl;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#111827";
  context.fillRect(32, 32, 448, 576);

  context.fillStyle = "#ffffff";
  context.fillRect(48, 48, 416, 544);

  const qrSize = 360;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 78;
  context.drawImage(image, qrX, qrY, qrSize, qrSize);

  context.fillStyle = "#111827";
  context.textAlign = "center";
  context.font = "700 22px Arial";
  context.fillText("Attendee QR Code", canvas.width / 2, 492);

  context.font = "600 18px Arial";
  context.fillText(fullName, canvas.width / 2, 528);

  context.font = "500 14px Arial";
  context.fillStyle = "#4b5563";
  context.fillText(qrContent, canvas.width / 2, 558);

  const pngUrl = canvas.toDataURL("image/png");
  return pngUrl;
}

function getCallerDisplayName(slug: CallerSlug) {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export default function CallerDashboard({ callerSlug, displayName }: CallerDashboardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [search, setSearch] = useState("");
  const [conferenceFilter, setConferenceFilter] = useState<"all" | Conference>("all");
  const [callFilter, setCallFilter] = useState<"all" | CallStatus>("all");
  const [busyKey, setBusyKey] = useState("");
  const [qrBusyKey, setQrBusyKey] = useState("");
  const [qrPreview, setQrPreview] = useState<{ fullName: string; dataUrl: string } | null>(null);
  const [noNumberModalOpen, setNoNumberModalOpen] = useState(false);
  const [noNumberModalFor, setNoNumberModalFor] = useState<AttendeeRow | null>(null);
  const [actionRequiredModalOpen, setActionRequiredModalOpen] = useState(false);
  const [actionRequiredFor, setActionRequiredFor] = useState<AttendeeRow | null>(null);
  const [nextAttendeeToCall, setNextAttendeeToCall] = useState<AttendeeRow | null>(null);

  const supabase = useMemo(() => createSupabaseClient(), []);
  const callerName = useMemo(
    () => displayName || getCallerDisplayName(callerSlug),
    [callerSlug, displayName],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsAuthenticated(window.sessionStorage.getItem(buildStorageKey(callerSlug)) === "1");
  }, [callerSlug]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let mounted = true;
    let refreshDebounceTimer: number | null = null;

    async function loadData(showFullLoading = false) {
      if (showFullLoading) {
        setIsLoading(true);
      }
      setStatusMessage("");

      try {
        const response = await fetch("/api/callers", { cache: "no-store" });
        const data = (await response.json()) as AttendeeResponse;

        if (!mounted) return;

        if (!response.ok) {
          setStatusMessage(data.error ?? "Unable to load attendee queue.");
          setAttendees([]);
          return;
        }

        setAttendees(Array.isArray(data.attendees) ? data.attendees : []);
      } catch {
        if (mounted) {
          setStatusMessage("Network error while loading attendee queue.");
        }
      } finally {
        if (mounted) {
          if (showFullLoading) {
            setIsLoading(false);
          }
          setIsRefreshing(false);
        }
      }
    }

    const scheduleRefresh = () => {
      if (!mounted || document.hidden) return;
      if (refreshDebounceTimer) return;
      setIsRefreshing(true);
      refreshDebounceTimer = window.setTimeout(() => {
        refreshDebounceTimer = null;
        void loadData(false);
      }, 700);
    };

    void loadData(true);

    const refreshTimer = window.setInterval(() => {
      scheduleRefresh();
    }, 45000);

    const channel = supabase
      .channel(`caller-attendees-${callerSlug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendee_call_queue" },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      mounted = false;
      if (refreshDebounceTimer) {
        window.clearTimeout(refreshDebounceTimer);
      }
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [callerSlug, isAuthenticated, supabase]);

  const filteredAttendees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return attendees
      .filter((row) => {
        if (conferenceFilter !== "all" && row.conference !== conferenceFilter) {
          return false;
        }

        if (callFilter !== "all" && row.callStatus !== callFilter) {
          return false;
        }

        if (!query) return true;

        return [
          row.fullName,
          row.phoneNumber,
          row.church,
          row.ministry,
          row.address,
          row.localChurchPastor,
          row.claimedBy ?? "",
          row.statusSetBy ?? "",
          statusLabels[row.callStatus],
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        const priority = statusPriority[left.callStatus] - statusPriority[right.callStatus];
        if (priority !== 0) return priority;
        return left.fullName.localeCompare(right.fullName);
      });
  }, [attendees, callFilter, conferenceFilter, search]);

  const summary = useMemo(() => {
    const totals = {
      cebu: 0,
      leyte: 0,
      available: 0,
      calling: 0,
      confirmed: 0,
      not_attending: 0,
      follow_up_needed: 0,
      no_number: 0,
    };

    attendees.forEach((row) => {
      totals[row.conference] += 1;
      totals[row.callStatus] += 1;
    });

    return totals;
  }, [attendees]);

  async function loadAttendeesSilently() {
    if (!isAuthenticated) return;

    try {
      const response = await fetch("/api/callers", { cache: "no-store" });
      const data = (await response.json()) as AttendeeResponse;

      if (!response.ok) {
        setStatusMessage(data.error ?? "Unable to load attendee queue.");
        return;
      }

      setAttendees(Array.isArray(data.attendees) ? data.attendees : []);
    } catch {
      setStatusMessage("Network error while refreshing attendee queue.");
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== sharedPassword) {
      setLoginError("Invalid password.");
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(buildStorageKey(callerSlug), "1");
    }

    setLoginError("");
    setIsAuthenticated(true);
    setPassword("");
    setStatusMessage(`Welcome ${callerName}!`);
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(buildStorageKey(callerSlug));
    }

    setIsAuthenticated(false);
    setPassword("");
    setLoginError("");
    setStatusMessage("Logged out.");
  }

  async function callAttendee(row: AttendeeRow) {
    // Check if phone number exists
    if (!row.phoneNumber) {
      setNoNumberModalFor(row);
      setNoNumberModalOpen(true);
      return;
    }

    // Check if caller has a calling status attendee
    const callerCallingAttendee = attendees.find((a) => a.callStatus === "calling" && a.claimedBy === callerName);
    if (callerCallingAttendee && callerCallingAttendee.attendeeKey !== row.attendeeKey) {
      setActionRequiredFor(callerCallingAttendee);
      setNextAttendeeToCall(row);
      setActionRequiredModalOpen(true);
      return;
    }

    setBusyKey(row.attendeeKey);
    setStatusMessage("");

    try {
      const response = await fetch("/api/callers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          attendeeKey: row.attendeeKey,
          callerName,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatusMessage(data.error ?? "Unable to claim attendee.");
        return;
      }

      await loadAttendeesSilently();

      const callHref = buildTelHref(row.phoneNumber);
      if (callHref) {
        window.location.href = callHref;
      }

      setStatusMessage(`Calling ${row.fullName} as ${callerName}.`);
    } catch {
      setStatusMessage("Network error while claiming attendee.");
    } finally {
      setBusyKey("");
    }
  }

  async function requestNumber(row: AttendeeRow) {
    setBusyKey(row.attendeeKey);
    setStatusMessage("");

    try {
      const response = await fetch("/api/callers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_number",
          attendeeKey: row.attendeeKey,
          callerName,
          fullName: row.fullName,
          conference: row.conference,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatusMessage(data.error ?? "Unable to request number.");
        return;
      }

      await loadAttendeesSilently();
      setNoNumberModalOpen(false);
      setNoNumberModalFor(null);
      setStatusMessage(`Number requested for ${row.fullName}. Admin will be notified.`);
    } catch {
      setStatusMessage("Network error while requesting number.");
    } finally {
      setBusyKey("");
    }
  }

  async function completeActionAndCall(currentRow: AttendeeRow, nextStatus: Exclude<CallStatus, "available" | "calling">, nextRow: AttendeeRow) {
    setBusyKey(`complete-${currentRow.attendeeKey}`);
    setStatusMessage("");

    try {
      // First, set the status on the current row
      const response = await fetch("/api/callers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          attendeeKey: currentRow.attendeeKey,
          callerName,
          status: nextStatus,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatusMessage(data.error ?? "Unable to update attendee status.");
        return;
      }

      await loadAttendeesSilently();
      setActionRequiredModalOpen(false);
      setActionRequiredFor(null);
      setNextAttendeeToCall(null);
      setStatusMessage(`${currentRow.fullName} marked as ${statusLabels[nextStatus]}. Ready to call next.`);

      // Now call the next attendee
      setTimeout(() => {
        void callAttendee(nextRow);
      }, 500);
    } catch {
      setStatusMessage("Network error while updating attendee status.");
    } finally {
      setBusyKey("");
    }
  }

  async function setCallStatus(row: AttendeeRow, nextStatus: Exclude<CallStatus, "available" | "calling">) {
    setBusyKey(`${row.attendeeKey}:${nextStatus}`);
    setStatusMessage("");

    try {
      const response = await fetch("/api/callers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          attendeeKey: row.attendeeKey,
          callerName,
          status: nextStatus,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatusMessage(data.error ?? "Unable to update attendee status.");
        return;
      }

      await loadAttendeesSilently();
      setStatusMessage(`${row.fullName} marked as ${statusLabels[nextStatus]}.`);
    } catch {
      setStatusMessage("Network error while updating attendee status.");
    } finally {
      setBusyKey("");
    }
  }

  async function openQrPreview(row: AttendeeRow) {
    setQrBusyKey(row.attendeeKey);

    try {
      const idForQr = row.attendeeId ?? row.attendeeKey;
      const dataUrl = await buildQrWebp(idForQr, row.fullName);
      setQrPreview({ fullName: row.fullName, dataUrl });
    } catch {
      setStatusMessage("Unable to generate QR code.");
    } finally {
      setQrBusyKey("");
    }
  }

  const dashboardHeader = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/80">
          Caller Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Welcome {callerName}!
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/85 sm:text-base">
          Manage Cebu and Leyte attendees, reserve a row before calling, and keep statuses in sync in real time across Cathy, Jewel, and Geneveve.
        </p>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
      >
        Logout
      </button>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(249,168,37,0.24),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.20),transparent_28%),linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#2a1a1f_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
          <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/8 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col justify-between gap-8 border-b border-white/10 p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-200/80">Joyful Sound Church</p>
                <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                  Welcome {callerName}!
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-200/85">
                  Enter the shared caller password to access the live attendee directory, lock a person before calling, and update their response immediately.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Cebu</p>
                  <p className="mt-2 text-2xl font-black text-amber-200">{summary.cebu}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Leyte</p>
                  <p className="mt-2 text-2xl font-black text-amber-200">{summary.leyte}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Total</p>
                  <p className="mt-2 text-2xl font-black text-amber-200">{attendees.length}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center p-8 sm:p-10">
              <form onSubmit={handleLogin} className="w-full max-w-md rounded-[1.75rem] border border-amber-200/20 bg-slate-950/45 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.35)]">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-200">Protected Access</p>
                <label className="mt-6 block text-sm font-medium text-slate-200" htmlFor="caller-password">
                  Password
                </label>
                <input
                  id="caller-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="JesusIsLord!"
                  className="mt-2 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-amber-300/60 focus:bg-white/12"
                  autoComplete="current-password"
                />

                {loginError ? <p className="mt-3 text-sm text-rose-200">{loginError}</p> : null}

                <button
                  type="submit"
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105"
                >
                  Enter Dashboard
                </button>

                <p className="mt-4 text-sm leading-6 text-slate-300">
                  This dashboard is reserved for {callerName}. After login you will see real-time call locking, status buttons, and QR export for each attendee.
                </p>
              </form>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(249,168,37,0.24),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.22),transparent_28%),linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#2a1a1f_100%)] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1600px] flex-col gap-5">
        <section className="rounded-[2rem] border border-white/10 bg-white/8 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-8">
          {dashboardHeader}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "Total Attendees", value: attendees.length, tone: "text-amber-200" },
              { label: "Cebu", value: summary.cebu, tone: "text-sky-200" },
              { label: "Leyte", value: summary.leyte, tone: "text-violet-200" },
              { label: "On Call", value: summary.calling, tone: "text-emerald-200" },
              { label: "Confirmed", value: summary.confirmed, tone: "text-emerald-200" },
              { label: "Follow-Up", value: summary.follow_up_needed, tone: "text-amber-200" },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{card.label}</p>
                <p className={`mt-2 text-3xl font-black ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_auto] lg:items-end">
            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Search attendee</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, church, phone, caller, or status"
                className="mt-2 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-amber-300/60 focus:bg-white/12"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Conference</span>
              <select
                value={conferenceFilter}
                onChange={(event) => setConferenceFilter(event.target.value as "all" | Conference)}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/60 focus:bg-white/12"
              >
                <option value="all" className="text-slate-900">All</option>
                <option value="cebu" className="text-slate-900">Cebu</option>
                <option value="leyte" className="text-slate-900">Leyte</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-200">Status</span>
              <select
                value={callFilter}
                onChange={(event) => setCallFilter(event.target.value as "all" | CallStatus)}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/60 focus:bg-white/12"
              >
                <option value="all" className="text-slate-900">All statuses</option>
                <option value="available" className="text-slate-900">Available</option>
                <option value="calling" className="text-slate-900">On Call</option>
                <option value="no_number" className="text-slate-900">No Number</option>
                <option value="confirmed" className="text-slate-900">Confirmed</option>
                <option value="not_attending" className="text-slate-900">Not Attending</option>
                <option value="follow_up_needed" className="text-slate-900">Follow-Up Needed</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">Caller: {callerName}</span>
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">Password: shared</span>
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
              {isLoading ? "Loading..." : isRefreshing ? "Refreshing..." : "Live"}
            </span>
          </div>

          {statusMessage ? <p className="mt-4 text-sm text-amber-200">{statusMessage}</p> : null}
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/40 shadow-[0_24px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="bg-white/8 text-xs uppercase tracking-[0.2em] text-slate-300">
                  <th className="sticky left-0 z-10 border-b border-white/10 bg-slate-950/90 px-5 py-4">Attendee</th>
                  <th className="border-b border-white/10 px-5 py-4">Conference</th>
                  <th className="border-b border-white/10 px-5 py-4">Phone</th>
                  <th className="border-b border-white/10 px-5 py-4">Church</th>
                  <th className="border-b border-white/10 px-5 py-4">Status</th>
                  <th className="border-b border-white/10 px-5 py-4">Caller</th>
                  <th className="border-b border-white/10 px-5 py-4">QR</th>
                  <th className="border-b border-white/10 px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.length ? filteredAttendees.map((row) => {
                  const lockedByOther = isLockActive(row) && row.claimedBy !== callerName;
                  const callHref = buildTelHref(row.phoneNumber);

                  return (
                    <tr key={row.attendeeKey} className="group border-b border-white/8 text-sm text-slate-100 transition hover:bg-white/5">
                      <td className="sticky left-0 z-10 border-b border-white/8 bg-slate-950/90 px-5 py-4 align-top">
                        <div className="font-semibold text-white">{row.fullName}</div>
                        <div className="mt-1 text-xs text-slate-300">{row.ministry || "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.address || "-"}</div>
                      </td>
                      <td className="border-b border-white/8 px-5 py-4 align-top text-slate-200">{conferenceLabels[row.conference]}</td>
                      <td className="border-b border-white/8 px-5 py-4 align-top text-slate-200">{row.phoneNumber || "-"}</td>
                      <td className="border-b border-white/8 px-5 py-4 align-top text-slate-200">{row.church || "-"}</td>
                      <td className="border-b border-white/8 px-5 py-4 align-top">
                        <div className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ring-1 ${
                          row.callStatus === "confirmed"
                            ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25"
                            : row.callStatus === "not_attending"
                              ? "bg-rose-500/15 text-rose-200 ring-rose-400/25"
                              : row.callStatus === "follow_up_needed"
                                ? "bg-amber-500/15 text-amber-100 ring-amber-400/25"
                                : row.callStatus === "calling"
                                  ? "bg-sky-500/15 text-sky-100 ring-sky-400/25"
                                  : row.callStatus === "no_number"
                                    ? "bg-orange-500/15 text-orange-200 ring-orange-400/25"
                                    : "bg-white/8 text-slate-200 ring-white/15"
                        }`}>
                          {statusLabels[row.callStatus]}
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {row.claimedBy ? `Called by ${row.claimedBy}` : "Not claimed yet"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Updated: {formatDate(row.statusSetAt ?? row.updatedAt)}</div>
                      </td>
                      <td className="border-b border-white/8 px-5 py-4 align-top text-slate-200">
                        <div className="font-semibold text-white">{row.claimedBy ?? "-"}</div>
                        <div className="mt-1 text-xs text-slate-400">{row.claimedAt ? formatDate(row.claimedAt) : "-"}</div>
                      </td>
                      <td className="border-b border-white/8 px-5 py-4 align-top">
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              setQrBusyKey(row.attendeeKey);
                              try {
                                const idForQr = row.attendeeId ?? row.attendeeKey;
                                const dataUrl = await buildQrWebp(idForQr, row.fullName);
                                setQrPreview({ fullName: row.fullName, dataUrl });
                              } catch {
                                setStatusMessage("Unable to generate QR code.");
                              } finally {
                                setQrBusyKey("");
                              }
                            })();
                          }}
                          disabled={qrBusyKey === row.attendeeKey}
                          className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {qrBusyKey === row.attendeeKey ? "Building..." : "QR"}
                        </button>
                      </td>
                      <td className="border-b border-white/8 px-5 py-4 align-top">
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => void callAttendee(row)}
                            disabled={!callHref || lockedByOther || busyKey === row.attendeeKey || row.callStatus === "confirmed" || row.callStatus === "not_attending"}
                            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyKey === row.attendeeKey ? "Calling..." : lockedByOther ? `Locked by ${row.claimedBy}` : "Call"}
                          </button>

                          <div className="flex flex-wrap justify-end gap-2">
                            {statusOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => void setCallStatus(row, option.value)}
                                disabled={busyKey === `${row.attendeeKey}:${option.value}` || lockedByOther || row.callStatus === option.value || row.callStatus === "confirmed" || row.callStatus === "not_attending"}
                                className={`rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-60 ${option.tone}`}
                              >
                                {busyKey === `${row.attendeeKey}:${option.value}` ? "Saving..." : option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-300">
                      No attendees matched your current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {qrPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">QR Preview</p>
                <h2 className="mt-2 text-2xl font-black text-white">{qrPreview.fullName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-white/12"
              >
                Close
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white p-3">
              <img src={qrPreview.dataUrl} alt={`${qrPreview.fullName} QR code`} className="h-auto w-full rounded-[1rem]" />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => downloadFile(qrPreview.dataUrl, `${fileSafeName(qrPreview.fullName) || "attendee-qr"}.webp`)}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-300 to-orange-400 px-4 py-2.5 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105"
              >
                Download WebP
              </button>
              <button
                type="button"
                onClick={() => setQrPreview(null)}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noNumberModalOpen && noNumberModalFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-200/80">⚠️ Attendee No Number</p>
                <h2 className="mt-2 text-2xl font-black text-white">{noNumberModalFor.fullName}</h2>
                <p className="mt-3 text-sm text-slate-300">This attendee does not have a phone number on file. Request the admin to add one so you can make the call.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNoNumberModalOpen(false);
                  setNoNumberModalFor(null);
                }}
                className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-white/12"
              >
                Close
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void requestNumber(noNumberModalFor)}
                disabled={busyKey === noNumberModalFor.attendeeKey}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-300 to-amber-400 px-4 py-2.5 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyKey === noNumberModalFor.attendeeKey ? "Requesting..." : "Request Number"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoNumberModalOpen(false);
                  setNoNumberModalFor(null);
                }}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionRequiredModalOpen && actionRequiredFor && nextAttendeeToCall ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200/80">⏸️ Action Required</p>
                <h2 className="mt-2 text-xl font-black text-white">You have not yet taken an action on:</h2>
                <p className="mt-3 text-base font-bold text-amber-200">{actionRequiredFor.fullName}</p>
                <p className="mt-2 text-sm text-slate-300">Please complete their call status before calling {nextAttendeeToCall.fullName}.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionRequiredModalOpen(false);
                  setActionRequiredFor(null);
                  setNextAttendeeToCall(null);
                }}
                className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-white/12"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void completeActionAndCall(actionRequiredFor, "confirmed", nextAttendeeToCall)}
                  disabled={busyKey.startsWith("complete-")}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/25 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyKey === `complete-${actionRequiredFor.attendeeKey}` ? "Saving..." : "✓ Confirmed"}
                </button>
                <button
                  type="button"
                  onClick={() => void completeActionAndCall(actionRequiredFor, "not_attending", nextAttendeeToCall)}
                  disabled={busyKey.startsWith("complete-")}
                  className="inline-flex items-center justify-center rounded-full bg-rose-500/15 border border-rose-400/25 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.16em] text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyKey === `complete-${actionRequiredFor.attendeeKey}` ? "Saving..." : "✗ Not Attending"}
                </button>
                <button
                  type="button"
                  onClick={() => void completeActionAndCall(actionRequiredFor, "follow_up_needed", nextAttendeeToCall)}
                  disabled={busyKey.startsWith("complete-")}
                  className="inline-flex items-center justify-center rounded-full bg-amber-500/15 border border-amber-400/25 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.16em] text-amber-200 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyKey === `complete-${actionRequiredFor.attendeeKey}` ? "Saving..." : "⟳ Follow-Up Needed"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionRequiredModalOpen(false);
                  setActionRequiredFor(null);
                  setNextAttendeeToCall(null);
                }}
                className="w-full inline-flex items-center justify-center rounded-full border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}