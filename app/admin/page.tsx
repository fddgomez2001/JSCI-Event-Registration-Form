"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type AdminCodeFormState = {
  currentCode: string;
  newCode: string;
  confirmCode: string;
};

type ExportFormat = "pdf" | "excel";

type ExportRow = {
  sourceLabel: string;
  name: string;
  contactPerson: string;
  church: string;
  ministry: string;
  address: string;
  pastor: string;
  phone: string;
  attendees: string;
  attendeeNames: string;
  submittedAt: string;
};

type ExportColumn = {
  key: keyof ExportRow;
  label: string;
  width?: number;
};

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "Admin@123!";
const ROWS_PER_PAGE = 15;
const EXPORT_TITLE = "Registration Report";

const exportColumns: ExportColumn[] = [
  { key: "sourceLabel", label: "Source", width: 14 },
  { key: "name", label: "Name", width: 24 },
  { key: "contactPerson", label: "Contact Person", width: 24 },
  { key: "church", label: "Church", width: 24 },
  { key: "ministry", label: "Ministry", width: 18 },
  { key: "address", label: "Address", width: 30 },
  { key: "pastor", label: "Pastor", width: 24 },
  { key: "phone", label: "Phone", width: 16 },
  { key: "attendees", label: "Attendees", width: 12 },
  { key: "attendeeNames", label: "Attendee Names", width: 36 },
  { key: "submittedAt", label: "Submitted", width: 22 },
];

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

