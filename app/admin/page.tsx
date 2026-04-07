"use client";

import { FormEvent, useMemo, useState } from "react";

type AdminTab = "dashboard" | "registrations";
type RegistrationView = "all" | "bulk";

type IndividualRow = {
  id: string;
  full_name: string;
  church: string;
  ministry: string;
  address: string;
  local_church_pastor: string;
  phone_number: string;
  created_at: string;
};

type BulkRow = {
  id: string;
  contact_name: string;
  church: string;
  ministry: string;
  address: string;
  local_church_pastor: string;
  phone_number: string;
  attendee_count: number;
  attendee_names: string;
  created_at: string;
};

type AdminResponse = {
  individual?: IndividualRow[];
  bulk?: BulkRow[];
  error?: string;
};

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "Admin@123!";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [registrationView, setRegistrationView] = useState<RegistrationView>("all");
  const [selectedBulkId, setSelectedBulkId] = useState<string>("");
  const [individualRows, setIndividualRows] = useState<IndividualRow[]>([]);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);

  const totalAttendees = useMemo(() => {
    const individualCount = individualRows.length;
    const bulkCount = bulkRows.reduce((sum, row) => sum + (row.attendee_count || 0), 0);
    return individualCount + bulkCount;
  }, [individualRows, bulkRows]);

  const totalRegistrations = individualRows.length + bulkRows.length;

  const allRows = useMemo(() => {
    const individualMapped = individualRows.map((row) => ({
      source: "Individual",
      name: row.full_name,
      church: row.church,
      ministry: row.ministry,
      address: row.address,
      pastor: row.local_church_pastor,
      phone: row.phone_number,
      attendees: 1,
      submittedAt: row.created_at,
      rawAttendeeNames: row.full_name,
      key: `i-${row.id}`,
    }));

    const bulkMapped = bulkRows.map((row) => ({
      source: "Bulk",
      name: row.contact_name,
      church: row.church,
      ministry: row.ministry,
      address: row.address,
      pastor: row.local_church_pastor,
      phone: row.phone_number,
      attendees: row.attendee_count,
      submittedAt: row.created_at,
      rawAttendeeNames: row.attendee_names,
      key: `b-${row.id}`,
    }));

    return [...individualMapped, ...bulkMapped].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  }, [individualRows, bulkRows]);

  const sortedBulkRows = useMemo(
    () => [...bulkRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [bulkRows],
  );

  const selectedBulkRecord = useMemo(
    () => sortedBulkRows.find((row) => row.id === selectedBulkId) ?? sortedBulkRows[0],
    [selectedBulkId, sortedBulkRows],
  );

  const selectedBulkAttendees = useMemo(() => {
    if (!selectedBulkRecord) return [];

    return selectedBulkRecord.attendee_names
      .split(/\r?\n|,/)
      .map((name) => name.trim())
      .filter(Boolean);
  }, [selectedBulkRecord]);

  async function loadAdminData(loginUser: string, loginPass: string) {
    setIsLoading(true);
    setStatus("");

    try {
      const response = await fetch("/api/registrations?mode=admin", {
        headers: {
          "x-admin-username": loginUser,
          "x-admin-password": loginPass,
        },
        cache: "no-store",
      });

      const data = (await response.json()) as AdminResponse;

      if (!response.ok) {
        setStatus(data.error ?? "Unable to load admin records.");
        setIsLoading(false);
        return false;
      }

      setIndividualRows(Array.isArray(data.individual) ? data.individual : []);
      setBulkRows(Array.isArray(data.bulk) ? data.bulk : []);
      setIsLoading(false);
      return true;
    } catch {
      setStatus("Network error while loading admin records.");
      setIsLoading(false);
      return false;
    }
  }

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      setStatus("Invalid username or password.");
      return;
    }

    const ok = await loadAdminData(username, password);
    if (!ok) return;

    setIsAuthenticated(true);
    setStatus("Welcome Admin.");
    setPassword("");
  }

  async function refreshData() {
    if (!isAuthenticated) return;
    await loadAdminData(username, ADMIN_PASSWORD);
  }

  function logout() {
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    setIndividualRows([]);
    setBulkRows([]);
    setStatus("Logged out.");
    setActiveTab("dashboard");
    setRegistrationView("all");
    setSelectedBulkId("");
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] px-4 py-8 md:flex md:items-center md:justify-center">
        <section className="mx-auto w-full max-w-md rounded-3xl border border-amber-100/30 bg-slate-900/80 p-5 text-amber-50 shadow-[0_18px_45px_rgba(3,8,20,0.45)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-amber-100">Admin Login</h1>
            <a href="/" className="text-xs text-amber-300 underline underline-offset-2">
              Back to Landing Page
            </a>
          </div>

          <p className="mt-2 text-sm text-amber-200">Enter admin credentials to open the dashboard.</p>

          <form className="mt-5 grid gap-3" onSubmit={onLogin}>
            <label className="grid gap-1">
              <span className="text-sm">Username</span>
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Password</span>
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2"
              />
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-1 rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950 disabled:opacity-70"
            >
              {isLoading ? "Signing in..." : "Login to Admin"}
            </button>
          </form>

          {status ? <p className="mt-3 text-sm text-amber-200">{status}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] text-amber-50">
      <div className="grid min-h-screen md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-amber-100/20 bg-slate-900/85 p-4 md:border-b-0 md:border-r md:p-5">
          <div className="md:sticky md:top-5">
            <h2 className="text-lg font-bold text-amber-100">Admin Panel</h2>
            <p className="mt-1 text-xs text-amber-200">Event Registration Management</p>

            <nav className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  activeTab === "dashboard"
                    ? "bg-amber-200 text-slate-900"
                    : "bg-slate-900/70 text-amber-100 hover:bg-slate-800"
                }`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("registrations")}
                className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  activeTab === "registrations"
                    ? "bg-amber-200 text-slate-900"
                    : "bg-slate-900/70 text-amber-100 hover:bg-slate-800"
                }`}
              >
                Registration
              </button>
            </nav>

            <div className="mt-6 grid gap-2 text-xs">
              <button
                type="button"
                onClick={refreshData}
                className="rounded-lg border border-amber-200/40 px-3 py-2 text-amber-100 hover:bg-slate-800"
              >
                Refresh Data
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-rose-200/40 px-3 py-2 text-rose-200 hover:bg-slate-800"
              >
                Logout
              </button>
            </div>
          </div>
        </aside>

        <section className="p-4 sm:p-6">
          <div className="rounded-2xl border border-amber-100/20 bg-slate-900/60 p-4 sm:p-5">
            {activeTab === "dashboard" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                  <p className="text-xs text-amber-200">Total Attendees</p>
                  <p className="mt-2 text-3xl font-bold text-amber-100">{totalAttendees}</p>
                </article>

                <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                  <p className="text-xs text-amber-200">Individual Registrations</p>
                  <p className="mt-2 text-3xl font-bold text-amber-100">{individualRows.length}</p>
                </article>

                <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                  <p className="text-xs text-amber-200">Bulk Registrations</p>
                  <p className="mt-2 text-3xl font-bold text-amber-100">{bulkRows.length}</p>
                </article>

                <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                  <p className="text-xs text-amber-200">Total Registration Entries</p>
                  <p className="mt-2 text-3xl font-bold text-amber-100">{totalRegistrations}</p>
                </article>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-amber-100">All Attendees Information</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRegistrationView("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        registrationView === "all"
                          ? "bg-amber-200 text-slate-900"
                          : "border border-amber-100/30 text-amber-200"
                      }`}
                    >
                      All Records
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRegistrationView("bulk");
                        if (!selectedBulkId && sortedBulkRows[0]) {
                          setSelectedBulkId(sortedBulkRows[0].id);
                        }
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        registrationView === "bulk"
                          ? "bg-amber-200 text-slate-900"
                          : "border border-amber-100/30 text-amber-200"
                      }`}
                    >
                      Switch to Bulk Registration
                    </button>
                  </div>
                </div>

                {registrationView === "all" ? (
                  <div className="overflow-x-auto rounded-xl border border-amber-100/20">
                    <table className="min-w-[1100px] w-full text-left text-sm">
                      <thead className="bg-slate-900/80 text-amber-200">
                        <tr>
                          <th className="px-3 py-2">Source</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Church</th>
                          <th className="px-3 py-2">Ministry</th>
                          <th className="px-3 py-2">Address</th>
                          <th className="px-3 py-2">Pastor</th>
                          <th className="px-3 py-2">Phone</th>
                          <th className="px-3 py-2">Attendees</th>
                          <th className="px-3 py-2">Attendee Names</th>
                          <th className="px-3 py-2">Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allRows.length ? (
                          allRows.map((row) => (
                            <tr key={row.key} className="border-t border-amber-100/10 align-top">
                              <td className="px-3 py-2">{row.source}</td>
                              <td className="px-3 py-2">{row.name}</td>
                              <td className="px-3 py-2">{row.church}</td>
                              <td className="px-3 py-2">{row.ministry}</td>
                              <td className="px-3 py-2">{row.address}</td>
                              <td className="px-3 py-2">{row.pastor}</td>
                              <td className="px-3 py-2">{row.phone}</td>
                              <td className="px-3 py-2">{row.attendees}</td>
                              <td className="px-3 py-2 whitespace-pre-wrap break-words">{row.rawAttendeeNames}</td>
                              <td className="px-3 py-2">{formatDate(row.submittedAt)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={10} className="px-3 py-6 text-center text-amber-200">
                              No registrations found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="rounded-xl border border-amber-100/20 bg-slate-900/50 p-3">
                      <p className="mb-2 text-xs font-semibold text-amber-200">Bulk Contact Person List</p>
                      <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                        {sortedBulkRows.length ? (
                          sortedBulkRows.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => setSelectedBulkId(row.id)}
                              className={`w-full rounded-lg border px-3 py-2 text-left ${
                                selectedBulkRecord?.id === row.id
                                  ? "border-amber-200/70 bg-amber-100/20"
                                  : "border-amber-100/20 bg-slate-950/40 hover:bg-slate-900"
                              }`}
                            >
                              <p className="text-sm font-semibold text-amber-100">{row.contact_name}</p>
                              <p className="text-xs text-amber-200">{row.church}</p>
                            </button>
                          ))
                        ) : (
                          <p className="rounded-lg border border-amber-100/20 bg-slate-950/40 px-3 py-6 text-center text-xs text-amber-200">
                            No bulk registration contacts found.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-100/20 bg-slate-900/50 p-4">
                      {selectedBulkRecord ? (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-lg font-bold text-amber-100">{selectedBulkRecord.contact_name}</h4>
                            <p className="text-xs text-amber-200">Submitted: {formatDate(selectedBulkRecord.created_at)}</p>
                          </div>

                          <div className="grid gap-2 text-sm text-amber-100 sm:grid-cols-2">
                            <p>
                              <span className="text-amber-300">Church:</span> {selectedBulkRecord.church}
                            </p>
                            <p>
                              <span className="text-amber-300">Ministry:</span> {selectedBulkRecord.ministry}
                            </p>
                            <p>
                              <span className="text-amber-300">Pastor:</span> {selectedBulkRecord.local_church_pastor}
                            </p>
                            <p>
                              <span className="text-amber-300">Phone:</span> {selectedBulkRecord.phone_number}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-amber-300">Address:</span> {selectedBulkRecord.address}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-amber-300">Total Attendees:</span> {selectedBulkRecord.attendee_count}
                            </p>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-semibold text-amber-200">Attendees Added</p>
                            <ul className="max-h-[260px] space-y-1 overflow-y-auto rounded-lg border border-amber-100/20 bg-slate-950/40 p-3 text-sm">
                              {selectedBulkAttendees.length ? (
                                selectedBulkAttendees.map((attendee, index) => (
                                  <li key={`${attendee}-${index}`} className="text-amber-100">
                                    {index + 1}. {attendee}
                                  </li>
                                ))
                              ) : (
                                <li className="text-amber-200">No attendee names listed.</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-200">Select a contact person to view full details and attendees.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {status ? <p className="mt-3 text-sm text-amber-200">{status}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
