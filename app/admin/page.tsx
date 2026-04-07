"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AdminTab = "dashboard" | "registrations";
type RegistrationView = "all" | "bulk";
type RegistrationSource = "individual" | "bulk";
type Conference = "leyte" | "cebu";

type IndividualRow = {
  id: string;
  full_name: string;
  church: string;
  ministry: string;
  address: string;
  local_church_pastor: string;
  phone_number: string;
  conference: Conference;
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
  linked_attendees?: Array<{
    attendee_name: string;
    attendee_phone?: string;
    attendee_ministry?: string;
    attendee_church?: string;
    attendee_address?: string;
    attendee_local_church_pastor?: string;
  }>;
  conference: Conference;
  created_at: string;
};

type BulkLinkedAttendee = {
  attendee_name: string;
  attendee_phone?: string;
  attendee_ministry?: string;
  attendee_church?: string;
  attendee_address?: string;
  attendee_local_church_pastor?: string;
};

type AdminResponse = {
  individual?: IndividualRow[];
  bulk?: BulkRow[];
  error?: string;
};

type AdminRecord = {
  id: string;
  sourceType: RegistrationSource;
  sourceLabel: "Individual" | "Bulk";
  name: string;
  contactPerson: string;
  church: string;
  ministry: string;
  address: string;
  pastor: string;
  phone: string;
  attendees: number;
  attendeeNames: string;
  submittedAt: string;
  key: string;
};

type EditFormState = {
  name: string;
  church: string;
  ministry: string;
  address: string;
  pastor: string;
  phone: string;
  attendees: string;
  attendeeNames: string;
};

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "Admin@123!";
const ROWS_PER_PAGE = 15;

const defaultEditForm: EditFormState = {
  name: "",
  church: "",
  ministry: "",
  address: "",
  pastor: "",
  phone: "",
  attendees: "1",
  attendeeNames: "",
};