const defaultCodeForm: AdminCodeFormState = {
  currentCode: "",
  newCode: "",
  confirmCode: "",
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

const ministryAnalyticsOrder = [...baseMinistryOptions];
const ministryChartColors = [
  "#f2be73",
  "#d58147",
  "#facc15",
  "#818cf8",
  "#c084fc",
  "#f59e0b",
  "#22d3ee",
  "#f97316",
  "#38bdf8",
];

function normalizeMinistryBucket(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  if (normalized.startsWith("ministry head")) return "Ministry Head";

  const matched = ministryAnalyticsOrder.find(
    (option) => option.toLowerCase() === normalized,
  );
  return matched ?? "";
}

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

function buildExportRow(row: AdminRecord): ExportRow {
  return {
    sourceLabel: row.sourceLabel,
    name: row.name,
    contactPerson: row.contactPerson,
    church: row.church,
    ministry: row.ministry,
    address: row.address,
    pastor: row.pastor,
    phone: row.phone,
    attendees: String(row.attendees),
    attendeeNames: row.attendeeNames,
    submittedAt: formatDate(row.submittedAt),
  };
}

function formatExportDate(value: Date) {
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatExportFileStamp(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export default function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminAccessDigits, setAdminAccessDigits] = useState(["", "", "", ""]);
  const [hasCodeAccess, setHasCodeAccess] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isUpdatingCode, setIsUpdatingCode] = useState(false);
  const [status, setStatus] = useState("");
  const [codeStatus, setCodeStatus] = useState("");
  const [securityStatus, setSecurityStatus] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [registrationView, setRegistrationView] =
    useState<RegistrationView>("all");
  const [selectedConference, setSelectedConference] =
    useState<Conference>("leyte");
  const [selectedBulkId, setSelectedBulkId] = useState<string>("");
  const [individualRows, setIndividualRows] = useState<IndividualRow[]>([]);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);

  const [allSearch, setAllSearch] = useState("");
  const [allSourceFilter, setAllSourceFilter] = useState<
    "all" | "individual" | "bulk"
  >("all");
  const [allMinistryFilter, setAllMinistryFilter] = useState("all");
  const [allPage, setAllPage] = useState(1);

  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkMinistryFilter, setBulkMinistryFilter] = useState("all");
  const [bulkPage, setBulkPage] = useState(1);

  const [editingRow, setEditingRow] = useState<AdminRecord | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(defaultEditForm);
  const [isSaving, setIsSaving] = useState(false);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [pendingExportFormat, setPendingExportFormat] =
    useState<ExportFormat | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<
    Record<keyof ExportRow, boolean>
  >(() =>
    exportColumns.reduce(
      (accumulator, column) => {
        accumulator[column.key] = true;
        return accumulator;
      },
      {} as Record<keyof ExportRow, boolean>,
    ),
  );

  const [deletingRow, setDeletingRow] = useState<AdminRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showChangeCodeModal, setShowChangeCodeModal] = useState(false);
  const [codeForm, setCodeForm] = useState<AdminCodeFormState>(defaultCodeForm);
  const adminCodeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const adminAccessCode = useMemo(
    () => adminAccessDigits.join(""),
    [adminAccessDigits],
  );

  function onAccessDigitChange(index: number, nextValue: string) {
    const digit = nextValue.replace(/\D/g, "").slice(-1);
    setAdminAccessDigits((current) => {
      const updated = [...current];
      updated[index] = digit;
      return updated;
    });

    if (digit !== "" && index < 3) {
      adminCodeInputRefs.current[index + 1]?.focus();
    }
  }

  function onAccessDigitKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !adminAccessDigits[index] && index > 0) {
      adminCodeInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      adminCodeInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < 3) {
      event.preventDefault();
      adminCodeInputRefs.current[index + 1]?.focus();
    }
  }

  function onAccessCodePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const digits = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 4)
      .split("");

    setAdminAccessDigits((current) => {
      const updated = [...current];
      for (let index = 0; index < 4; index += 1) {
        updated[index] = digits[index] ?? "";
      }
      return updated;
    });

    const focusIndex = digits.length >= 4 ? 3 : Math.max(digits.length, 0);
    adminCodeInputRefs.current[focusIndex]?.focus();
  }

  const totalAttendees = useMemo(() => {
    const individualCount = individualRows.length;
    const bulkCount = bulkRows.reduce(
      (sum, row) => sum + (row.attendee_count || 0),
      0,
    );
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
        : splitAttendeeNames(row.attendee_names).map((name) => ({
            attendee_name: name,
          }));

      return linkedAttendees.map((attendee, index) => ({
        id: row.id,
        sourceType: "bulk",
        sourceLabel: "Bulk",
        name: attendee.attendee_name,
        contactPerson: row.contact_name,
        church: attendee.attendee_church ?? row.church,
        ministry: attendee.attendee_ministry ?? row.ministry,
        address: attendee.attendee_address ?? row.address,
        pastor:
          attendee.attendee_local_church_pastor ?? row.local_church_pastor,
        phone: attendee.attendee_phone ?? row.phone_number,
        attendees: 1,
        attendeeNames: attendee.attendee_name,
        submittedAt: row.created_at,
        key: `b-${row.id}-${index}`,
      }));
    });

    return [...individualMapped, ...bulkMapped].sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
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

  const ministryAnalytics = useMemo(() => {
    const counts = new Map<string, number>(
      ministryAnalyticsOrder.map((ministry) => [ministry, 0]),
    );

    allRows.forEach((row) => {
      const bucket = normalizeMinistryBucket(row.ministry);
      if (!bucket) return;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    });

    const totalMappedAttendees = Array.from(counts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    return ministryAnalyticsOrder.map((ministry) => {
      const count = counts.get(ministry) ?? 0;
      const percentage =
        totalMappedAttendees > 0 ? (count / totalMappedAttendees) * 100 : 0;
      return {
        ministry,
        count,
        percentage,
      };
    });
  }, [allRows]);

  const totalMappedMinistryAttendees = useMemo(
    () => ministryAnalytics.reduce((sum, item) => sum + item.count, 0),
    [ministryAnalytics],
  );

  const mostActiveMinistry = useMemo(() => {
    if (!ministryAnalytics.length) return null;
    return ministryAnalytics.reduce((max, item) =>
      item.count > max.count ? item : max,
    );
  }, [ministryAnalytics]);

  const leastActiveMinistry = useMemo(() => {
    const withAttendees = ministryAnalytics.filter((item) => item.count > 0);
    if (!withAttendees.length) return null;
    return withAttendees.reduce((min, item) =>
      item.count < min.count ? item : min,
    );
  }, [ministryAnalytics]);

  const ministryPieData = useMemo(
    () =>
      ministryAnalytics.map((item) => ({
        name: item.ministry,
        value: item.count,
        percentage: item.percentage,
      })),
    [ministryAnalytics],
  );

  const sortedBulkRows = useMemo(
    () =>
      [...bulkRows].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [bulkRows],
  );

  const filteredAllRows = useMemo(() => {
    const query = allSearch.trim().toLowerCase();

    return allRows.filter((row) => {
      if (allSourceFilter !== "all" && row.sourceType !== allSourceFilter)
        return false;
      if (allMinistryFilter !== "all" && row.ministry !== allMinistryFilter)
        return false;
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

  const allTotalPages = Math.max(
    1,
    Math.ceil(filteredAllRows.length / ROWS_PER_PAGE),
  );
  const paginatedAllRows = filteredAllRows.slice(
    (allPage - 1) * ROWS_PER_PAGE,
    allPage * ROWS_PER_PAGE,
  );
  const exportPreviewRows = useMemo(
    () => filteredAllRows.map(buildExportRow),
    [filteredAllRows],
  );
  const selectedExportColumnsList = useMemo(
    () => exportColumns.filter((column) => selectedExportColumns[column.key]),
    [selectedExportColumns],
  );

  const exportTableColumns = selectedExportColumnsList.length
    ? selectedExportColumnsList
    : exportColumns.slice(0, 1);

  const canExportSelectedColumns = selectedExportColumnsList.length > 0;
  const exportTableWeight = exportTableColumns.reduce(
    (sum, column) => sum + (column.width ?? 18),
    0,
  );

  const filteredBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLowerCase();

    return sortedBulkRows.filter((row) => {
      if (bulkMinistryFilter !== "all" && row.ministry !== bulkMinistryFilter)
        return false;
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

  const bulkTotalPages = Math.max(
    1,
    Math.ceil(filteredBulkRows.length / ROWS_PER_PAGE),
  );
  const paginatedBulkRows = filteredBulkRows.slice(
    (bulkPage - 1) * ROWS_PER_PAGE,
    bulkPage * ROWS_PER_PAGE,
  );

  const selectedBulkRecord = useMemo(
    () =>
      sortedBulkRows.find((row) => row.id === selectedBulkId) ??
      sortedBulkRows[0] ??
      null,
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

    const existsInFiltered = filteredBulkRows.some(
      (row) => row.id === selectedBulkId,
    );
    if (!existsInFiltered) {
      setSelectedBulkId(filteredBulkRows[0].id);
    }
  }, [filteredBulkRows, selectedBulkId]);

  async function loadAdminData(
    loginUser: string,
    loginPass: string,
    conference: Conference,
  ) {
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
    setStatus(
      `Welcome Admin. Viewing ${conferenceLabel(selectedConference)} records.`,
    );
    setPassword("");
  }

  async function verifyAdminCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodeStatus("");

    const code = adminAccessCode.trim();
    if (!/^\d{4}$/.test(code)) {
      setCodeStatus("Please enter a valid 4-digit code.");
      return;
    }

    setIsVerifyingCode(true);
    try {
      const response = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setCodeStatus(data.error ?? "Unable to verify admin access code.");
        setIsVerifyingCode(false);
        return;
      }

      setHasCodeAccess(true);
      setAdminAccessDigits(["", "", "", ""]);
      setCodeStatus("");
      setIsVerifyingCode(false);
    } catch {
      setCodeStatus("Network error while verifying access code.");
      setIsVerifyingCode(false);
    }
  }

  function openChangeCodeModal() {
    setCodeForm(defaultCodeForm);
    setSecurityStatus("");
    setShowChangeCodeModal(true);
  }

  function closeChangeCodeModal() {
    setShowChangeCodeModal(false);
    setIsUpdatingCode(false);
    setCodeForm(defaultCodeForm);
  }

  async function submitCodeUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityStatus("");

    const currentCode = codeForm.currentCode.trim();
    const newCode = codeForm.newCode.trim();
    const confirmCode = codeForm.confirmCode.trim();

    if (
      !/^\d{4}$/.test(currentCode) ||
      !/^\d{4}$/.test(newCode) ||
      !/^\d{4}$/.test(confirmCode)
    ) {
      setSecurityStatus("All code fields must be exactly 4 digits.");
      return;
    }

    if (newCode !== confirmCode) {
      setSecurityStatus("New code and confirmation do not match.");
      return;
    }

    setIsUpdatingCode(true);
    try {
      const response = await fetch("/api/admin/security", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-username": username,
          "x-admin-password": ADMIN_PASSWORD,
        },
        body: JSON.stringify({
          currentCode,
          newCode,
          confirmCode,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setSecurityStatus(data.error ?? "Unable to update admin access code.");
        setIsUpdatingCode(false);
        return;
      }

      setSecurityStatus("Admin access code updated successfully.");
      setCodeForm(defaultCodeForm);
      setIsUpdatingCode(false);
    } catch {
      setSecurityStatus("Network error while updating admin access code.");
      setIsUpdatingCode(false);
    }
  }

  async function refreshData() {
    if (!isAuthenticated) return;
    await loadAdminData(username, ADMIN_PASSWORD, selectedConference);
    setStatus(`Data refreshed for ${conferenceLabel(selectedConference)}.`);
  }

  async function logout() {
    try {
      await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      // Continue with local logout state even if API logout fails.
    }

    setIsAuthenticated(false);
    setHasCodeAccess(false);
    setAdminAccessDigits(["", "", "", ""]);
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
    setShowChangeCodeModal(false);
    setCodeStatus("");
    setSecurityStatus("");
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

  function openExportModal(format: ExportFormat) {
    if (!exportPreviewRows.length) {
      setStatus("No visible table rows are available for export.");
      return;
    }

    setSelectedExportColumns((current) => {
      if (Object.values(current).some(Boolean)) return current;

      const next = { ...current };
      exportColumns.forEach((column) => {
        next[column.key] = true;
      });
      return next;
    });

    setPendingExportFormat(format);
    setExportModalOpen(true);
  }

  function closeExportModal() {
    if (isExporting) return;
    setExportModalOpen(false);
    setPendingExportFormat(null);
  }

  async function confirmExport() {
    if (
      !pendingExportFormat ||
      !exportPreviewRows.length ||
      !canExportSelectedColumns
    )
      return;

    setIsExporting(true);
    try {
      const reportDate = new Date();
      const fileStamp = formatExportFileStamp(reportDate);
      const fileBase = sanitizeFileName(
        `${conferenceLabel(selectedConference)}-${EXPORT_TITLE}-${fileStamp}`,
      );

      if (pendingExportFormat === "pdf") {
        const [{ default: jsPDF }, autoTableModule] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const autoTable = autoTableModule.default ?? autoTableModule.autoTable;
        const doc = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: "a4",
        });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageContentWidth = pageWidth - 20;
        const exportColumnWidths = exportTableColumns.map((column) => {
          const weight = column.width ?? 18;
          return (pageContentWidth * weight) / exportTableWeight;
        });

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text(EXPORT_TITLE, 14, 16);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Conference: ${conferenceLabel(selectedConference)}`, 14, 23);
        doc.text(`Exported: ${formatExportDate(reportDate)}`, 14, 29);
        doc.text(`Rows: ${exportPreviewRows.length}`, 14, 35);

        autoTable(doc, {
          startY: 40,
          tableWidth: pageContentWidth,
          head: [exportTableColumns.map((column) => column.label)],
          body: exportPreviewRows.map((row) =>
            exportTableColumns.map((column) => {
              const cellValue = row[column.key];
              return column.key === "attendeeNames"
                ? splitAttendeeNames(String(cellValue)).join("\n")
                : cellValue;
            }),
          ),
          theme: "grid",
          margin: { top: 12, right: 10, bottom: 12, left: 10 },
          styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 3,
            textColor: [15, 23, 42],
            lineColor: [148, 163, 184],
            lineWidth: 0.2,
            overflow: "linebreak",
            valign: "top",
          },
          headStyles: {
            fillColor: [15, 23, 42],
            textColor: [253, 230, 138],
            fontStyle: "bold",
            halign: "center",
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: Object.fromEntries(
            exportTableColumns.map((column, index) => [
              index,
              {
                cellWidth: exportColumnWidths[index],
                ...(column.key === "attendees"
                  ? { halign: "center" as const }
                  : {}),
              },
            ]),
          ),
          didDrawPage: (page) => {
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text(`Page ${page.pageNumber}`, pageWidth - 20, 9, {
              align: "right",
            });
          },
        });

        doc.save(`${fileBase}.pdf`);
      } else {
        const worksheetData = [
          [EXPORT_TITLE],
          [`Conference: ${conferenceLabel(selectedConference)}`],
          [`Exported: ${formatExportDate(reportDate)}`],
          [`Rows: ${exportPreviewRows.length}`],
          [],
          exportTableColumns.map((column) => column.label),
          ...exportPreviewRows.map((row) =>
            exportTableColumns.map((column) =>
              column.key === "attendeeNames"
                ? splitAttendeeNames(row[column.key]).join("\n")
                : row[column.key],
            ),
          ),
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        worksheet["!merges"] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: exportTableColumns.length - 1 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: exportTableColumns.length - 1 } },
          { s: { r: 2, c: 0 }, e: { r: 2, c: exportTableColumns.length - 1 } },
          { s: { r: 3, c: 0 }, e: { r: 3, c: exportTableColumns.length - 1 } },
        ];
        worksheet["!cols"] = exportTableColumns.map((column) => ({
          wch: column.width ?? 18,
        }));
        worksheet["!rows"] = [
          { hpt: 24 },
          { hpt: 18 },
          { hpt: 18 },
          { hpt: 18 },
          { hpt: 8 },
          { hpt: 22 },
          ...exportPreviewRows.map(() => ({ hpt: 28 })),
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Registrations");
        XLSX.writeFile(workbook, `${fileBase}.xlsx`);
      }

      setStatus(
        `${pendingExportFormat === "pdf" ? "PDF" : "Excel"} export completed successfully.`,
      );
      closeExportModal();
    } catch {
      setStatus(
        `Unable to export ${pendingExportFormat === "pdf" ? "PDF" : "Excel"} at this time.`,
      );
    } finally {
      setIsExporting(false);
    }
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

      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };

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
      const params = new URLSearchParams({
        type: deletingRow.sourceType,
        id: deletingRow.id,
      });
      const response = await fetch(`/api/registrations?${params.toString()}`, {
        method: "DELETE",
        headers: {
          "x-admin-username": username,
          "x-admin-password": ADMIN_PASSWORD,
        },
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };

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
      <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] px-4 py-8 flex items-center justify-center">
        <section className="mx-auto w-full max-w-md rounded-3xl border border-amber-100/30 bg-slate-900/80 p-5 text-amber-50 shadow-[0_18px_45px_rgba(3,8,20,0.45)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-amber-100">
              {hasCodeAccess ? "Admin Login" : "Admin Access"}
            </h1>
            <a
              href="/"
              className="text-xs text-amber-300 underline underline-offset-2"
            >
              Back to Landing Page
            </a>
          </div>

          {!hasCodeAccess ? (
            <>
              <p className="mt-2 text-sm text-amber-200">
                Enter your secure 4-digit admin code to continue.
              </p>

              <div className="mt-6 flex flex-col items-center gap-6">
                <div className="w-full text-center">
                  <span className="text-sm font-bold tracking-wide text-amber-100/90 uppercase">
                    Secured Admin Access Code
                  </span>
                  <div
                    className="mt-5 flex justify-center gap-3 md:gap-4"
                    onPaste={onAccessCodePaste}
                  >
                    {adminAccessDigits.map((digit, index) => (
                      <input
                        key={`admin-code-${index}`}
                        ref={(element) => {
                          adminCodeInputRefs.current[index] = element;
                        }}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(event) =>
                          onAccessDigitChange(index, event.target.value)
                        }
                        onKeyDown={(event) =>
                          onAccessDigitKeyDown(index, event)
                        }
                        className="w-16 h-16 md:w-20 md:h-20 rounded-xl border-2 border-amber-100/20 bg-slate-950/60 px-0 py-2 text-center text-3xl font-extrabold text-amber-100 shadow-inner focus:border-amber-400/50 focus:outline-none transition-all"
                        aria-label={`Admin code digit ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  form="verify-code-form"
                  disabled={isVerifyingCode}
                  className="w-full rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-3 text-sm font-extrabold text-rose-950 shadow-lg transition active:scale-[0.98] disabled:opacity-70"
                >
                  {isVerifyingCode ? "Verifying..." : "Continue"}
                </button>
                <form
                  id="verify-code-form"
                  onSubmit={verifyAdminCode}
                  className="hidden"
                />
              </div>

              {codeStatus ? (
                <p className="mt-3 text-sm text-amber-200">{codeStatus}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-amber-200">
                Enter admin credentials to open the dashboard.
              </p>

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

              {status ? (
                <p className="mt-3 text-sm text-amber-200">{status}</p>
              ) : null}
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] text-amber-50">
      <div className="flex flex-col min-h-screen md:grid md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-amber-100/20 bg-slate-900/85 p-4 md:border-b-0 md:border-r md:p-5 md:min-h-screen">
          <div className="md:sticky md:top-5">
            <h2 className="text-lg font-bold text-amber-100">Admin Panel</h2>
            <p className="mt-1 text-xs text-amber-200">
              Event Registration Management
            </p>

            <nav className="mt-4 flex flex-row gap-2 md:grid md:grid-cols-1 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className={`flex-none rounded-lg px-3 py-2 text-left text-sm font-semibold transition whitespace-nowrap ${
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
                className={`flex-none rounded-lg px-3 py-2 text-left text-sm font-semibold transition whitespace-nowrap ${
                  activeTab === "registrations"
                    ? "bg-amber-200 text-slate-900"
                    : "bg-slate-900/70 text-amber-100 hover:bg-slate-800"
                }`}
              >
                Registration
              </button>
            </nav>

            <div className="mt-4 md:mt-6 rounded-xl border border-amber-100/20 bg-slate-950/40 p-3">
              <p className="text-[10px] md:text-[11px] uppercase tracking-[0.18em] text-amber-300/80">
                Viewing Table
              </p>
              <p className="mt-0.5 md:mt-1 text-xs md:text-sm font-bold text-amber-100">
                {conferenceLabel(selectedConference)}
              </p>
              <div className="mt-2 flex gap-2 text-[10px] md:text-xs">
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

            <div className="mt-4 md:mt-6 grid grid-cols-2 md:grid-cols-1 gap-2 text-[10px] md:text-xs">
              <button
                type="button"
                onClick={refreshData}
                className="rounded-lg border border-amber-200/40 px-3 py-1.5 md:py-2 text-amber-100 hover:bg-slate-800"
              >
                Refresh Data
              </button>
              <button
                type="button"
                onClick={openChangeCodeModal}
                className="rounded-lg border border-indigo-200/40 px-3 py-1.5 md:py-2 text-indigo-200 hover:bg-slate-800"
              >
                Change 4-Digit Code
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-rose-200/40 px-3 py-1.5 md:py-2 text-rose-200 hover:bg-slate-800"
              >
                Logout
              </button>
            </div>
          </div>
        </aside>

        <section className="p-4 sm:p-6">
          <div className="rounded-2xl border border-amber-100/20 bg-slate-900/60 p-4 sm:p-5">
            {activeTab === "dashboard" ? (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                    <p className="text-xs text-amber-200">Total Attendees</p>
                    <p className="mt-2 text-3xl font-bold text-amber-100">
                      {totalAttendees}
                    </p>
                  </article>

                  <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                    <p className="text-xs text-amber-200">
                      Individual Registrations
                    </p>
                    <p className="mt-2 text-3xl font-bold text-amber-100">
                      {individualRows.length}
                    </p>
                  </article>

                  <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                    <p className="text-xs text-amber-200">Bulk Registrations</p>
                    <p className="mt-2 text-3xl font-bold text-amber-100">
                      {bulkRows.length}
                    </p>
                  </article>

                  <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4">
                    <p className="text-xs text-amber-200">
                      Total Registration Entries
                    </p>
                    <p className="mt-2 text-3xl font-bold text-amber-100">
                      {totalRegistrations}
                    </p>
                  </article>
                </div>

                <article className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4 sm:p-5">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-amber-100 sm:text-lg">
                        Ministry Attendee Analytics
                      </h3>
                      <p className="text-xs text-amber-300/90">
                        Distribution, volume comparison, and quick insights
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-100/25 bg-slate-950/55 px-3 py-1 text-xs font-semibold text-amber-200">
                      {conferenceLabel(selectedConference)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-xl border border-amber-100/20 bg-[linear-gradient(140deg,rgba(242,190,115,0.2),rgba(19,32,50,0.6))] p-3 shadow-[0_8px_20px_rgba(2,6,23,0.35)] transition hover:-translate-y-0.5">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-amber-200">
                        Total Mapped Attendees
                      </p>
                      <p className="mt-2 text-2xl font-extrabold text-amber-100">
                        {totalMappedMinistryAttendees}
                      </p>
                    </article>
                    <article className="rounded-xl border border-violet-200/20 bg-[linear-gradient(145deg,rgba(167,139,250,0.2),rgba(19,32,50,0.62))] p-3 shadow-[0_8px_20px_rgba(2,6,23,0.35)] transition hover:-translate-y-0.5">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-violet-200">
                        Most Active Ministry
                      </p>
                      <p className="mt-2 text-sm font-bold text-amber-100">
                        {mostActiveMinistry
                          ? mostActiveMinistry.ministry
                          : "No data"}
                      </p>
                      <p className="mt-1 text-xs text-amber-200">
                        {mostActiveMinistry
                          ? `${mostActiveMinistry.count} attendees (${mostActiveMinistry.percentage.toFixed(1)}%)`
                          : "No attendees yet"}
                      </p>
                    </article>
                    <article className="rounded-xl border border-cyan-200/20 bg-[linear-gradient(145deg,rgba(34,211,238,0.2),rgba(19,32,50,0.62))] p-3 shadow-[0_8px_20px_rgba(2,6,23,0.35)] transition hover:-translate-y-0.5">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-cyan-200">
                        Least Active Ministry
                      </p>
                      <p className="mt-2 text-sm font-bold text-amber-100">
                        {leastActiveMinistry
                          ? leastActiveMinistry.ministry
                          : "No data"}
                      </p>
                      <p className="mt-1 text-xs text-amber-200">
                        {leastActiveMinistry
                          ? `${leastActiveMinistry.count} attendees (${leastActiveMinistry.percentage.toFixed(1)}%)`
                          : "No attendees yet"}
                      </p>
                    </article>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <article className="rounded-xl border border-amber-100/20 bg-slate-950/45 p-3 sm:p-4">
                      <p className="mb-2 text-sm font-semibold text-amber-100">
                        Percentage Distribution by Ministry
                      </p>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={ministryPieData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={62}
                              outerRadius={106}
                              paddingAngle={3}
                              label={({ name, percent }) => {
                                const ratio =
                                  typeof percent === "number" ? percent : 0;
                                return `${name}: ${(ratio * 100).toFixed(1)}%`;
                              }}
                              labelLine={false}
                              isAnimationActive
                            >
                              {ministryPieData.map((entry, index) => (
                                <Cell
                                  key={entry.name}
                                  fill={
                                    ministryChartColors[
                                      index % ministryChartColors.length
                                    ]
                                  }
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value, _name, payload) => {
                                const attendees = Number(value ?? 0);
                                return [
                                  `${attendees} attendee${attendees === 1 ? "" : "s"}`,
                                  payload?.payload?.name ?? "Ministry",
                                ];
                              }}
                              contentStyle={{
                                background: "#0f172a",
                                border: "1px solid rgba(251,191,36,0.35)",
                                borderRadius: "12px",
                              }}
                            />
                            <Legend
                              wrapperStyle={{
                                color: "#fde68a",
                                fontSize: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </article>

                    <article className="rounded-xl border border-amber-100/20 bg-slate-950/45 p-3 sm:p-4">
                      <p className="mb-2 text-sm font-semibold text-amber-100">
                        Attendee Count Comparison
                      </p>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={ministryAnalytics}
                            layout="vertical"
                            margin={{ top: 8, right: 20, left: 10, bottom: 8 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="rgba(148,163,184,0.25)"
                            />
                            <XAxis type="number" stroke="#fde68a" />
                            <YAxis
                              type="category"
                              dataKey="ministry"
                              width={110}
                              stroke="#fde68a"
                              tick={{ fontSize: 11 }}
                            />
                            <Tooltip
                              formatter={(value, _name, payload) => {
                                const attendees = Number(value ?? 0);
                                const pct = Number(
                                  payload?.payload?.percentage ?? 0,
                                );
                                return [
                                  `${attendees} attendee${attendees === 1 ? "" : "s"} (${pct.toFixed(1)}%)`,
                                  "Count",
                                ];
                              }}
                              contentStyle={{
                                background: "#0f172a",
                                border: "1px solid rgba(251,191,36,0.35)",
                                borderRadius: "12px",
                              }}
                            />
                            <Legend
                              wrapperStyle={{
                                color: "#fde68a",
                                fontSize: "12px",
                              }}
                            />
                            <Bar
                              dataKey="count"
                              name="Attendees"
                              radius={[0, 8, 8, 0]}
                              fill="url(#analyticsBarGradient)"
                              animationDuration={650}
                            />
                            <defs>
                              <linearGradient
                                id="analyticsBarGradient"
                                x1="0"
                                y1="0"
                                x2="1"
                                y2="0"
                              >
                                <stop offset="0%" stopColor="#f2be73" />
                                <stop offset="100%" stopColor="#a78bfa" />
                              </linearGradient>
                            </defs>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </article>
                  </div>
                </article>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-amber-100">
                      All Attendees Information
                    </h3>
                    <p className="text-xs text-amber-200">
                      Showing {conferenceLabel(selectedConference)} table with
                      edit, delete, search, and filters.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openExportModal("pdf")}
                      className="group inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(71,85,105,0.92))] px-4 py-2 text-xs font-semibold text-amber-100 shadow-lg shadow-slate-950/30 transition duration-200 hover:-translate-y-0.5 hover:border-amber-300/60 hover:shadow-amber-500/10"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-4 w-4 text-amber-300 transition group-hover:scale-110"
                      >
                        <path
                          fill="currentColor"
                          d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.75H8V12zm0 4h8v1.75H8V16zm0-8h3.75v1.75H8V8z"
                        />
                      </svg>
                      Export to PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => openExportModal("excel")}
                      className="group inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.95),rgba(180,83,9,0.92))] px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-amber-950/20 transition duration-200 hover:-translate-y-0.5 hover:border-amber-100 hover:shadow-amber-500/20"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-4 w-4 transition group-hover:scale-110"
                      >
                        <path
                          fill="currentColor"
                          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm1 6V3.5L20.5 8zM8.5 10.5l1.9 3.04 1.92-3.04h1.78l-2.8 4.09 2.92 4.41h-1.9l-2-3.18-2.02 3.18H7.45l2.93-4.41-2.79-4.09z"
                        />
                      </svg>
                      Export to Excel
                    </button>
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
                    <div className="mb-3 grid gap-2 rounded-xl border border-amber-100/20 bg-slate-900/50 p-2 md:p-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_200px]">
                      <input
                        value={allSearch}
                        onChange={(event) => setAllSearch(event.target.value)}
                        placeholder="Search name, church, pastor, phone..."
                        className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm w-full sm:col-span-2 lg:col-span-1"
                      />

                      <select
                        value={allSourceFilter}
                        onChange={(event) =>
                          setAllSourceFilter(
                            event.target.value as "all" | "individual" | "bulk",
                          )
                        }
                        className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                      >
                        <option value="all">All Sources</option>
                        <option value="individual">Individual</option>
                        <option value="bulk">Bulk</option>
                      </select>

                      <select
                        value={allMinistryFilter}
                        onChange={(event) =>
                          setAllMinistryFilter(event.target.value)
                        }
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

                    <div className="hidden md:block overflow-x-auto rounded-xl border border-amber-100/20">
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
                              <tr
                                key={row.key}
                                className="border-t border-amber-100/10 align-top"
                              >
                                <td className="px-3 py-2">{row.sourceLabel}</td>
                                <td className="px-3 py-2">{row.name}</td>
                                <td className="px-3 py-2">
                                  {row.contactPerson}
                                </td>
                                <td className="px-3 py-2">{row.church}</td>
                                <td className="px-3 py-2">{row.ministry}</td>
                                <td className="px-3 py-2">{row.address}</td>
                                <td className="px-3 py-2">{row.pastor}</td>
                                <td className="px-3 py-2">{row.phone}</td>
                                <td className="px-3 py-2">{row.attendees}</td>
                                <td className="px-3 py-2 whitespace-pre-wrap break-words">
                                  {row.attendeeNames}
                                </td>
                                <td className="px-3 py-2">
                                  {formatDate(row.submittedAt)}
                                </td>
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
                              <td
                                colSpan={12}
                                className="px-3 py-6 text-center text-amber-200"
                              >
                                No registrations found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="md:hidden space-y-3">
                      {paginatedAllRows.length ? (
                        paginatedAllRows.map((row) => (
                          <article
                            key={row.key}
                            className="rounded-xl border border-amber-100/20 bg-slate-900/70 p-4 shadow-lg"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                  row.sourceType === "bulk"
                                    ? "bg-amber-100/20 text-amber-200"
                                    : "bg-blue-100/20 text-blue-200"
                                }`}
                              >
                                {row.sourceLabel}
                              </span>
                              <span className="text-[10px] text-amber-300 opacity-70">
                                {formatDate(row.submittedAt)}
                              </span>
                            </div>

                            <h4 className="text-base font-bold text-amber-100">
                              {row.name}
                            </h4>

                            <div className="mt-2 grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                              <div>
                                <p className="text-amber-300/60 uppercase text-[9px] font-semibold">
                                  Church
                                </p>
                                <p className="text-amber-50">{row.church}</p>
                              </div>
                              <div>
                                <p className="text-amber-300/60 uppercase text-[9px] font-semibold">
                                  Ministry
                                </p>
                                <p className="text-amber-100 font-medium">
                                  {row.ministry}
                                </p>
                              </div>
                              <div>
                                <p className="text-amber-300/60 uppercase text-[9px] font-semibold">
                                  Pastor
                                </p>
                                <p className="text-amber-50">{row.pastor}</p>
                              </div>
                              <div>
                                <p className="text-amber-300/60 uppercase text-[9px] font-semibold">
                                  Phone
                                </p>
                                <p className="text-amber-50">{row.phone}</p>
                              </div>
                            </div>

                            {row.sourceType === "bulk" && (
                              <div className="mt-3 bg-slate-950/40 rounded-lg p-2 border border-amber-100/10">
                                <p className="text-amber-300/60 uppercase text-[9px] font-semibold mb-1">
                                  Bulk Details
                                </p>
                                <p className="text-[11px] text-amber-100 leading-relaxed italic">
                                  Managed by{" "}
                                  <span className="font-semibold">
                                    {row.contactPerson}
                                  </span>{" "}
                                  • {row.attendees} attendees
                                </p>
                              </div>
                            )}

                            <div className="mt-4 flex gap-2 pt-3 border-t border-amber-100/10">
                              <button
                                type="button"
                                onClick={() => openEditFromAllRow(row)}
                                className="flex-1 rounded-lg border border-amber-100/40 bg-slate-800/40 py-2 text-xs font-semibold text-amber-100 hover:bg-slate-700"
                              >
                                Edit Record
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteFromAllRow(row)}
                                className="flex-1 rounded-lg border border-rose-200/40 bg-rose-900/10 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/20"
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-xl border border-amber-100/20 bg-slate-900/50 p-8 text-center text-amber-200">
                          No registrations found matching your filters.
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-100/20 bg-slate-900/45 px-3 py-2 text-xs text-amber-200">
                      <p>
                        Showing{" "}
                        {(allPage - 1) * ROWS_PER_PAGE +
                          (paginatedAllRows.length ? 1 : 0)}
                        -
                        {(allPage - 1) * ROWS_PER_PAGE +
                          paginatedAllRows.length}{" "}
                        of {filteredAllRows.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAllPage((page) => Math.max(page - 1, 1))
                          }
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
                          onClick={() =>
                            setAllPage((page) =>
                              Math.min(page + 1, allTotalPages),
                            )
                          }
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
                      <p className="mb-2 text-xs font-semibold text-amber-200">
                        Bulk Contact Person List
                      </p>

                      <div className="mb-3 grid gap-2">
                        <input
                          value={bulkSearch}
                          onChange={(event) =>
                            setBulkSearch(event.target.value)
                          }
                          placeholder="Search bulk contacts, church, attendees"
                          className="rounded-lg border border-amber-100/30 bg-slate-950/50 px-3 py-2 text-sm"
                        />
                        <select
                          value={bulkMinistryFilter}
                          onChange={(event) =>
                            setBulkMinistryFilter(event.target.value)
                          }
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
                              <p className="text-sm font-semibold text-amber-100">
                                {row.contact_name}
                              </p>
                              <p className="text-xs text-amber-200">
                                {row.church}
                              </p>
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
                            onClick={() =>
                              setBulkPage((page) => Math.max(page - 1, 1))
                            }
                            disabled={bulkPage === 1}
                            className="rounded-md border border-amber-100/30 px-2 py-1 disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setBulkPage((page) =>
                                Math.min(page + 1, bulkTotalPages),
                              )
                            }
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
                              <h4 className="text-lg font-bold text-amber-100">
                                {selectedBulkRecord.contact_name}
                              </h4>
                              <p className="text-xs text-amber-200">
                                Submitted:{" "}
                                {formatDate(selectedBulkRecord.created_at)}
                              </p>
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
                                    contactPerson:
                                      selectedBulkRecord.contact_name,
                                    church: selectedBulkRecord.church,
                                    ministry: selectedBulkRecord.ministry,
                                    address: selectedBulkRecord.address,
                                    pastor:
                                      selectedBulkRecord.local_church_pastor,
                                    phone: selectedBulkRecord.phone_number,
                                    attendees:
                                      selectedBulkRecord.attendee_count,
                                    attendeeNames:
                                      selectedBulkRecord.attendee_names,
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
                                    contactPerson:
                                      selectedBulkRecord.contact_name,
                                    church: selectedBulkRecord.church,
                                    ministry: selectedBulkRecord.ministry,
                                    address: selectedBulkRecord.address,
                                    pastor:
                                      selectedBulkRecord.local_church_pastor,
                                    phone: selectedBulkRecord.phone_number,
                                    attendees:
                                      selectedBulkRecord.attendee_count,
                                    attendeeNames:
                                      selectedBulkRecord.attendee_names,
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
                              <span className="text-amber-300">Church:</span>{" "}
                              {selectedBulkRecord.church}
                            </p>
                            <p>
                              <span className="text-amber-300">Ministry:</span>{" "}
                              {selectedBulkRecord.ministry}
                            </p>
                            <p>
                              <span className="text-amber-300">Pastor:</span>{" "}
                              {selectedBulkRecord.local_church_pastor}
                            </p>
                            <p>
                              <span className="text-amber-300">Phone:</span>{" "}
                              {selectedBulkRecord.phone_number}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-amber-300">Address:</span>{" "}
                              {selectedBulkRecord.address}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="text-amber-300">
                                Total Attendees:
                              </span>{" "}
                              {selectedBulkRecord.attendee_count}
                            </p>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-semibold text-amber-200">
                              Attendees Added
                            </p>
                            <ul className="max-h-[260px] space-y-1 overflow-y-auto rounded-lg border border-amber-100/20 bg-slate-950/40 p-3 text-sm">
                              {selectedBulkAttendees.length ? (
                                selectedBulkAttendees.map((attendee, index) => (
                                  <li
                                    key={`${attendee}-${index}`}
                                    className="text-amber-100"
                                  >
                                    {index + 1}. {attendee}
                                  </li>
                                ))
                              ) : (
                                <li className="text-amber-200">
                                  No attendee names listed.
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-200">
                          Select a contact person to view full details and
                          attendees.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {status ? (
              <p className="mt-3 text-sm text-amber-200">{status}</p>
            ) : null}
          </div>
        </section>
      </div>

      {exportModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-md">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-amber-100/25 bg-slate-950/85 shadow-[0_28px_80px_rgba(2,6,23,0.75)] modal-fade-in">
            <div className="border-b border-amber-100/10 bg-white/5 px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-amber-300/80">
                    Export Preview
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-amber-50">
                    {EXPORT_TITLE}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {pendingExportFormat === "pdf" ? "PDF" : "Excel"} export for{" "}
                    {conferenceLabel(selectedConference)}.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-100/15 bg-slate-900/70 px-4 py-3 text-right text-xs text-slate-300 shadow-lg">
                  <p className="font-semibold text-amber-100">
                    Visible rows: {exportPreviewRows.length}
                  </p>
                  <p className="mt-1">
                    Selected columns: {selectedExportColumnsList.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[65vh] overflow-auto px-5 py-4 sm:px-6">
              <div className="mb-4 rounded-2xl border border-amber-100/10 bg-slate-900/60 p-4 text-sm text-slate-300 shadow-inner shadow-slate-950/30">
                <p className="font-medium text-amber-100">
                  Previewing the exact rows currently visible in the table.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  The export excludes action buttons and keeps long attendee
                  names wrapped for readability.
                </p>
              </div>

              <div className="mb-4 rounded-2xl border border-amber-100/10 bg-slate-900/55 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-100">
                      Choose export columns
                    </p>
                    <p className="text-xs text-slate-400">
                      Pick the fields that should appear in the PDF or Excel
                      file.
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedExportColumns(
                          exportColumns.reduce(
                            (accumulator, column) => {
                              accumulator[column.key] = true;
                              return accumulator;
                            },
                            {} as Record<keyof ExportRow, boolean>,
                          ),
                        )
                      }
                      className="rounded-full border border-amber-100/20 px-3 py-1.5 text-amber-100 hover:bg-slate-800"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedExportColumns(
                          (current) =>
                            Object.fromEntries(
                              Object.keys(current).map((key) => [key, false]),
                            ) as Record<keyof ExportRow, boolean>,
                        )
                      }
                      className="rounded-full border border-amber-100/20 px-3 py-1.5 text-amber-100 hover:bg-slate-800"
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {exportColumns.map((column) => (
                    <label
                      key={column.key}
                      className="flex items-center gap-3 rounded-xl border border-amber-100/10 bg-slate-950/40 px-3 py-2 text-sm text-amber-50 transition hover:border-amber-100/30"
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportColumns[column.key]}
                        onChange={(event) =>
                          setSelectedExportColumns((current) => ({
                            ...current,
                            [column.key]: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-amber-200/50 bg-slate-950 text-amber-400 focus:ring-amber-300"
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>

                {!canExportSelectedColumns ? (
                  <p className="mt-3 text-xs text-amber-300">
                    Select at least one column to enable export.
                  </p>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-amber-100/15 bg-slate-950/50">
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead className="bg-slate-900/95 text-amber-200">
                    <tr>
                      {exportTableColumns.map((column) => (
                        <th
                          key={column.key}
                          className="border-b border-amber-100/10 px-4 py-3 font-semibold"
                          style={{
                            width: `${((column.width ?? 18) / exportTableWeight) * 100}%`,
                          }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exportPreviewRows.map((row, index) => (
                      <tr
                        key={`${row.name}-${row.submittedAt}-${index}`}
                        className="border-t border-amber-100/10 align-top odd:bg-slate-950/40"
                      >
                        {exportTableColumns.map((column) => (
                          <td
                            key={column.key}
                            className="px-4 py-3 text-slate-100"
                            style={{
                              width: `${((column.width ?? 18) / exportTableWeight) * 100}%`,
                            }}
                          >
                            <span
                              className={
                                column.key === "attendeeNames"
                                  ? "whitespace-pre-wrap break-words"
                                  : "break-words"
                              }
                            >
                              {column.key === "attendeeNames"
                                ? splitAttendeeNames(row[column.key]).join("\n")
                                : row[column.key]}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-amber-100/10 bg-slate-950/95 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closeExportModal}
                disabled={isExporting}
                className="rounded-full border border-amber-100/20 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-slate-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExport}
                disabled={isExporting || !canExportSelectedColumns}
                className="rounded-full bg-[linear-gradient(135deg,#f2be73,#d58147)] px-5 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/25 transition hover:-translate-y-0.5 hover:shadow-amber-500/20 disabled:translate-y-0 disabled:opacity-60"
              >
                {isExporting ? "Exporting..." : "Confirm Export"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingRow ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-amber-100/30 bg-slate-900 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.65)] sm:p-5">
            <h3 className="text-lg font-bold text-amber-100">
              Edit {editingRow.sourceLabel} Registration
            </h3>
            <p className="text-xs text-amber-200">
              Update details then save changes.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-amber-200">
                  Name / Contact Person
                </span>
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Church</span>
                <input
                  value={editForm.church}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      church: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Ministry</span>
                <select
                  value={editForm.ministry}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      ministry: event.target.value,
                    }))
                  }
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
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      address: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">
                  Local Church Pastor
                </span>
                <input
                  value={editForm.pastor}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      pastor: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Phone</span>
                <input
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                />
              </label>

              {editingRow.sourceType === "bulk" ? (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs text-amber-200">
                      Attendee Count
                    </span>
                    <input
                      value={editForm.attendees}
                      type="number"
                      min={1}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          attendees: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs text-amber-200">
                      Attendee Names
                    </span>
                    <textarea
                      value={editForm.attendeeNames}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          attendeeNames: event.target.value,
                        }))
                      }
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
            <h3 className="text-lg font-bold text-rose-200">
              Delete Registration
            </h3>
            <p className="mt-2 text-sm text-amber-100">
              You are about to delete {deletingRow.sourceLabel} record for{" "}
              <span className="font-bold">{deletingRow.name}</span>.
            </p>
            <p className="mt-1 text-xs text-amber-200">
              This action cannot be undone.
            </p>

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

      {showChangeCodeModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-100/30 bg-slate-900 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.65)] sm:p-5">
            <h3 className="text-lg font-bold text-amber-100">
              Change Admin 4-Digit Code
            </h3>
            <p className="mt-1 text-xs text-amber-200">
              Use a private 4-digit code and keep it confidential.
            </p>

            <form className="mt-4 grid gap-3" onSubmit={submitCodeUpdate}>
              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Current Code</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={codeForm.currentCode}
                  onChange={(event) =>
                    setCodeForm((prev) => ({
                      ...prev,
                      currentCode: event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 4),
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm tracking-[0.28em] text-center"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">New Code</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={codeForm.newCode}
                  onChange={(event) =>
                    setCodeForm((prev) => ({
                      ...prev,
                      newCode: event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 4),
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm tracking-[0.28em] text-center"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-amber-200">Confirm New Code</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={codeForm.confirmCode}
                  onChange={(event) =>
                    setCodeForm((prev) => ({
                      ...prev,
                      confirmCode: event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 4),
                    }))
                  }
                  className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm tracking-[0.28em] text-center"
                />
              </label>

              {securityStatus ? (
                <p className="text-xs text-amber-200">{securityStatus}</p>
              ) : null}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeChangeCodeModal}
                  className="rounded-lg border border-amber-100/30 px-3 py-2 text-sm text-amber-200"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingCode}
                  className="rounded-lg bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2 text-sm font-bold text-rose-950 disabled:opacity-60"
                >
                  {isUpdatingCode ? "Saving..." : "Update Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