const baseMinistryOptions = [
  "Pastor",
  "Church Council",
  "Teacher",
  "Music",
  "Usher",
  "Ministry Head",
  "Deacons",
  "Media Team",
  "Dance",
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function conferenceLabel(conference: Conference) {
  return conference === "cebu" ? "CEBU Conference" : "LEYTE Conference";
}

function clampPage(page: number, totalPages: number) {
  if (page < 1) return 1;
  if (page > totalPages) return totalPages;
  return page;
}

function splitAttendeeNames(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [registrationView, setRegistrationView] = useState<RegistrationView>("all");
  const [selectedConference, setSelectedConference] = useState<Conference>("leyte");
  const [selectedBulkId, setSelectedBulkId] = useState<string>("");
  const [individualRows, setIndividualRows] = useState<IndividualRow[]>([]);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);

  const [allSearch, setAllSearch] = useState("");
  const [allSourceFilter, setAllSourceFilter] = useState<"all" | "individual" | "bulk">("all");
  const [allMinistryFilter, setAllMinistryFilter] = useState("all");
  const [allPage, setAllPage] = useState(1);

  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkMinistryFilter, setBulkMinistryFilter] = useState("all");
  const [bulkPage, setBulkPage] = useState(1);

  const [editingRow, setEditingRow] = useState<AdminRecord | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(defaultEditForm);
  const [isSaving, setIsSaving] = useState(false);

  const [deletingRow, setDeletingRow] = useState<AdminRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalAttendees = useMemo(() => {
    const individualCount = individualRows.length;
    const bulkCount = bulkRows.reduce((sum, row) => sum + (row.attendee_count || 0), 0);
    return individualCount + bulkCount;
  }, [individualRows, bulkRows]);

  const totalRegistrations = individualRows.length + bulkRows.length;

  const allRows = useMemo<AdminRecord[]>(() => {
    const individualMapped: AdminRecord[] = individualRows.map((row) => ({
      id: row.id,
      sourceType: "individual",
      sourceLabel: "Individual",
      name: row.full_name,
      contactPerson: "Self",
      church: row.church,
      ministry: row.ministry,
      address: row.address,
      pastor: row.local_church_pastor,
      phone: row.phone_number,
      attendees: 1,
      attendeeNames: row.full_name,
      submittedAt: row.created_at,
      key: `i-${row.id}`,
    }));

    const bulkMapped: AdminRecord[] = bulkRows.flatMap((row) => {
      const linkedAttendees: BulkLinkedAttendee[] = row.linked_attendees?.length
        ? row.linked_attendees
        : splitAttendeeNames(row.attendee_names).map((name) => ({ attendee_name: name }));

      return linkedAttendees.map((attendee, index) => ({
        id: row.id,
        sourceType: "bulk",
        sourceLabel: "Bulk",
        name: attendee.attendee_name,
        contactPerson: row.contact_name,
        church: attendee.attendee_church ?? row.church,
        ministry: attendee.attendee_ministry ?? row.ministry,
        address: attendee.attendee_address ?? row.address,
        pastor: attendee.attendee_local_church_pastor ?? row.local_church_pastor,
        phone: attendee.attendee_phone ?? row.phone_number,
        attendees: 1,
        attendeeNames: attendee.attendee_name,
        submittedAt: row.created_at,
        key: `b-${row.id}-${index}`,
      }));
    });

    return [...individualMapped, ...bulkMapped].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  }, [individualRows, bulkRows]);

  const ministryOptions = useMemo(() => {
    const values = new Set(baseMinistryOptions);
    allRows.forEach((row) => {
      const trimmed = row.ministry.trim();
      if (trimmed) values.add(trimmed);
    });
    return Array.from(values);
  }, [allRows]);

  const sortedBulkRows = useMemo(
    () => [...bulkRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [bulkRows],
  );

  const filteredAllRows = useMemo(() => {
    const query = allSearch.trim().toLowerCase();

    return allRows.filter((row) => {
      if (allSourceFilter !== "all" && row.sourceType !== allSourceFilter) return false;
      if (allMinistryFilter !== "all" && row.ministry !== allMinistryFilter) return false;
      if (!query) return true;

      return [
        row.sourceLabel,
        row.name,
        row.contactPerson,
        row.church,
        row.ministry,
        row.address,
        row.pastor,
        row.phone,
        row.attendeeNames,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [allRows, allSearch, allSourceFilter, allMinistryFilter]);

  const allTotalPages = Math.max(1, Math.ceil(filteredAllRows.length / ROWS_PER_PAGE));
  const paginatedAllRows = filteredAllRows.slice((allPage - 1) * ROWS_PER_PAGE, allPage * ROWS_PER_PAGE);

  const filteredBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLowerCase();

    return sortedBulkRows.filter((row) => {
      if (bulkMinistryFilter !== "all" && row.ministry !== bulkMinistryFilter) return false;
      if (!query) return true;

      return [
        row.contact_name,
        row.church,
        row.ministry,
        row.address,
        row.local_church_pastor,
        row.phone_number,
        row.attendee_names,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [sortedBulkRows, bulkSearch, bulkMinistryFilter]);

  const bulkTotalPages = Math.max(1, Math.ceil(filteredBulkRows.length / ROWS_PER_PAGE));
  const paginatedBulkRows = filteredBulkRows.slice((bulkPage - 1) * ROWS_PER_PAGE, bulkPage * ROWS_PER_PAGE);

  const selectedBulkRecord = useMemo(
    () => sortedBulkRows.find((row) => row.id === selectedBulkId) ?? sortedBulkRows[0] ?? null,
    [selectedBulkId, sortedBulkRows],
  );

  const selectedBulkAttendees = useMemo(() => {
    if (!selectedBulkRecord) return [];

    return selectedBulkRecord.attendee_names
      .split(/\r?\n|,/)
      .map((name) => name.trim())
      .filter(Boolean);
  }, [selectedBulkRecord]);

  useEffect(() => {
    setAllPage((current) => clampPage(current, allTotalPages));
  }, [allTotalPages]);

  useEffect(() => {
    setBulkPage((current) => clampPage(current, bulkTotalPages));
  }, [bulkTotalPages]);

  useEffect(() => {
    setAllPage(1);
  }, [allSearch, allSourceFilter, allMinistryFilter, selectedConference]);

  useEffect(() => {
    setBulkPage(1);
  }, [bulkSearch, bulkMinistryFilter, selectedConference]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAdminData(username, ADMIN_PASSWORD, selectedConference);
  }, [isAuthenticated, selectedConference]);

  useEffect(() => {
    if (!filteredBulkRows.length) {
      setSelectedBulkId("");
      return;
    }

    const existsInFiltered = filteredBulkRows.some((row) => row.id === selectedBulkId);
    if (!existsInFiltered) {
      setSelectedBulkId(filteredBulkRows[0].id);
    }
  }, [filteredBulkRows, selectedBulkId]);

  async function loadAdminData(loginUser: string, loginPass: string, conference: Conference) {
    setIsLoading(true);
    setStatus("");

    try {
      const params = new URLSearchParams({ mode: "admin", conference });
      const response = await fetch(`/api/registrations?${params.toString()}`, {
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

    const ok = await loadAdminData(username, password, selectedConference);
    if (!ok) return;

    setIsAuthenticated(true);
    setStatus(`Welcome Admin. Viewing ${conferenceLabel(selectedConference)} records.`);
    setPassword("");
  }

  async function refreshData() {
    if (!isAuthenticated) return;
    await loadAdminData(username, ADMIN_PASSWORD, selectedConference);
    setStatus(`Data refreshed for ${conferenceLabel(selectedConference)}.`);
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
    setAllSearch("");
    setBulkSearch("");
  }

  function openEditModal(row: AdminRecord) {
    setEditingRow(row);
    setEditForm({
      name: row.name,
      church: row.church,
      ministry: row.ministry,
      address: row.address,
      pastor: row.pastor,
      phone: row.phone,
      attendees: String(row.attendees),
      attendeeNames: row.attendeeNames,
    });
  }

  function openEditFromAllRow(row: AdminRecord) {
    if (row.sourceType === "individual") {
      openEditModal(row);
      return;
    }

    const fullBulk = bulkRows.find((entry) => entry.id === row.id);
    if (!fullBulk) {
      setStatus("Unable to open edit form for this bulk row.");
      return;
    }

    openEditModal({
      id: fullBulk.id,
      sourceType: "bulk",
      sourceLabel: "Bulk",
      name: fullBulk.contact_name,
      contactPerson: fullBulk.contact_name,
      church: fullBulk.church,
      ministry: fullBulk.ministry,
      address: fullBulk.address,
      pastor: fullBulk.local_church_pastor,
      phone: fullBulk.phone_number,
      attendees: fullBulk.attendee_count,
      attendeeNames: fullBulk.attendee_names,
      submittedAt: fullBulk.created_at,
      key: `b-${fullBulk.id}`,
    });
  }

  function openDeleteFromAllRow(row: AdminRecord) {
    if (row.sourceType === "individual") {
      openDeleteModal(row);
      return;
    }

    const fullBulk = bulkRows.find((entry) => entry.id === row.id);
    if (!fullBulk) {
      setStatus("Unable to delete this bulk row.");
      return;
    }

    openDeleteModal({
      id: fullBulk.id,
      sourceType: "bulk",
      sourceLabel: "Bulk",
      name: fullBulk.contact_name,
      contactPerson: fullBulk.contact_name,
      church: fullBulk.church,
      ministry: fullBulk.ministry,
      address: fullBulk.address,
      pastor: fullBulk.local_church_pastor,
      phone: fullBulk.phone_number,
      attendees: fullBulk.attendee_count,
      attendeeNames: fullBulk.attendee_names,
      submittedAt: fullBulk.created_at,
      key: `b-${fullBulk.id}`,
    });
  }

  function closeEditModal() {
    setEditingRow(null);
    setEditForm(defaultEditForm);
    setIsSaving(false);
  }

  async function submitEdit() {
    if (!editingRow) return;

    setIsSaving(true);

    const payload =
      editingRow.sourceType === "individual"
        ? {
            name: editForm.name,
            church: editForm.church,
            ministry: editForm.ministry,
            address: editForm.address,
            localChurchPastor: editForm.pastor,
            phoneNumber: editForm.phone,
          }
        : {
            contactName: editForm.name,
            church: editForm.church,
            ministry: editForm.ministry,
            address: editForm.address,
            localChurchPastor: editForm.pastor,
            phoneNumber: editForm.phone,
            attendeeCount: editForm.attendees,
            attendeeNames: editForm.attendeeNames,
          };

    try {
      const response = await fetch("/api/registrations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-username": username,
          "x-admin-password": ADMIN_PASSWORD,
        },
        body: JSON.stringify({
          type: editingRow.sourceType,
          id: editingRow.id,
          payload,
        }),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setStatus(data.error ?? "Unable to update record.");
        setIsSaving(false);
        return;
      }

      closeEditModal();
      await refreshData();
      setStatus("Record updated successfully.");
    } catch {
      setStatus("Network error while updating record.");
      setIsSaving(false);
    }
  }

  function openDeleteModal(row: AdminRecord) {
    setDeletingRow(row);
  }

  function closeDeleteModal() {
    setDeletingRow(null);
    setIsDeleting(false);
  }

  async function confirmDelete() {
    if (!deletingRow) return;

    setIsDeleting(true);

    try {
      const params = new URLSearchParams({ type: deletingRow.sourceType, id: deletingRow.id });
      const response = await fetch(`/api/registrations?${params.toString()}`, {
        method: "DELETE",
        headers: {
          "x-admin-username": username,
          "x-admin-password": ADMIN_PASSWORD,
        },
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setStatus(data.error ?? "Unable to delete record.");
        setIsDeleting(false);
        return;
      }

      closeDeleteModal();
      await refreshData();
      setStatus("Record deleted successfully.");
    } catch {
      setStatus("Network error while deleting record.");
      setIsDeleting(false);
    }
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

            <div className="mt-6 rounded-xl border border-amber-100/20 bg-slate-950/40 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80">Viewing Table</p>
              <p className="mt-1 text-sm font-bold text-amber-100">{conferenceLabel(selectedConference)}</p>
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedConference("leyte")}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    selectedConference === "leyte"
                      ? "bg-amber-200 text-slate-900"
                      : "border border-amber-100/30 text-amber-200"
                  }`}
                >
                  Leyte
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedConference("cebu")}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    selectedConference === "cebu"
                      ? "bg-amber-200 text-slate-900"
                      : "border border-amber-100/30 text-amber-200"
                  }`}
                >
                  Cebu
                </button>
              </div>
            </div>

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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-amber-100">All Attendees Information</h3>
                    <p className="text-xs text-amber-200">
                      Showing {conferenceLabel(selectedConference)} table with edit, delete, search, and filters.
                    </p>
                  </div>
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
                      onClick={() => setRegistrationView("bulk")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        registrationView === "bulk"
                          ? "bg-amber-200 text-slate-900"
                          : "border border-amber-100/30 text-amber-200"
                      }`}
                    >
                      Bulk Details
                    </button>
                  </div>
                </div>

                {registrationView === "all" ? (
                  <>
                    <div className="mb-3 grid gap-2 rounded-xl border border-amber-100/20 bg-slate-900/50 p-3 lg:grid-cols-[minmax(0,1fr)_180px_200px]">
                      <input
                        value={allSearch}
                        onChange={(event) => setAllSearch(event.target.value)}
                        placeholder="Search name, church, address, phone, attendees"
                        className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                      />

                      <select
                        value={allSourceFilter}
                        onChange={(event) => setAllSourceFilter(event.target.value as "all" | "individual" | "bulk")}
                        className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                      >
                        <option value="all">All Sources</option>
                        <option value="individual">Individual</option>
                        <option value="bulk">Bulk</option>
                      </select>

                      <select
                        value={allMinistryFilter}
                        onChange={(event) => setAllMinistryFilter(event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                      >
                        <option value="all">All Ministries</option>
                        {ministryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-amber-100/20">
                      <table className="min-w-[1250px] w-full text-left text-sm">
                        <thead className="bg-slate-900/80 text-amber-200">
                          <tr>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Contact Person</th>
                            <th className="px-3 py-2">Church</th>
                            <th className="px-3 py-2">Ministry</th>
                            <th className="px-3 py-2">Address</th>
                            <th className="px-3 py-2">Pastor</th>
                            <th className="px-3 py-2">Phone</th>
                            <th className="px-3 py-2">Attendees</th>
                            <th className="px-3 py-2">Attendee Names</th>
                            <th className="px-3 py-2">Submitted</th>
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedAllRows.length ? (
                            paginatedAllRows.map((row) => (
                              <tr key={row.key} className="border-t border-amber-100/10 align-top">
                                <td className="px-3 py-2">{row.sourceLabel}</td>
                                <td className="px-3 py-2">{row.name}</td>
                                <td className="px-3 py-2">{row.contactPerson}</td>
                                <td className="px-3 py-2">{row.church}</td>
                                <td className="px-3 py-2">{row.ministry}</td>
                                <td className="px-3 py-2">{row.address}</td>
                                <td className="px-3 py-2">{row.pastor}</td>
                                <td className="px-3 py-2">{row.phone}</td>
                                <td className="px-3 py-2">{row.attendees}</td>
                                <td className="px-3 py-2 whitespace-pre-wrap break-words">{row.attendeeNames}</td>
                                <td className="px-3 py-2">{formatDate(row.submittedAt)}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditFromAllRow(row)}
                                      className="rounded-md border border-amber-100/40 px-2 py-1 text-xs text-amber-100 hover:bg-slate-800"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openDeleteFromAllRow(row)}
                                      className="rounded-md border border-rose-200/40 px-2 py-1 text-xs text-rose-200 hover:bg-slate-800"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={12} className="px-3 py-6 text-center text-amber-200">
                                No registrations found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-100/20 bg-slate-900/45 px-3 py-2 text-xs text-amber-200">
                      <p>
                        Showing {(allPage - 1) * ROWS_PER_PAGE + (paginatedAllRows.length ? 1 : 0)}-
                        {(allPage - 1) * ROWS_PER_PAGE + paginatedAllRows.length} of {filteredAllRows.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAllPage((page) => Math.max(page - 1, 1))}
                          disabled={allPage === 1}
                          className="rounded-md border border-amber-100/30 px-2 py-1 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span>
                          Page {allPage} / {allTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAllPage((page) => Math.min(page + 1, allTotalPages))}
                          disabled={allPage === allTotalPages}
                          className="rounded-md border border-amber-100/30 px-2 py-1 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
                    <div className="rounded-xl border border-amber-100/20 bg-slate-900/50 p-3">
                      <p className="mb-2 text-xs font-semibold text-amber-200">Bulk Contact Person List</p>

                      <div className="mb-3 grid gap-2">
                        <input
                          value={bulkSearch}
                          onChange={(event) => setBulkSearch(event.target.value)}
                          placeholder="Search bulk contacts, church, attendees"
                          className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                        />
                        <select
                          value={bulkMinistryFilter}
                          onChange={(event) => setBulkMinistryFilter(event.target.value)}
                          className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                        >
                          <option value="all">All Ministries</option>
                          {ministryOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                        {paginatedBulkRows.length ? (
                          paginatedBulkRows.map((row) => (
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

                      <div className="mt-3 flex items-center justify-between text-xs text-amber-200">
                        <span>
                          Page {bulkPage} / {bulkTotalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setBulkPage((page) => Math.max(page - 1, 1))}
                            disabled={bulkPage === 1}
                            className="rounded-md border border-amber-100/30 px-2 py-1 disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkPage((page) => Math.min(page + 1, bulkTotalPages))}
                            disabled={bulkPage === bulkTotalPages}
                            className="rounded-md border border-amber-100/30 px-2 py-1 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-100/20 bg-slate-900/50 p-4">
                      {selectedBulkRecord ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="text-lg font-bold text-amber-100">{selectedBulkRecord.contact_name}</h4>
                              <p className="text-xs text-amber-200">Submitted: {formatDate(selectedBulkRecord.created_at)}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal({
                                    id: selectedBulkRecord.id,
                                    sourceType: "bulk",
                                    sourceLabel: "Bulk",
                                    name: selectedBulkRecord.contact_name,
                                    contactPerson: selectedBulkRecord.contact_name,
                                    church: selectedBulkRecord.church,
                                    ministry: selectedBulkRecord.ministry,
                                    address: selectedBulkRecord.address,
                                    pastor: selectedBulkRecord.local_church_pastor,
                                    phone: selectedBulkRecord.phone_number,
                                    attendees: selectedBulkRecord.attendee_count,
                                    attendeeNames: selectedBulkRecord.attendee_names,
                                    submittedAt: selectedBulkRecord.created_at,
                                    key: `b-${selectedBulkRecord.id}`,
                                  })
                                }
                                className="rounded-md border border-amber-100/40 px-2 py-1 text-xs text-amber-100 hover:bg-slate-800"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openDeleteModal({
                                    id: selectedBulkRecord.id,
                                    sourceType: "bulk",
                                    sourceLabel: "Bulk",
                                    name: selectedBulkRecord.contact_name,
                                    contactPerson: selectedBulkRecord.contact_name,
                                    church: selectedBulkRecord.church,
                                    ministry: selectedBulkRecord.ministry,
                                    address: selectedBulkRecord.address,
                                    pastor: selectedBulkRecord.local_church_pastor,
                                    phone: selectedBulkRecord.phone_number,
                                    attendees: selectedBulkRecord.attendee_count,
                                    attendeeNames: selectedBulkRecord.attendee_names,
                                    submittedAt: selectedBulkRecord.created_at,
                                    key: `b-${selectedBulkRecord.id}`,
                                  })
                                }
                                className="rounded-md border border-rose-200/40 px-2 py-1 text-xs text-rose-200 hover:bg-slate-800"
                              >
                                Delete
                              </button>
                            </div>
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

      {editingRow ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-amber-100/30 bg-slate-900 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.65)] sm:p-5">
            <h3 className="text-lg font-bold text-amber-100">Edit {editingRow.sourceLabel} Registration</h3>
            <p className="text-xs text-amber-200">Update details then save changes.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-amber-200">Name / Contact Person</span>
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Church</span>
                <input
                  value={editForm.church}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, church: event.target.value }))}
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Ministry</span>
                <select
                  value={editForm.ministry}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, ministry: event.target.value }))}
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                >
                  <option value="">Select ministry</option>
                  {ministryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-amber-200">Address</span>
                <input
                  value={editForm.address}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, address: event.target.value }))}
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Local Church Pastor</span>
                <input
                  value={editForm.pastor}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, pastor: event.target.value }))}
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Phone</span>
                <input
                  value={editForm.phone}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              {editingRow.sourceType === "bulk" ? (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs text-amber-200">Attendee Count</span>
                    <input
                      value={editForm.attendees}
                      type="number"
                      min={1}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, attendees: event.target.value }))}
                      className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs text-amber-200">Attendee Names</span>
                    <textarea
                      value={editForm.attendeeNames}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, attendeeNames: event.target.value }))}
                      rows={4}
                      className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-amber-100/30 px-3 py-2 text-sm text-amber-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={isSaving}
                className="rounded-lg bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2 text-sm font-bold text-rose-950 disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletingRow ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100/30 bg-slate-900 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.65)] sm:p-5">
            <h3 className="text-lg font-bold text-rose-200">Delete Registration</h3>
            <p className="mt-2 text-sm text-amber-100">
              You are about to delete {deletingRow.sourceLabel} record for <span className="font-bold">{deletingRow.name}</span>.
            </p>
            <p className="mt-1 text-xs text-amber-200">This action cannot be undone.</p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-lg border border-amber-100/30 px-3 py-2 text-sm text-amber-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-rose-50 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
