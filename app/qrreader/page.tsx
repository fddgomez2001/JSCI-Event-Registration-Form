"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Swal from "sweetalert2";
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

type ScanModalState = {
  conference: "LEYTE Conference" | "CEBU Conference";
  fullName: string;
  ministry: string;
  church: string;
  attendeeId: string;
  checkedIn: boolean;
  lunch: boolean;
  paymentAmount: number;
  paymentStatus: "pending" | "paid";
  paidAt: string | null;
  paidByCommittee: string | null;
  isWalkIn?: boolean;
  kit: {
    toteBag: boolean;
    mug: boolean;
    notebook: boolean;
    pencil: boolean;
    claimedAt: string | null;
    claimedByCommittee: string | null;
  };
};

type BulkAttendee = {
  id: string;
  name: string;
  church: string | null;
  ministry: string | null;
  conference: string | null;
  selected?: boolean;
};

type BulkModalState = {
  bulkRegistrationId: string;
  contactPerson: string | null;
  attendees: BulkAttendee[];
  conference: "LEYTE Conference" | "CEBU Conference";
};

export default function QRReaderPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [committeeName, setCommitteeName] = useState<typeof committeeNames[number] | "">("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loginReady, setLoginReady] = useState(false);
  const [error, setError] = useState("");

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [modal, setModal] = useState<ScanModalState | null>(null);
  const [processingAttendeeId, setProcessingAttendeeId] = useState<string | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [lunchProcessing, setLunchProcessing] = useState(false);
  const [kitProcessing, setKitProcessing] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInFullName, setWalkInFullName] = useState("");
  const [walkInChurch, setWalkInChurch] = useState("");
  const [walkInConference, setWalkInConference] = useState<"leyte" | "cebu">("leyte");
  const [bulkModal, setBulkModal] = useState<BulkModalState | null>(null);
  const [bulkPaymentProcessing, setBulkPaymentProcessing] = useState(false);
  const [showScanAnimation, setShowScanAnimation] = useState(false);
  const [paidSearch, setPaidSearch] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; fullName: string; church?: string; ministry?: string; paymentStatus?: "paid" | "pending"; lunchClaimed?: boolean }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [paidAttendees, setPaidAttendees] = useState<Array<{
    id?: string | null;
    name: string;
    amount: number;
    paymentMethod?: string | null;
    notes?: string | null;
    paidAt: string;
    paidByCommittee: string;
    attendeeId: string;
    isWalkIn?: boolean;
    conference?: "leyte" | "cebu";
  }>>([]);
  const [paidAttendeesLoaded, setPaidAttendeesLoaded] = useState(false);
  const [paidAttendeesLoading, setPaidAttendeesLoading] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("cash");
  const [editConference, setEditConference] = useState<"leyte" | "cebu">("leyte");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [showSubstituteForm, setShowSubstituteForm] = useState(false);
  const [substituteFullName, setSubstituteFullName] = useState("");
  const [substituteSaving, setSubstituteSaving] = useState(false);
  const [substituteStatus, setSubstituteStatus] = useState("");
  const [showPaymentsTableModal, setShowPaymentsTableModal] = useState(false);
  const [paymentsConference, setPaymentsConference] = useState<"leyte" | "cebu">("leyte");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeScannerMode, setActiveScannerMode] = useState<"payment" | "lunch" | "kit">("payment");
  const [showCashBreakdown, setShowCashBreakdown] = useState(false);
  const [billCounts, setBillCounts] = useState({
    one: 0,
    five: 0,
    ten: 0,
    twenty: 0,
    fifty: 0,
    hundred: 0,
    twoHundred: 0,
    fiveHundred: 0,
    thousand: 0,
  });
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [bulkEntryPaymentMethod, setBulkEntryPaymentMethod] = useState<"cash" | "online">("cash");
  const [bulkEntryInput, setBulkEntryInput] = useState<string>("");
  const [bulkEntryList, setBulkEntryList] = useState<Array<{ id: string; name: string; attendeeId: string; church?: string; paymentStatus?: "paid" | "pending"; conference?: "leyte" | "cebu" }>>([]);
  const [bulkEntrySearchResults, setBulkEntrySearchResults] = useState<Array<{ id: string; name: string; attendeeId: string; church?: string; paymentStatus?: "paid" | "pending"; conference?: "leyte" | "cebu" }>>([]);
  const [bulkEntryProcessing, setBulkEntryProcessing] = useState(false);
  const [bulkEntryLoadingId, setBulkEntryLoadingId] = useState<string | null>(null);
  const [bulkEntryResults, setBulkEntryResults] = useState<Array<{ id: string; name: string; status: "loading" | "success" | "error"; message?: string }>>([]);
  const bulkEntryInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkEntryScanning, setBulkEntryScanning] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [showOnlinePaymentDetails, setShowOnlinePaymentDetails] = useState(false);
  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputStartTimeRef = useRef<number | null>(null);
  const latestScanValueRef = useRef<string>("");
  const keyScanBufferRef = useRef<string>("");
  const keyScanStartedAtRef = useRef<number | null>(null);
  const keyScanResetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLookupActiveRef = useRef<boolean>(false);
  const bulkScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bulkInputStartTimeRef = useRef<number | null>(null);
  const bulkLatestValueRef = useRef<string>("");
  const bulkSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const bulkSearchAbortRef = useRef<AbortController | null>(null);
  const paymentInFlightRef = useRef(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const displayChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

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
    if (isAuthenticated && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (modal || bulkModal || walkInOpen || showBulkEntry) return;

      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        if (!keyScanBufferRef.current) {
          keyScanStartedAtRef.current = Date.now();
        }
        keyScanBufferRef.current += event.key;

        if (keyScanResetTimerRef.current) {
          clearTimeout(keyScanResetTimerRef.current);
        }
        keyScanResetTimerRef.current = setTimeout(() => {
          keyScanBufferRef.current = "";
          keyScanStartedAtRef.current = null;
          keyScanResetTimerRef.current = null;
        }, 120);
      }

      if (event.key === "Enter") {
        const buffered = keyScanBufferRef.current.trim();
        const elapsed = keyScanStartedAtRef.current
          ? Date.now() - keyScanStartedAtRef.current
          : 9999;

        if (buffered.length >= 4 && elapsed < 700) {
          if (keyScanResetTimerRef.current) {
            clearTimeout(keyScanResetTimerRef.current);
            keyScanResetTimerRef.current = null;
          }
          keyScanBufferRef.current = "";
          keyScanStartedAtRef.current = null;
          event.preventDefault();
          void doLookup(buffered, true);
          return;
        }

        if (autoScanTimerRef.current) {
          clearTimeout(autoScanTimerRef.current);
          autoScanTimerRef.current = null;
        }
        void handleUSBScan();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthenticated, modal, bulkModal, walkInOpen, showBulkEntry, manualCode]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (keyScanResetTimerRef.current) {
        clearTimeout(keyScanResetTimerRef.current);
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      if (bulkSearchAbortRef.current) {
        bulkSearchAbortRef.current.abort();
      }
      if (displayChannelRef.current && supabaseRef.current) {
        void supabaseRef.current.removeChannel(displayChannelRef.current);
        displayChannelRef.current = null;
      }
      supabaseRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const supabase = createClient();
    const channel = supabase.channel("display-scans");
    channel.subscribe();

    supabaseRef.current = supabase;
    displayChannelRef.current = channel;

    return () => {
      if (displayChannelRef.current && supabaseRef.current) {
        void supabaseRef.current.removeChannel(displayChannelRef.current);
      }
      displayChannelRef.current = null;
      supabaseRef.current = null;
    };
  }, [isAuthenticated]);

  async function sendDisplayEvent(event: string, payload: Record<string, unknown>) {
    if (!displayChannelRef.current) return;
    try {
      await displayChannelRef.current.send({
        type: "broadcast",
        event,
        payload: {
          ...payload,
          source: "payment",
        },
      });
    } catch {
      // Ignore display send failures to keep scanner responsive on weak networks.
    }
  }

  useEffect(() => {
    if (!showPaymentsTableModal) return;
    void loadPaidAttendees();
  }, [showPaymentsTableModal]);

  useEffect(() => {
    if (!showPaymentsTableModal) {
      setShowBackToTop(false);
      return;
    }

    const container = document.getElementById('paymentsTableContainer');
    if (!container) return;

    const handleScroll = () => {
      setShowBackToTop(container.scrollTop > 100);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [showPaymentsTableModal]);

  function normalizeConference(value?: string | null): "leyte" | "cebu" {
    return String(value ?? "").toLowerCase().includes("cebu") ? "cebu" : "leyte";
  }

  function formatConferenceLabel(value: "leyte" | "cebu") {
    return value === "cebu" ? "Cebu Conference" : "Leyte Conference";
  }

  function formatPeso(amount: number) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  useEffect(() => {
    if (!showPaymentsTableModal) return;

    const leyteCount = paidAttendees.filter((attendee) => normalizeConference(attendee.conference) === "leyte").length;
    const cebuCount = paidAttendees.filter((attendee) => normalizeConference(attendee.conference) === "cebu").length;

    if (paymentsConference === "leyte" && leyteCount === 0 && cebuCount > 0) {
      setPaymentsConference("cebu");
    }
    if (paymentsConference === "cebu" && cebuCount === 0 && leyteCount > 0) {
      setPaymentsConference("leyte");
    }
  }, [showPaymentsTableModal, paidAttendees, paymentsConference]);

  function handleScanInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;

    // Track start of new input sequence (for QR scan speed detection)
    if (!latestScanValueRef.current && val) {
      inputStartTimeRef.current = Date.now();
    }
    latestScanValueRef.current = val;
    setManualCode(val);

    if (autoScanTimerRef.current) {
      clearTimeout(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }

    if (val.trim()) {
      // Short debounce: if many chars arrive fast (< 200ms), it's a QR scanner
      autoScanTimerRef.current = setTimeout(() => {
        autoScanTimerRef.current = null;
        const currentVal = latestScanValueRef.current.trim();
        if (!currentVal) return;
        const elapsed = inputStartTimeRef.current ? Date.now() - inputStartTimeRef.current : 9999;
        // QR scanners complete input in < 200ms; manual typing is much slower
        if (currentVal.length >= 4 && elapsed < 200) {
          void doLookup(currentVal, true);
        }
      }, 80);
    }
  }

  async function doLookup(raw: string, showScanAlert = false) {
    if (isLookupActiveRef.current) return;
    if (!raw) return;
    isLookupActiveRef.current = true;

    // Clear input state immediately so QR content is never shown
    latestScanValueRef.current = "";
    inputStartTimeRef.current = null;
    if (autoScanTimerRef.current) {
      clearTimeout(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    setManualCode("");
    setShowScanAnimation(true);
    setTimeout(() => setShowScanAnimation(false), 500);
    setProcessingAttendeeId(raw);
    setError("");

    if (showScanAlert) {
      void Swal.fire({
        title: "QR Code Read",
        html: `
          <div style="display:flex;justify-content:center;margin-top:4px;">
            <div style="position:relative;width:72px;height:72px;border:2px solid #f97316;border-radius:12px;">
              <div style="position:absolute;left:8px;top:8px;width:12px;height:12px;border:2px solid #22c55e;border-radius:2px;"></div>
              <div style="position:absolute;right:8px;top:8px;width:12px;height:12px;border:2px solid #22c55e;border-radius:2px;"></div>
              <div style="position:absolute;left:8px;bottom:8px;width:12px;height:12px;border:2px solid #22c55e;border-radius:2px;"></div>
              <div style="position:absolute;left:4px;right:4px;top:50%;height:2px;background:#22c55e;animation:qrscanline 0.8s ease-in-out infinite;"></div>
            </div>
          </div>
          <style>
            @keyframes qrscanline {
              0% { transform: translateY(-22px); opacity: 0.5; }
              50% { transform: translateY(16px); opacity: 1; }
              100% { transform: translateY(-22px); opacity: 0.5; }
            }
          </style>
        `,
        background: "#140704",
        color: "#ffffff",
        showConfirmButton: false,
        timer: 450,
        timerProgressBar: true,
        customClass: {
          popup: "border border-orange-500/40 rounded-2xl",
          title: "text-orange-200",
        },
      });
    }

    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeKey: raw, attendeeId: raw, committeeName, includeDetails: true }),
      });

      if (!res.ok) {
        setError("Attendee not found.");
        return;
      }

      const body = await res.json();
      const resolvedAttendeeId = body.attendeeId ?? raw;

      // Show modal immediately with basic info
      setModal({
        conference: body.conference,
        fullName: body.fullName,
        ministry: body.ministry ?? "",
        church: body.church ?? "",
        attendeeId: resolvedAttendeeId,
        checkedIn: !!body.checkedIn,
        lunch: !!body.lunch,
        paymentAmount: 200,
        paymentStatus: body.paymentStatus === "paid" ? "paid" : "pending",
        paidAt: body.paidAt ?? null,
        paidByCommittee: body.paidByCommittee ?? null,
        isWalkIn: !!body.isWalkIn,
        kit: {
          toteBag: !!body.kit?.toteBag,
          mug: !!body.kit?.mug,
          notebook: !!body.kit?.notebook,
          pencil: !!body.kit?.pencil,
          claimedAt: body.kit?.claimedAt ?? null,
          claimedByCommittee: body.kit?.claimedByCommittee ?? null,
        },
      });
      setShowSubstituteForm(false);
      setSubstituteFullName("");
      setSubstituteStatus("");

      // Broadcast to /display page in real-time
      void sendDisplayEvent("scan", {
        fullName: body.fullName,
        church: body.church ?? "",
        conference: body.conference,
        paymentMethod: "pending",
      });
    } catch (e) {
      setError("Lookup error. Please try again.");
    } finally {
      setProcessingAttendeeId(null);
      isLookupActiveRef.current = false;
    }
  }

  async function handleUSBScan() {
    const raw = latestScanValueRef.current.trim() || manualCode.trim();
    if (!raw) return;
    await doLookup(raw, true);
  }

  async function confirmPayment() {
    if (!modal) return;
    if (modal.paymentStatus === "paid") return;
    if (paymentInFlightRef.current) return;

    paymentInFlightRef.current = true;
    setPaymentProcessing(true);
    setError("");

    try {
      const res = await fetch("/api/qr/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId: modal.attendeeId,
          attendeeName: modal.fullName,
          committeeName: committeeName,
          conferenceLabel: modal.conference,
          paymentMethod,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? "Unable to record payment.");
        return;
      }

      const body = await res.json();
      if (body.data) {
        const updatedModal = {
          ...modal,
          paymentStatus: body.data.paymentStatus as "pending" | "paid",
          paidAt: body.data.paidAt,
          paidByCommittee: body.data.paidByCommittee,
        };

        // Broadcast payment confirmation to display
        void sendDisplayEvent("payment-confirmed", {
          fullName: modal.fullName,
          church: modal.church,
          paymentMethod: paymentMethod,
          conference: modal.conference,
        });

        // Add to paid list
        if (body.data.paymentStatus === "paid" && body.data.paidAt) {
          addToPaidList({
            id: body.data.id ?? null,
            name: modal.fullName,
            amount: modal.paymentAmount,
            paymentMethod: body.data.paymentMethod ?? "cash",
            notes: body.data.notes ?? null,
            paidAt: body.data.paidAt,
            paidByCommittee: body.data.paidByCommittee || committeeName,
            attendeeId: modal.attendeeId,
            isWalkIn: modal.isWalkIn ?? false,
            conference: normalizeConference(modal.conference),
          });
        }

        // Auto check-in after payment
        try {
          const checkinRes = await fetch("/api/qr/checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeKey: modal.attendeeId, action: "checkin", committeeName }),
          });

          if (checkinRes.ok) {
            updatedModal.checkedIn = true;
          }
        } catch {
          // Continue even if check-in fails
        }

        setModal(updatedModal);

        if (body.data.paymentStatus === "paid") {
          await Swal.fire({
            icon: "success",
            title: "Payment Recorded",
            html: `<div style="font-size:1.05rem;font-weight:700;margin-top:4px;">${modal.fullName}</div>`,
            background: "#140704",
            color: "#ffffff",
            iconColor: "#22c55e",
            showConfirmButton: false,
            timer: 2300,
            timerProgressBar: true,
            customClass: {
              popup: "border border-green-500/40 rounded-2xl",
              title: "text-white",
              htmlContainer: "text-green-200",
            },
          });

          closeAttendeeModal();
        }
      }
    } catch (err) {
      setError("Unable to record payment.");
    } finally {
      paymentInFlightRef.current = false;
      setPaymentProcessing(false);
      setPaymentMethod("cash");
      setShowOnlinePaymentDetails(false);
    }
  }

  function closeAttendeeModal(resetDisplay = false) {
    if (resetDisplay) {
      resetDisplayBoard();
    }
    setModal(null);
    setManualCode("");
    setPaymentMethod("cash");
    setShowOnlinePaymentDetails(false);
    setShowSubstituteForm(false);
    setSubstituteFullName("");
    setSubstituteStatus("");
    if (scanInputRef.current) scanInputRef.current.focus();
  }

  function resetDisplayBoard() {
    void sendDisplayEvent("display-reset", {});
  }

  async function markLunchClaimed() {
    if (!modal || modal.lunch) return;
    if (modal.paymentStatus !== "paid") {
      setError("Payment must be confirmed before lunch can be claimed.");
      return;
    }
    setLunchProcessing(true);
    setError("");

    try {
      const res = await fetch("/api/qr/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId: modal.attendeeId, action: "lunch", committeeName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Unable to mark lunch claim.");
        return;
      }

      setModal((current) => (current ? { ...current, lunch: true } : current));
    } catch {
      setError("Unable to mark lunch claim.");
    } finally {
      setLunchProcessing(false);
    }
  }

  function addToPaidList(attendee: { id?: string | null; name: string; amount: number; paymentMethod?: string | null; notes?: string | null; paidAt: string; paidByCommittee: string; attendeeId: string; isWalkIn?: boolean; conference?: "leyte" | "cebu" }) {
    setPaidAttendeesLoaded(true);
    setPaidAttendees(prev => {
      const existingIndex = prev.findIndex((row) => row.attendeeId === attendee.attendeeId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...attendee };
        return next;
      }
      return [attendee, ...prev];
    });
  }

  async function loadPaidAttendees() {
    if (paidAttendeesLoaded || paidAttendeesLoading) return;
    setPaidAttendeesLoading(true);

    try {
      const res = await fetch("/api/qr/payment", { cache: "no-store" });
      if (!res.ok) return;

      const body = await res.json();
      if (body.data && Array.isArray(body.data)) {
        const mapped = body.data.map((p: any) => ({
          id: p.id ?? null,
          name: p.attendeeName,
          amount: p.amount,
          paymentMethod: p.paymentMethod ?? "cash",
          notes: p.notes ?? null,
          paidAt: p.paidAt,
          paidByCommittee: p.paidByCommittee,
          attendeeId: p.attendeeId,
          isWalkIn: p.isWalkIn ?? false,
          conference: normalizeConference(p.conference),
        }));
        setPaidAttendees(mapped);
      }

      setPaidAttendeesLoaded(true);
    } catch {
      // Keep not-loaded state so opening modal can retry.
    } finally {
      setPaidAttendeesLoading(false);
    }
  }

  async function savePaymentEdits(paymentAttendeeId: string) {
    const target = paidAttendees.find(p => p.attendeeId === paymentAttendeeId || p.id === paymentAttendeeId);
    if (!target) return;
    setEditSaving(true);
    setError("");

    try {
      const res = await fetch("/api/qr/payment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId: target.attendeeId,
          paymentMethod: editPaymentMethod,
          conference: editConference,
          notes: editNotes,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? "Unable to update payment.");
        return;
      }

      const body = await res.json();
      if (body.data) {
        setPaidAttendees(prev => prev.map(p => {
          if (p.attendeeId === body.data.attendeeId || p.id === body.data.id) {
            return {
              ...p,
              id: body.data.id ?? p.id,
              paymentMethod: body.data.paymentMethod ?? p.paymentMethod,
              conference: normalizeConference(body.data.conference ?? p.conference),
              notes: body.data.notes ?? p.notes,
            };
          }
          return p;
        }));
        setEditingPaymentId(null);
        setEditConference("leyte");
      }
    } catch (err) {
      setError("Unable to update payment.");
    } finally {
      setEditSaving(false);
    }
  }

  function formatPaymentMethod(method?: string | null) {
    if (!method) return "Cash";
    if (method.toLowerCase() === "online") return "Online";
    if (method.toLowerCase() === "cash") return "Cash";
    return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  }

  async function exportPaymentsToExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "JSCI Event Registration";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Payments Collected", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
      properties: { tabColor: { argb: "FF1A56DB" } },
    });

    // Column widths
    sheet.columns = [
      { key: "no",        width: 6  },
      { key: "name",      width: 32 },
      { key: "type",      width: 14 },
      { key: "amount",    width: 15 },
      { key: "method",    width: 17 },
      { key: "notes",     width: 28 },
      { key: "paymentBy", width: 17 },
      { key: "datetime",  width: 24 },
      { key: "id",        width: 38 },
    ];

    // --- Row 1: Title ---
    sheet.addRow(["JSCI Event – Payments Collected", "", "", "", "", "", "", "", ""]);
    sheet.mergeCells("A1:I1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "JSCI Event – Payments Collected";
    titleCell.font = { name: "Calibri", bold: true, size: 18, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2D54" } };
    sheet.getRow(1).height = 34;

    // --- Row 2: Summary ---
    const summaryText =
      `${formatConferenceLabel(paymentsConference)} Total Collected: ${formatPeso(grandPaidTotal)}     |     Cash: ${formatPeso(cashPaidTotal)}     |     Online: ${formatPeso(onlinePaidTotal)}     |     Other: ${formatPeso(otherPaidTotal)}     |     ${conferencePaidAttendees.length} Paid Attendees`;
    sheet.addRow([summaryText, "", "", "", "", "", "", "", ""]);
    sheet.mergeCells("A2:I2");
    const summaryCell = sheet.getCell("A2");
    summaryCell.value = summaryText;
    summaryCell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF4ADE80" } };
    summaryCell.alignment = { horizontal: "center", vertical: "middle" };
    summaryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1929" } };
    sheet.getRow(2).height = 22;

    // --- Row 3: Spacer ---
    sheet.addRow([""]);
    sheet.getRow(3).height = 6;

    // --- Row 4: Column Headers ---
    const headerRow = sheet.addRow(["No.", "Full Name", "Type", "Amount (₱)", "Payment Method", "Notes", "Payment By", "Date & Time", "Attendee ID"]);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A56DB" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      cell.border = {
        top:    { style: "medium", color: { argb: "FF0033AA" } },
        bottom: { style: "medium", color: { argb: "FF0033AA" } },
        left:   { style: "thin",   color: { argb: "FF1A56DB" } },
        right:  { style: "thin",   color: { argb: "FF1A56DB" } },
      };
    });

    // --- Rows 5+: Data ---
    conferencePaidAttendees.forEach((attendee, index) => {
      const isEven = index % 2 === 0;
      const rowBg = isEven ? "FFF0F7FF" : "FFFFFFFF";

      const isWalkIn = attendee.isWalkIn === true;
      const dataRow = sheet.addRow([
        index + 1,
        attendee.name,
        isWalkIn ? "Walk-in" : "Registered",
        attendee.amount,
        formatPaymentMethod(attendee.paymentMethod),
        attendee.notes ?? "",
        attendee.paidByCommittee,
        new Date(attendee.paidAt).toLocaleString("en-PH", {
          year: "numeric", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
        attendee.attendeeId,
      ]);
      dataRow.height = 19;

      dataRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF1E293B" } };
        cell.alignment = { vertical: "middle" };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFD0DCF0" } },
          right:  { style: "thin", color: { argb: "FFD0DCF0" } },
        };
      });

      // Type cell: color-coded
      const typeCell = dataRow.getCell(3);
      typeCell.alignment = { horizontal: "center", vertical: "middle" };
      if (isWalkIn) {
        typeCell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FFEA580C" } }; // orange
      } else {
        typeCell.font = { name: "Calibri", size: 10, color: { argb: "FF1D4ED8" } }; // blue
      }

      // Amount: right-align, green bold
      const amountCell = dataRow.getCell(4);
      amountCell.numFmt = '"₱"#,##0';
      amountCell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FF16A34A" } };
      amountCell.alignment = { horizontal: "right", vertical: "middle" };

      // No. center
      dataRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      // Method center
      dataRow.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    });

    // --- Footer row ---
    const footerRow = sheet.addRow(["", `TOTAL (${conferencePaidAttendees.length} records)`, "", grandPaidTotal, "", "", "", `Exported on ${new Date().toLocaleString("en-PH")}`, ""]);
    footerRow.height = 22;
    footerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1FF" } };
      cell.border = { top: { style: "medium", color: { argb: "FF1A56DB" } } };
    });
    const footerLabelCell = footerRow.getCell(2);
    footerLabelCell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FF1E293B" } };
    const footerAmountCell = footerRow.getCell(4);
    footerAmountCell.numFmt = '"₱"#,##0';
    footerAmountCell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF16A34A" } };
    footerAmountCell.alignment = { horizontal: "right", vertical: "middle" };
    const footerTimeCell = footerRow.getCell(8);
    footerTimeCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF64748B" } };

    // --- Download ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `JSCI-Payments-${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        scanWithCamera();
      }
    } catch (err) {
      setError("Unable to access camera. Please check permissions.");
    }
  }

  function stopCamera() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  function scanWithCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastScanAt = 0;

    const scan = () => {
      const now = Date.now();
      if (video.readyState === video.HAVE_ENOUGH_DATA && now - lastScanAt >= 120) {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const scale = sourceWidth > 640 ? 640 / sourceWidth : 1;
        const targetWidth = Math.max(1, Math.floor(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.floor(sourceHeight * scale));

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        lastScanAt = now;

        if (code) {
          stopCamera();
          handleQRScan(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(scan);
    };

    scan();
  }

  async function handleQRScan(rawValue: string) {
    if (cameraActive) stopCamera();
    await doLookup(rawValue, true);
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

  function clearAllKitItems() {
    setModal((current) =>
      current
        ? {
            ...current,
            kit: {
              ...current.kit,
              toteBag: false,
              mug: false,
              notebook: false,
              pencil: false,
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

      await Swal.fire({
        icon: "success",
        title: "Marked as Claimed",
        html: `<div style="font-size:1.05rem;font-weight:700;margin-top:4px;">${modal.fullName}</div>`,
        background: "#140704",
        color: "#ffffff",
        iconColor: "#22c55e",
        showConfirmButton: false,
        timer: 2300,
        timerProgressBar: true,
        customClass: {
          popup: "border border-green-500/40 rounded-2xl",
          title: "text-white",
          htmlContainer: "text-green-200",
        },
      });

      closeAttendeeModal();
    } catch {
      setError("Unable to save kit claim.");
    } finally {
      setKitProcessing(false);
    }
  }

  async function saveSubstituteAttendee() {
    if (!modal) return;

    const nextName = substituteFullName.trim().replace(/\s+/g, " ");
    if (!nextName) {
      setSubstituteStatus("Please enter the full name of the substitute attendee.");
      return;
    }

    setSubstituteSaving(true);
    setSubstituteStatus("");
    setError("");

    try {
      const response = await fetch("/api/qr/substitute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeId: modal.attendeeId,
          substituteFullName: nextName,
          committeeName,
        }),
      });

      const body = await response.json().catch(() => ({} as { error?: string; data?: { substituteFullName?: string } }));

      if (!response.ok) {
        setSubstituteStatus(body.error ?? "Unable to save substitute attendee.");
        return;
      }

      const resolvedName = String(body?.data?.substituteFullName ?? nextName);

      setModal((current) => (current ? { ...current, fullName: resolvedName } : current));
      setSubstituteStatus(`Substitution saved. Updated attendee: ${resolvedName}`);
      setSubstituteFullName("");
      setShowSubstituteForm(false);
    } catch {
      setSubstituteStatus("Unable to save substitute attendee.");
    } finally {
      setSubstituteSaving(false);
    }
  }

  async function submitWalkInRegistration() {
    const fullName = walkInFullName.trim();
    const church = walkInChurch.trim();

    if (!fullName || !church) {
      setError("Full Name and Church are required for walk-in registration.");
      return;
    }

    setWalkInSaving(true);
    setError("");

    try {
      const res = await fetch("/api/qr/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          church,
          committeeName,
          conference: walkInConference,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.data) {
        setError(body.message ?? "Unable to register walk-in attendee.");
        return;
      }

      setWalkInOpen(false);
      setWalkInFullName("");
      setWalkInChurch("");
      setWalkInConference("leyte");

      const conferenceLabel = String(body.data.conference ?? "").toLowerCase().includes("cebu")
        ? "CEBU Conference"
        : "LEYTE Conference";

      const result = await Swal.fire({
        icon: "success",
        title: "Walk-in Registered",
        text: `${body.data.fullName} has been added successfully.`,
        background: "#140704",
        color: "#ffffff",
        iconColor: "#f59e0b",
        showCancelButton: true,
        confirmButtonText: "Proceed to Payment",
        cancelButtonText: "Close",
        confirmButtonColor: "#f97316",
        cancelButtonColor: "#334155",
        customClass: {
          popup: "border border-orange-500/40 rounded-2xl",
          title: "text-white",
          htmlContainer: "text-orange-100",
        },
      });

      if (result.isConfirmed) {
        setModal({
          conference: conferenceLabel,
          fullName: body.data.fullName,
          ministry: "",
          church: body.data.church ?? church,
          attendeeId: body.data.attendeeId,
          checkedIn: false,
          lunch: false,
          paymentAmount: 200,
          paymentStatus: "pending",
          paidAt: null,
          paidByCommittee: null,
          isWalkIn: true,
          kit: {
            toteBag: false,
            mug: false,
            notebook: false,
            pencil: false,
            claimedAt: null,
            claimedByCommittee: null,
          },
        });
        setShowSubstituteForm(false);
        setSubstituteFullName("");
        setSubstituteStatus("");

        void sendDisplayEvent("scan", {
          fullName: body.data.fullName,
          church: body.data.church ?? church,
          conference: conferenceLabel,
          paymentMethod: "pending",
        });
      }
    } catch {
      setError("Unable to register walk-in attendee.");
    } finally {
      setWalkInSaving(false);
    }
  }

  const conferencePaidAttendees = paidAttendees.filter((attendee) => {
    return normalizeConference(attendee.conference) === paymentsConference;
  });

  const filteredPaidAttendees = conferencePaidAttendees.filter((attendee) => {
    const searchValue = paidSearch.trim().toLowerCase();
    if (!searchValue) return true;

    return [
      attendee.name,
      attendee.paidByCommittee,
      attendee.amount.toString(),
      new Date(attendee.paidAt).toLocaleTimeString(),
    ].some((value) => value.toLowerCase().includes(searchValue));
  });

  const cashPaidTotal = conferencePaidAttendees.reduce((total, attendee) => {
    return attendee.paymentMethod?.toLowerCase() === "cash" ? total + attendee.amount : total;
  }, 0);

  const onlinePaidTotal = conferencePaidAttendees.reduce((total, attendee) => {
    return attendee.paymentMethod?.toLowerCase() === "online" ? total + attendee.amount : total;
  }, 0);

  const otherPaidTotal = conferencePaidAttendees.reduce((total, attendee) => {
    const method = attendee.paymentMethod?.toLowerCase();
    return method && method !== "cash" && method !== "online" ? total + attendee.amount : total;
  }, 0);

  const grandPaidTotal = conferencePaidAttendees.reduce((total, attendee) => total + attendee.amount, 0);

  function getPaymentMethodTone(method?: string | null) {
    const normalized = (method || "cash").toLowerCase();
    if (normalized === "online") return "bg-orange-500/20 text-orange-300 border border-orange-500/30";
    if (normalized === "other") return "bg-rose-500/20 text-rose-300 border border-rose-500/30";
    return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  }

  function calculateCashBreakdownTotal() {
    return (
      billCounts.one * 1 +
      billCounts.five * 5 +
      billCounts.ten * 10 +
      billCounts.twenty * 20 +
      billCounts.fifty * 50 +
      billCounts.hundred * 100 +
      billCounts.twoHundred * 200 +
      billCounts.fiveHundred * 500 +
      billCounts.thousand * 1000
    );
  }

  function handleBulkEntryInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;

    // Track start of new input sequence for QR speed detection
    if (!bulkLatestValueRef.current && value) {
      bulkInputStartTimeRef.current = Date.now();
    }
    bulkLatestValueRef.current = value;
    setBulkEntryInput(value);

    // Clear pending timers
    if (bulkScanTimerRef.current) {
      clearTimeout(bulkScanTimerRef.current);
      bulkScanTimerRef.current = null;
    }
    if (bulkSearchTimerRef.current) {
      clearTimeout(bulkSearchTimerRef.current);
      bulkSearchTimerRef.current = null;
    }

    if (!value.trim()) {
      setBulkEntrySearchResults([]);
      setBulkEntryScanning(false);
      return;
    }

    // After 80ms of no new input, decide: QR scan or manual type
    bulkScanTimerRef.current = setTimeout(async () => {
      bulkScanTimerRef.current = null;
      const currentVal = bulkLatestValueRef.current.trim();
      if (!currentVal) return;
      const elapsed = bulkInputStartTimeRef.current ? Date.now() - bulkInputStartTimeRef.current : 9999;

      // QR scanners deliver full input in <200ms — direct lookup, no search needed
      if (currentVal.length >= 4 && elapsed < 200) {
        setBulkEntryScanning(true);
        bulkLatestValueRef.current = "";
        bulkInputStartTimeRef.current = null;
        setBulkEntryInput("");
        setBulkEntrySearchResults([]);
        try {
          const res = await fetch("/api/qr/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeKey: currentVal, attendeeId: currentVal, committeeName }),
          });
          if (!res.ok) {
            setError("Attendee not found.");
          } else {
            const body = await res.json();
            addToBulkEntryList({
              id: body.attendeeId ?? currentVal,
              name: body.fullName ?? currentVal,
              attendeeId: body.attendeeId ?? currentVal,
              church: body.church || "",
              conference: normalizeConference(body.conference),
            });
            
            // Broadcast to /display page in real-time for each bulk entry scan
            void sendDisplayEvent("scan", {
              fullName: body.fullName,
              church: body.church ?? "",
              conference: body.conference ?? "leyte",
              paymentMethod: "pending",
            });
          }
        } catch {
          setError("Unable to lookup attendee.");
        } finally {
          setBulkEntryScanning(false);
          if (bulkEntryInputRef.current) bulkEntryInputRef.current.focus();
        }
        return;
      }

      // Manual typing — debounced search (300ms after last keystroke)
      bulkSearchTimerRef.current = setTimeout(async () => {
        bulkSearchTimerRef.current = null;
        const searchVal = bulkLatestValueRef.current.trim();
        if (!searchVal || searchVal.length < 2) {
          setBulkEntrySearchResults([]);
          return;
        }
        try {
          if (bulkSearchAbortRef.current) {
            bulkSearchAbortRef.current.abort();
          }
          bulkSearchAbortRef.current = new AbortController();

          const res = await fetch("/api/qr/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: searchVal, includeLunch: false }),
            signal: bulkSearchAbortRef.current.signal,
          });
          if (!res.ok) { setBulkEntrySearchResults([]); return; }
          const body = await res.json();
          setBulkEntrySearchResults(
            (body.data || []).map((att: any) => ({
              id: att.id,
              name: att.full_name,
              attendeeId: att.id,
              church: att.church || "",
              paymentStatus: att.payment_status === "paid" ? "paid" : "pending",
              conference: normalizeConference(att.conference),
            }))
          );
        } catch {
          setBulkEntrySearchResults([]);
        }
      }, 200);
    }, 80);
  }

  function addToBulkEntryList(attendee: { id: string; name: string; attendeeId: string; church?: string; paymentStatus?: "paid" | "pending"; conference?: "leyte" | "cebu" }) {
    const isDuplicate = bulkEntryList.some(a => a.attendeeId === attendee.attendeeId);
    if (isDuplicate) {
      setError("Attendee already added to bulk list.");
      return;
    }
    setBulkEntryList(prev => [...prev, attendee]);
    setBulkEntryInput("");
    setBulkEntrySearchResults([]);
    if (bulkEntryInputRef.current) bulkEntryInputRef.current.focus();
  }

  function removeFromBulkEntryList(attendeeId: string) {
    setBulkEntryList(prev => prev.filter(a => a.attendeeId !== attendeeId));
  }

  async function processBulkEntries() {
    if (bulkEntryList.length === 0) {
      setError("Please add at least one attendee to the list.");
      return;
    }

    setBulkEntryProcessing(true);
    setError("");
    setBulkEntryResults(bulkEntryList.map(a => ({ id: a.attendeeId, name: a.name, status: "loading" as const })));

    const attendeeIds = bulkEntryList.map(a => a.attendeeId);
    const attendeeNames = bulkEntryList.map(a => a.name);
    const primaryConference = bulkEntryList[0]?.conference ?? "leyte";

    try {
      const paymentRes = await fetch("/api/qr/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeIds,
          attendeeNames,
          committeeName,
          conferenceLabel: primaryConference === "cebu" ? "CEBU Conference" : "LEYTE Conference",
          paymentMethod: bulkEntryPaymentMethod,
        }),
      });

      if (!paymentRes.ok) {
        const body = await paymentRes.json().catch(() => ({}));
        setError(body.message ?? "Unable to process bulk payments.");
        setBulkEntryProcessing(false);
        return;
      }

      const paymentBody = await paymentRes.json();
      if (paymentBody.data) {
        paymentBody.data.successful.forEach((p: any) => {
          addToPaidList({
            id: p.id ?? null,
            name: p.attendeeName,
            amount: p.amount,
            paymentMethod: p.paymentMethod ?? "cash",
            notes: null,
            paidAt: p.paidAt,
            paidByCommittee: p.paidByCommittee,
            attendeeId: p.attendeeId,
            conference: bulkEntryList.find(a => a.attendeeId === p.attendeeId)?.conference ?? primaryConference,
          });
          setBulkEntryResults(prev => prev.map(r => r.id === p.attendeeId ? { ...r, status: "success" } : r));
        });

        paymentBody.data.failed.forEach((f: any) => {
          setBulkEntryResults(prev => prev.map(r => r.id === f.attendeeId ? { ...r, status: "error", message: f.error } : r));
        });

        // Broadcast each successful attendee to /display page one by one
        paymentBody.data.successful.forEach((p: any, index: number) => {
          setTimeout(() => {
            const bulkAttendee = bulkEntryList.find(a => a.attendeeId === p.attendeeId);
            void sendDisplayEvent("scan", {
              fullName: p.attendeeName,
              church: bulkAttendee?.church ?? "",
              conference: (bulkAttendee?.conference ?? primaryConference) === "cebu" ? "CEBU Conference" : "LEYTE Conference",
              paymentMethod: p.paymentMethod ?? "cash",
            });

            // Mirror single-payment display flow for bulk entries.
            // If method is online, display page will show GCash/Maya panel.
            setTimeout(() => {
              void sendDisplayEvent("payment-method-selected", {
                paymentMethod: (p.paymentMethod ?? bulkEntryPaymentMethod ?? "cash").toLowerCase() === "online" ? "online" : "cash",
              });
            }, 120);
          }, index * 1500); // 1.5 seconds delay between each attendee
        });

        const successCount = paymentBody.data.successful.length;
        setError(`✓ Processed ${successCount} out of ${bulkEntryList.length} payments.`);
        setBulkEntryList([]);
      }
    } catch (err) {
      setError("Unable to process bulk payments.");
    } finally {
      setBulkEntryProcessing(false);
    }
  }

  async function processSingleBulkEntry() {
    if (!bulkEntryInput.trim()) return;

    const input = bulkEntryInput.trim();
    
    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeKey: input, attendeeId: input, committeeName }),
      });

      if (!res.ok) {
        setError("Attendee not found.");
        return;
      }

      const body = await res.json();
      addToBulkEntryList({
        id: body.attendeeId ?? input,
        name: body.fullName ?? input,
        attendeeId: body.attendeeId ?? input,
        church: body.church || "",
        conference: normalizeConference(body.conference),
      });
    } catch (err) {
      setError("Unable to lookup attendee.");
    }
  }

  async function handleBulkQR(bulkRegistrationId: string, contactPerson: string | null) {
    setProcessingAttendeeId(bulkRegistrationId);
    setShowScanAnimation(true);
    setTimeout(() => setShowScanAnimation(false), 500);

    try {
      const res = await fetch(
        `/api/qr/bulk-attendees?bulkRegistrationId=${encodeURIComponent(bulkRegistrationId)}&contactPerson=${encodeURIComponent(contactPerson || "")}`
      );

      if (!res.ok) {
        setError("Unable to load bulk attendees.");
        return;
      }

      const body = await res.json();
      if (body.data && body.data.attendees) {
        const attendees: BulkAttendee[] = body.data.attendees.map((att: any) => ({
          id: att.id,
          name: att.name,
          church: att.church,
          ministry: att.ministry,
          conference: att.conference,
          selected: false,
        }));

        setBulkModal({
          bulkRegistrationId,
          contactPerson: body.data.contactPerson,
          attendees,
          conference: body.data.attendees[0]?.conference?.toLowerCase().includes("cebu")
            ? "CEBU Conference"
            : "LEYTE Conference",
        });
      }
    } catch (err) {
      setError("Bulk QR lookup error.");
    } finally {
      setProcessingAttendeeId(null);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sourceType = params.get("sourceType");
    const sourceId = params.get("sourceId");
    const name = params.get("name");

    if (!isAuthenticated) return;

    if (sourceType === "bulk" && sourceId) {
      void handleBulkQR(sourceId, name);
    }
  }, [isAuthenticated]);

  function toggleBulkAttendeeSelection(attendeeId: string) {
    if (!bulkModal) return;
    const updated = bulkModal.attendees.map((att) =>
      att.id === attendeeId ? { ...att, selected: !att.selected } : att
    );
    setBulkModal({ ...bulkModal, attendees: updated });
  }

  function selectAllBulkAttendees() {
    if (!bulkModal) return;
    setBulkModal({
      ...bulkModal,
      attendees: bulkModal.attendees.map((att) => ({ ...att, selected: true })),
    });
  }

  function deselectAllBulkAttendees() {
    if (!bulkModal) return;
    setBulkModal({
      ...bulkModal,
      attendees: bulkModal.attendees.map((att) => ({ ...att, selected: false })),
    });
  }

  async function processBulkPayment() {
    if (!bulkModal) return;

    const selectedAttendees = bulkModal.attendees.filter((att) => att.selected);
    if (selectedAttendees.length === 0) {
      setError("Please select at least one attendee.");
      return;
    }

    setBulkPaymentProcessing(true);
    setError("");

    try {
      const res = await fetch("/api/qr/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendeeIds: selectedAttendees.map((att) => att.id),
          attendeeNames: selectedAttendees.map((att) => att.name),
          committeeName,
          conferenceLabel: bulkModal.conference,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? "Unable to process payments.");
        return;
      }

      const body = await res.json();
      if (body.data && body.data.successful.length > 0) {
        const paidIds = new Set(body.data.successful.map((p: any) => p.attendeeId));
        const updated = bulkModal.attendees.map((att) =>
          paidIds.has(att.id) ? { ...att, selected: false } : att
        );
        setBulkModal({ ...bulkModal, attendees: updated });
        setError(`Successfully processed ${body.data.successful.length} payment(s).`);
      }
    } catch (err) {
      setError("Unable to process bulk payments.");
    } finally {
      setBulkPaymentProcessing(false);
    }
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

  const performSearch = async (query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      searchAbortRef.current = new AbortController();

      const res = await fetch("/api/qr/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: normalizedQuery, includeLunch: false }),
        signal: searchAbortRef.current.signal,
      });

      if (!res.ok) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      const body = await res.json();
      if (body.data && Array.isArray(body.data)) {
        setSearchResults(
          body.data.map((att: any) => ({
            id: att.id,
            fullName: att.full_name,
            church: att.church,
            ministry: att.ministry,
            paymentStatus: att.payment_status || "pending",
            lunchClaimed: !!att.lunch_claimed,
          })),
        );
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  function debounceSearch(query: string) {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query);
    }, 220);
  }

  function handleUserSelect(userId: string) {
    setUserSearch("");
    setSearchResults([]);
    void doLookup(userId, false);
  }

  function logout() {
    if (cameraActive) {
      stopCamera();
    }
    setIsAuthenticated(false);
    setManualCode("");
    setModal(null);
    setBulkModal(null);
    setWalkInOpen(false);
    setWalkInFullName("");
    setWalkInChurch("");
    setPaidAttendees([]);
    setPaidAttendeesLoaded(false);
    setPaidAttendeesLoading(false);
    setSearchResults([]);
  }

  if (!loginReady) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-orange-950 to-orange-900 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img
              src="/JSCI_CONFERENCE.png"
              alt="JSCI Conference"
              className="w-72 object-contain drop-shadow-2xl"
            />
          </div>

          <div className="bg-black/60 border border-orange-500/40 backdrop-blur-sm rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-black text-white mb-2">QR Reader</h1>
              <p className="text-orange-300 font-semibold tracking-wide">Committee Login</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-orange-200 mb-2">Committee Name</label>
                <select
                  value={committeeName}
                  onChange={(e) => setCommitteeName(e.target.value as typeof committeeNames[number])}
                  className="w-full px-4 py-3 bg-black/50 border-2 border-orange-500/50 rounded-xl focus:outline-none focus:border-orange-400 font-semibold text-white"
                  required
                >
                  <option value="" className="bg-black">Select committee</option>
                  {committeeNames.map((name) => (
                    <option key={name} value={name} className="bg-black">
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-orange-200 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border-2 border-orange-500/50 rounded-xl focus:outline-none focus:border-orange-400 font-semibold text-white placeholder-orange-900"
                  required
                />
              </div>

              <label className="flex items-center gap-3 text-orange-200 font-semibold">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 accent-orange-500"
                />
                Remember me
              </label>

              {error && (
                <div className="p-3 bg-red-900/40 border border-red-500/50 text-red-300 rounded-xl text-sm font-semibold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black py-3 rounded-xl shadow-lg shadow-orange-900/50 transition"
              >
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
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.38em] text-orange-300/90 sm:text-xs">
              {activeScannerMode === "payment" ? "QR Payment Scanner" : activeScannerMode === "lunch" ? "QR Lunch Scanner" : "QR Kit Scanner"}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              {activeScannerMode === "payment" ? "Payment Collection" : activeScannerMode === "lunch" ? "Lunch Claim" : "Kit Claim"}
            </h1>
            <p className="mt-3 text-sm text-orange-100/75 sm:text-base">Logged in as <span className="font-bold text-orange-300">{committeeName}</span></p>
          </div>

          <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2 rounded-2xl border border-orange-500/30 bg-black/25 p-2 shadow-xl shadow-black/25 backdrop-blur-sm">
            <button
              onClick={() => setActiveScannerMode("payment")}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                activeScannerMode === "payment"
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-950/40"
                  : "border border-orange-500/25 bg-black/35 text-orange-100 hover:border-orange-400/50 hover:bg-orange-500/10"
              }`}
            >
              Payment
            </button>
            <button
              onClick={() => setActiveScannerMode("lunch")}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                activeScannerMode === "lunch"
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-950/40"
                  : "border border-orange-500/25 bg-black/35 text-orange-100 hover:border-orange-400/50 hover:bg-orange-500/10"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v9" />
                <path d="M12 3v9" />
                <path d="M10 12v9" />
                <path d="M17 3c0 4-2 6-2 9v9" />
              </svg>
              Lunch
            </button>
            <button
              onClick={() => setActiveScannerMode("kit")}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                activeScannerMode === "kit"
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-950/40"
                  : "border border-orange-500/25 bg-black/35 text-orange-100 hover:border-orange-400/50 hover:bg-orange-500/10"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
                <path d="M2 7h20v5H2z" />
                <path d="M12 22V7" />
                <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Z" />
                <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />
              </svg>
              Kit
            </button>
          </div>

          <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-orange-500/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-7">
            <div>
              <input
                ref={scanInputRef}
                type="text"
                value={manualCode}
                onChange={handleScanInputChange}
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
                    <p className="mt-1 text-sm text-orange-100/60">
                      {activeScannerMode === "payment"
                        ? "Search attendee names to start payment lookup."
                        : activeScannerMode === "lunch"
                          ? "Search attendee names to start lunch lookup."
                          : "Search attendee names to start kit lookup."}
                    </p>
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
                            <div className="ml-2 flex flex-col items-end gap-2">
                              {result.paymentStatus === "paid" ? (
                                <span className="whitespace-nowrap rounded-full border border-green-500 bg-green-600/30 px-2.5 py-1 text-xs font-bold text-green-300">PAID</span>
                              ) : (
                                <span className="whitespace-nowrap rounded-full border border-orange-500 bg-orange-600/30 px-2.5 py-1 text-xs font-bold text-orange-300">UNPAID</span>
                              )}
                            </div>
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
          </div>

          {activeScannerMode === "kit" && (
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-black/35 px-4 py-2 text-xs font-bold uppercase tracking-wider text-orange-200 shadow-lg shadow-black/20">
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                QR Reader Ready - scan attendee QR code
              </div>
            </div>
          )}

          {processingAttendeeId && (
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-3 rounded-full border border-orange-500/25 bg-black/35 px-4 py-2 text-sm font-semibold text-orange-200 shadow-lg shadow-black/20">
                <div className="h-5 w-5 rounded-full border-[3px] border-orange-500 border-t-green-400 animate-spin" />
                Reading QR...
              </div>
            </div>
          )}

          {error && (
            <div className="mx-auto w-full max-w-3xl rounded-2xl border border-red-500/40 bg-red-900/25 px-4 py-3 text-center text-sm font-semibold text-red-300 shadow-lg shadow-black/20">
              {error}
            </div>
          )}

          {activeScannerMode === "payment" && (
          <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3">
            <button
              onClick={() => setWalkInOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-bold text-white shadow-lg shadow-orange-950/40 transition hover:brightness-110"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="10" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" />
              </svg>
              Walk-in Registration
            </button>
            <button
              onClick={() => {
                setShowBulkEntry(true);
                setBulkEntryPaymentMethod("cash");
                setBulkEntryResults([]);
                setBulkEntrySearchResults([]);
                setBulkEntryInput("");
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-black/35 px-4 text-sm font-bold text-orange-100 transition hover:border-orange-400/50 hover:bg-orange-500/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
                <path d="M8 4v16" />
              </svg>
              Bulk Entry
            </button>
          </div>
          )}
        </div>

        {activeScannerMode === "payment" && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => {
                setShowPaymentsTableModal(true);
                void loadPaidAttendees();
              }}
              className="group inline-flex w-full max-w-xl items-center justify-between gap-4 rounded-[26px] border border-orange-500/30 bg-black/35 px-5 py-5 text-left text-white shadow-2xl shadow-black/30 transition hover:border-orange-400/50 hover:bg-orange-500/10"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-300 ring-1 ring-orange-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <path d="M7 8h10" />
                    <path d="M7 12h6" />
                    <path d="M16 20H8" />
                  </svg>
                </div>
                <span>
                  <span className="block text-xl font-bold text-white">Payments Collected</span>
                  <span className="mt-1 block text-sm text-orange-100/60">Open payments table in modal</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-2 rounded-2xl border border-green-500/35 bg-green-600/20 px-4 py-3 text-sm font-black text-green-300 shadow-lg shadow-green-950/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m20 6-11 11-5-5" />
                </svg>
                {paidAttendeesLoading ? "Loading..." : paidAttendeesLoaded ? `${paidAttendees.length} Paid` : "Tap to Load"}
              </span>
            </button>
          </div>
        )}

        <div className="flex justify-center pt-2">
          <button
            onClick={logout}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Logout
          </button>
        </div>
      </div>

        {/* Camera Modal */}
        {cameraActive && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-2xl">
              <div className="bg-gradient-to-br from-neutral-950 to-orange-950 rounded-3xl border-2 border-orange-500/40 overflow-hidden shadow-2xl">
                {/* Camera Header */}
                <div className="bg-gradient-to-r from-orange-600 to-amber-500 px-6 py-4">
                  <h3 className="text-white font-black text-lg">📷 Camera Scanner</h3>
                </div>

                {/* Camera View */}
                <div className="relative bg-black">
                  <div className="aspect-video rounded-lg overflow-hidden mx-4 mt-4 border-2 border-orange-500/30">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Scanning Frame Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="absolute w-56 h-56 border-4 border-green-400 rounded-lg opacity-60 animate-pulse" />
                      
                      {/* Corner Markers */}
                      <div className="absolute inset-0">
                        <div className="absolute top-20 left-20 w-8 h-8 border-t-4 border-l-4 border-green-400" />
                        <div className="absolute top-20 right-20 w-8 h-8 border-t-4 border-r-4 border-green-400" />
                        <div className="absolute bottom-20 left-20 w-8 h-8 border-b-4 border-l-4 border-green-400" />
                        <div className="absolute bottom-20 right-20 w-8 h-8 border-b-4 border-r-4 border-green-400" />
                      </div>

                      {/* Center Crosshair */}
                      <div className="w-1 h-20 bg-green-400 opacity-50 mx-1" />
                      <div className="w-20 h-1 bg-green-400 opacity-50" />
                    </div>
                  </div>

                  {/* Scanning Status */}
                  <div className="text-center py-4">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-green-400 font-bold text-sm uppercase tracking-wider">Scanning...</span>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="p-6 space-y-3 bg-black/30">
                  <p className="text-center text-orange-300 font-bold text-sm uppercase tracking-wider">
                    Point camera at QR code to scan
                  </p>
                  <button
                    onClick={stopCamera}
                    className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition"
                  >
                    Close Camera
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showPaymentsTableModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-black/80 to-orange-950/40 backdrop-blur-md p-4">
            {/* Modal Container */}
            <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-slate-950 via-black to-orange-950/20 shadow-2xl shadow-orange-950/50 flex flex-col">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-orange-500/20 px-6 py-5 bg-black/40 backdrop-blur-sm">
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight">Payments Collected</h2>
                  <p className="mt-1.5 text-sm text-orange-200/70">Review, search, edit, and export committee payments by conference.</p>
                  <div className="mt-3 inline-flex rounded-xl border border-orange-500/30 bg-black/40 p-1">
                    {(["leyte", "cebu"] as const).map((conference) => {
                      const isActive = paymentsConference === conference;
                      const count = paidAttendees.filter((attendee) => normalizeConference(attendee.conference) === conference).length;

                      return (
                        <button
                          key={conference}
                          onClick={() => setPaymentsConference(conference)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${isActive ? "bg-orange-500 text-white shadow" : "text-orange-200/80 hover:bg-orange-500/20"}`}
                        >
                          {conference === "cebu" ? "Cebu" : "Leyte"} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                  <button
                    onClick={exportPaymentsToExcel}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500 hover:to-emerald-600 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 1.5L18.5 7H15V3.5zM6 20V4h7v5h5v11H6zm2-8h8v1H8v-1zm0 2.5h8v1H8v-1zm0-5h4v1H8v-1z"/>
                    </svg>
                    Export Excel
                  </button>
                  <div className="flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-600/15 px-5 py-2.5 shadow-lg shadow-green-950/20">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="m20 6-11 11-5-5" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                    <p className="text-sm font-black text-green-300">{conferencePaidAttendees.length} Paid</p>
                  </div>
                  <button
                    onClick={() => setShowPaymentsTableModal(false)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-700/60 hover:bg-slate-600/80 px-5 py-2.5 text-sm font-bold text-white transition active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    Close
                  </button>
                </div>
              </div>

              {/* Content Area with Scrolling */}
              <div className="payments-scrollbar flex-1 overflow-y-auto relative group" id="paymentsTableContainer">
                <div className="p-6 space-y-6">
                  {/* Payment Summary Card */}
                  <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-950/30 to-amber-950/20 p-6 shadow-lg shadow-orange-950/20 backdrop-blur-sm">
                    <div className="mb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-orange-300">{formatConferenceLabel(paymentsConference)}</p>
                      <p className="text-xs font-bold uppercase tracking-wider text-orange-200/70">Total Collected</p>
                      <p className="mt-2 text-4xl font-black text-green-400">{formatPeso(grandPaidTotal)}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Cash</p>
                        <p className="mt-2 text-lg font-black text-amber-300">{formatPeso(cashPaidTotal)}</p>
                      </div>
                      <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Online</p>
                        <p className="mt-2 text-lg font-black text-orange-300">{formatPeso(onlinePaidTotal)}</p>
                      </div>
                      <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Other</p>
                        <p className="mt-2 text-lg font-black text-fuchsia-300">{formatPeso(otherPaidTotal)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Search Section */}
                  <div>
                    <label className="block text-sm font-bold text-orange-300 mb-2.5">Search payments</label>
                    <div className="relative">
                      <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                      </svg>
                      <input
                        type="text"
                        value={paidSearch}
                        onChange={(e) => setPaidSearch(e.target.value)}
                        placeholder="Search by name, committee, amount, or time..."
                        className="w-full pl-12 pr-4 py-3 bg-black/60 border-2 border-orange-500/30 hover:border-orange-500/50 focus:border-orange-400 text-white rounded-xl placeholder-orange-100/30 focus:outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Cash Breakdown Calculator */}
                  <div>
                    <button
                      onClick={() => setShowCashBreakdown(!showCashBreakdown)}
                      className="w-full flex items-center justify-between px-6 py-3.5 bg-gradient-to-r from-amber-600/40 to-orange-600/40 border border-amber-500/40 hover:from-amber-600/50 hover:to-orange-600/50 text-amber-300 font-bold rounded-xl transition active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2v20M2 12h20"/>
                        </svg>
                        Show Cash Breakdown Calculator
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 transition-transform ${showCashBreakdown ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </button>

                    {showCashBreakdown && (
                      <div className="mt-4 p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-950/80 to-amber-950/30 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
                        <h3 className="text-lg font-bold text-amber-300 mb-5">Cash Denominations Breakdown</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          {[
                            { label: "1 Peso", key: "one", value: billCounts.one },
                            { label: "5 Peso", key: "five", value: billCounts.five },
                            { label: "10 Peso", key: "ten", value: billCounts.ten },
                            { label: "20 Peso", key: "twenty", value: billCounts.twenty },
                            { label: "50 Peso", key: "fifty", value: billCounts.fifty },
                            { label: "100 Peso", key: "hundred", value: billCounts.hundred },
                            { label: "200 Peso", key: "twoHundred", value: billCounts.twoHundred },
                            { label: "500 Peso", key: "fiveHundred", value: billCounts.fiveHundred },
                            { label: "1000 Peso", key: "thousand", value: billCounts.thousand },
                          ].map((denom) => (
                            <div key={denom.key} className="flex items-center gap-3 px-4 py-3 bg-black/40 rounded-lg border border-amber-500/20">
                              <label className="text-amber-200/70 font-semibold min-w-fit text-sm">{denom.label}</label>
                              <input
                                type="number"
                                min="0"
                                value={denom.value}
                                onChange={(e) => setBillCounts({ ...billCounts, [denom.key]: parseInt(e.target.value) || 0 })}
                                className="flex-1 px-3 py-1 bg-slate-900/60 border border-amber-500/30 text-white rounded-lg text-sm focus:outline-none focus:border-amber-400"
                              />
                              <span className="text-amber-300/60 text-xs font-semibold">{formatPeso(denom.value * parseInt(denom.label.split(" ")[0]))}</span>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-amber-500/30 pt-5 space-y-3">
                          <div className="flex justify-between items-center px-4 py-3 bg-black/30 rounded-lg">
                            <span className="text-amber-200/70 font-bold">Breakdown Total:</span>
                            <span className="text-amber-300 font-black text-lg">{formatPeso(calculateCashBreakdownTotal())}</span>
                          </div>
                          <div className="flex justify-between items-center px-4 py-3 bg-black/30 rounded-lg">
                            <span className="text-amber-200/70 font-bold">System Cash Total:</span>
                            <span className="text-amber-300 font-black text-lg">{formatPeso(cashPaidTotal)}</span>
                          </div>
                          <div className={`flex justify-between items-center px-4 py-3 rounded-lg border-2 ${calculateCashBreakdownTotal() === cashPaidTotal ? 'bg-green-500/15 border-green-500/40' : 'bg-red-500/15 border-red-500/40'}`}>
                            <span className={`font-bold ${calculateCashBreakdownTotal() === cashPaidTotal ? 'text-green-300' : 'text-red-300'}`}>Balance:</span>
                            <span className={`font-black text-lg ${calculateCashBreakdownTotal() === cashPaidTotal ? 'text-green-300' : 'text-red-300'}`}>
                              {calculateCashBreakdownTotal() === cashPaidTotal ? "✓ BALANCED" : `Difference: ${formatPeso(Math.abs(calculateCashBreakdownTotal() - cashPaidTotal))}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payments Table */}
                  <div className="rounded-2xl border border-orange-500/25 bg-black/40 overflow-hidden shadow-xl shadow-orange-950/20">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-orange-500/30 bg-gradient-to-r from-black/60 to-orange-950/30">
                            <th className="px-4 py-4 text-left font-bold text-orange-300">No.</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Name</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Type</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Amount</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Conference</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Method</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Notes</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Payment By</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Time</th>
                            <th className="px-4 py-4 text-left font-bold text-orange-300">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-500/15">
                          {filteredPaidAttendees.length > 0 ? (
                            filteredPaidAttendees.map((attendee, index) => (
                              <tr key={attendee.attendeeId} className="hover:bg-orange-950/20 transition-colors group">
                                <td className="px-4 py-4 text-white font-semibold">{index + 1}</td>
                                <td className="px-4 py-4 text-white font-semibold group-hover:text-orange-300 transition">{attendee.name}</td>
                                <td className="px-4 py-4">
                                  {attendee.isWalkIn
                                    ? <span className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold bg-orange-500/20 border border-orange-500/40 text-orange-300">Walk-in</span>
                                    : <span className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">Online Reg.</span>
                                  }
                                </td>
                                <td className="px-4 py-4 text-green-400 font-black">{formatPeso(attendee.amount)}</td>
                                <td className="px-4 py-4">
                                  {editingPaymentId === (attendee.attendeeId || attendee.id) ? (
                                    <select
                                      value={editConference}
                                      onChange={(e) => setEditConference((e.target.value as "leyte" | "cebu"))}
                                      className="px-3 py-1 rounded-lg bg-slate-900/60 border border-orange-500/30 text-white focus:outline-none focus:border-orange-400 text-sm font-semibold"
                                    >
                                      <option value="leyte">Leyte</option>
                                      <option value="cebu">Cebu</option>
                                    </select>
                                  ) : (
                                    <span className="inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold bg-sky-500/20 border border-sky-500/40 text-sky-300">
                                      {normalizeConference(attendee.conference) === "cebu" ? "Cebu" : "Leyte"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  {editingPaymentId === (attendee.attendeeId || attendee.id) ? (
                                    <select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} className="px-3 py-1 rounded-lg bg-slate-900/60 border border-orange-500/30 text-white focus:outline-none focus:border-orange-400 text-sm font-semibold">
                                      <option value="cash">Cash</option>
                                      <option value="online">Online</option>
                                      <option value="check">Check</option>
                                      <option value="other">Other</option>
                                    </select>
                                  ) : (
                                    <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold ${getPaymentMethodTone(attendee.paymentMethod)}`}>
                                      {formatPaymentMethod(attendee.paymentMethod)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-orange-200/70 text-sm">
                                  {editingPaymentId === (attendee.attendeeId || attendee.id) ? (
                                    <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full px-2 py-1 rounded bg-slate-900/60 border border-orange-500/30 text-white text-sm focus:outline-none focus:border-orange-400" />
                                  ) : (
                                    attendee.notes ?? "—"
                                  )}
                                </td>
                                <td className="px-4 py-4 text-amber-200/80">{attendee.paidByCommittee}</td>
                                <td className="px-4 py-4 text-gray-400 text-xs">{new Date(attendee.paidAt).toLocaleTimeString()}</td>
                                <td className="px-4 py-4">
                                  {editingPaymentId === (attendee.attendeeId || attendee.id) ? (
                                    <div className="flex items-center gap-2">
                                      <button disabled={editSaving} onClick={() => savePaymentEdits(attendee.attendeeId)} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold text-sm transition active:scale-95 disabled:opacity-60">{editSaving ? 'Saving...' : 'Save'}</button>
                                      <button disabled={editSaving} onClick={() => { setEditingPaymentId(null); setEditPaymentMethod('cash'); setEditConference('leyte'); setEditNotes(''); }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition active:scale-95">Cancel</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setEditingPaymentId(attendee.attendeeId); setEditPaymentMethod(attendee.paymentMethod ?? 'cash'); setEditConference(normalizeConference(attendee.conference)); setEditNotes(attendee.notes ?? ''); }} className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-lg font-semibold text-sm transition active:scale-95 flex items-center gap-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                      </svg>
                                      Edit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={10} className="px-4 py-12 text-center">
                                <p className="text-gray-400 font-semibold">No paid attendees match your search.</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Back to Top Button */}
                {filteredPaidAttendees.length > 5 && showBackToTop && (
                  <button
                    onClick={() => {
                      const container = document.getElementById('paymentsTableContainer');
                      if (container) {
                        container.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="fixed bottom-8 right-8 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 px-5 py-3 text-white font-bold shadow-lg shadow-orange-950/50 transition active:scale-95"
                    style={{
                      animation: 'fadeInUpSmooth 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="18 15 12 9 6 15"/>
                    </svg>
                    Top
                  </button>
                )}

              </div>
            </div>
          </div>
        )}

        {/* Single Attendee Modal */}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-4 backdrop-blur-md">
            <div className="relative w-full max-w-[980px] max-h-[90vh] overflow-hidden rounded-[28px] border border-orange-500/30 bg-[linear-gradient(180deg,rgba(17,9,6,0.98),rgba(28,13,7,0.96))] shadow-[0_0_60px_rgba(249,115,22,0.12)]">
              <div className="max-h-[90vh] overflow-y-auto">
                <div className="relative p-5 sm:p-6 lg:p-7">
                  <button
                    onClick={() => {
                      resetDisplayBoard();
                      setModal(null);
                      setManualCode("");
                      setPaymentMethod("cash");
                      setShowOnlinePaymentDetails(false);
                      setShowSubstituteForm(false);
                      setSubstituteFullName("");
                      setSubstituteStatus("");
                      if (scanInputRef.current) scanInputRef.current.focus();
                    }}
                    className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close modal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>

                  <div className="text-center">
                    <div className="inline-flex items-center rounded-full border border-orange-500/40 bg-orange-600/15 px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                      {modal.conference}
                    </div>
                    <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
                      {modal.fullName}
                    </h2>
                  </div>

                  <div className="mt-6 grid gap-5 lg:grid-cols-[1.02fr_0.98fr]">
                    <div className="space-y-4">
                      <div className="rounded-[22px] border border-white/8 bg-black/35 p-4 shadow-lg shadow-black/25">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Ministry</p>
                            <p className="mt-1 text-base font-semibold text-white">{modal.ministry || "-"}</p>
                          </div>
                          <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Church</p>
                            <p className="mt-1 text-base font-semibold text-white">{modal.church || "-"}</p>
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-[22px] border p-5 text-center shadow-lg ${
                        modal.paymentStatus === "paid"
                          ? "border-green-500/30 bg-green-600/10"
                          : "border-orange-500/35 bg-orange-600/10"
                      }`}>
                        <p className={`text-5xl font-black uppercase tracking-[0.2em] ${modal.paymentStatus === "paid" ? "text-green-300" : "text-orange-300"}`}>
                          {modal.paymentStatus === "paid" ? "PAID" : "UNPAID"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-orange-500/25 bg-black/35 p-4 shadow-lg shadow-black/25">
                      {activeScannerMode === "payment" && (
                        <>
                          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-orange-500/20 bg-black/20 p-1.5">
                            <button
                              onClick={() => setShowSubstituteForm(false)}
                              className={`inline-flex h-11 items-center justify-center rounded-xl border text-sm font-bold transition ${
                                !showSubstituteForm
                                  ? "border-amber-400 bg-amber-500/20 text-amber-100"
                                  : "border-transparent bg-transparent text-amber-200/70 hover:bg-white/5"
                              }`}
                            >
                              Payment
                            </button>
                            <button
                              onClick={() => setShowSubstituteForm(true)}
                              className={`inline-flex h-11 items-center justify-center rounded-xl border text-sm font-bold transition ${
                                showSubstituteForm
                                  ? "border-orange-400 bg-orange-500/20 text-orange-100"
                                  : "border-transparent bg-transparent text-orange-200/70 hover:bg-white/5"
                              }`}
                            >
                              Substitute
                            </button>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/8 bg-black/25 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200/70">Payment Ready</p>
                            <p className="mt-2 text-sm text-orange-100/75">
                              {showSubstituteForm
                                ? "Switch to the substitute panel to replace this attendee."
                                : modal.paymentStatus === "paid"
                                  ? "This attendee is already paid. Use the footer actions or move to the next guest."
                                  : `Selected method: ${paymentMethod === "online" ? "Online" : "Cash"}`}
                            </p>
                          </div>

                          {!showSubstituteForm ? (
                          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-orange-500/20 bg-black/20 p-1.5">
                            <button
                              onClick={() => {
                                setPaymentMethod("cash");
                                setShowOnlinePaymentDetails(false);
                                void sendDisplayEvent("payment-method-selected", { paymentMethod: "cash" });
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-xl border text-sm font-bold transition ${
                                paymentMethod === "cash" && !showSubstituteForm
                                  ? "border-amber-400 bg-amber-500/20 text-amber-100"
                                  : "border-transparent bg-transparent text-amber-200/70 hover:bg-white/5"
                              }`}
                            >
                              💵 Cash
                            </button>
                            <button
                              onClick={() => {
                                setShowSubstituteForm(false);
                                setPaymentMethod("online");
                                void sendDisplayEvent("payment-method-selected", { paymentMethod: "online" });
                              }}
                              className={`inline-flex h-11 items-center justify-center rounded-xl border text-sm font-bold transition ${
                                paymentMethod === "online" && !showSubstituteForm
                                  ? "border-orange-400 bg-orange-500/20 text-orange-100"
                                  : "border-transparent bg-transparent text-orange-200/70 hover:bg-white/5"
                              }`}
                            >
                              💳 Online
                            </button>
                          </div>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-orange-500/20 bg-black/25 p-4">
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200/70">Substitute Attendee</p>
                              <p className="mt-1 text-sm text-orange-100/70">Replace this attendee while keeping the registration slot.</p>
                              <div className="relative mt-4">
                                <input
                                  type="text"
                                  value={substituteFullName}
                                  onChange={(event) => setSubstituteFullName(event.target.value)}
                                  placeholder="Enter substitute full name"
                                  className="h-12 w-full rounded-2xl border border-orange-500/40 bg-black/60 px-4 pr-11 text-sm font-semibold text-white placeholder-orange-100/30 outline-none transition focus:border-orange-400"
                                />
                                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-orange-200/55">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="7" />
                                    <path d="m21 21-4.3-4.3" />
                                  </svg>
                                </div>
                              </div>

                              <div className="mt-4 flex gap-2">
                                <button
                                  onClick={saveSubstituteAttendee}
                                  disabled={substituteSaving}
                                  className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-3 text-sm font-black text-white transition hover:from-orange-500 hover:to-amber-400 disabled:opacity-60"
                                >
                                  {substituteSaving ? "Saving..." : "Save Substitute"}
                                </button>
                                <button
                                  onClick={() => {
                                    setShowSubstituteForm(false);
                                    setSubstituteFullName("");
                                    setSubstituteStatus("");
                                  }}
                                  className="rounded-2xl border border-orange-500/25 bg-black/30 px-4 py-3 text-sm font-bold text-orange-100 transition hover:bg-orange-500/10"
                                >
                                  Cancel Substitute
                                </button>
                              </div>

                              {substituteStatus && <p className="mt-3 text-xs font-semibold text-amber-200">{substituteStatus}</p>}
                            </div>
                          )}
                        </>
                      )}

                      {activeScannerMode === "lunch" && (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-white/8 bg-black/25 p-4 text-center">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200/70">Lunch Claim</p>
                            <p className={`mt-2 text-sm font-black uppercase tracking-[0.14em] ${modal.lunch ? "text-emerald-300" : "text-slate-300"}`}>
                              {modal.lunch ? "✓ LUNCH CLAIMED" : "LUNCH NOT CLAIMED"}
                            </p>
                          </div>
                          {!modal.lunch ? (
                            <button
                              onClick={markLunchClaimed}
                              disabled={lunchProcessing || modal.paymentStatus !== "paid"}
                              className="w-full rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-4 text-base font-black text-white transition hover:from-orange-500 hover:to-amber-400 disabled:opacity-60"
                            >
                              {lunchProcessing ? "Processing..." : modal.paymentStatus === "paid" ? "MARK LUNCH AS CLAIMED" : "PAYMENT REQUIRED BEFORE LUNCH"}
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-600/10 py-4 text-center">
                              <p className="font-black text-emerald-300">LUNCH ALREADY CLAIMED</p>
                            </div>
                          )}
                        </div>
                      )}

                      {activeScannerMode === "kit" && (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200/70">Kit Items</p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                onClick={checkAllKitItems}
                                className="rounded-xl border border-orange-400/30 bg-orange-500/15 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-orange-200 transition hover:bg-orange-500/25"
                              >
                                Check All
                              </button>
                              <button
                                onClick={clearAllKitItems}
                                className="rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/10"
                              >
                                Clear All
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <label className="flex items-center gap-2 rounded-xl border border-orange-500/10 bg-black/35 px-3 py-2"><input type="checkbox" checked={modal.kit.toteBag} onChange={() => toggleKitItem("toteBag")} className="accent-orange-500" /><span className="text-sm font-semibold text-white">Tote Bag</span></label>
                              <label className="flex items-center gap-2 rounded-xl border border-orange-500/10 bg-black/35 px-3 py-2"><input type="checkbox" checked={modal.kit.mug} onChange={() => toggleKitItem("mug")} className="accent-orange-500" /><span className="text-sm font-semibold text-white">Mug</span></label>
                              <label className="flex items-center gap-2 rounded-xl border border-orange-500/10 bg-black/35 px-3 py-2"><input type="checkbox" checked={modal.kit.notebook} onChange={() => toggleKitItem("notebook")} className="accent-orange-500" /><span className="text-sm font-semibold text-white">Notebook</span></label>
                              <label className="flex items-center gap-2 rounded-xl border border-orange-500/10 bg-black/35 px-3 py-2"><input type="checkbox" checked={modal.kit.pencil} onChange={() => toggleKitItem("pencil")} className="accent-orange-500" /><span className="text-sm font-semibold text-white">Pencil</span></label>
                            </div>
                            {modal.kit.claimedByCommittee && (
                              <p className="mt-3 text-center text-xs text-gray-300">
                                Last update by {modal.kit.claimedByCommittee}
                                {modal.kit.claimedAt ? ` at ${new Date(modal.kit.claimedAt).toLocaleTimeString()}` : ""}
                              </p>
                            )}
                          </div>

                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 border-t border-orange-500/15 bg-black/35 px-0 pt-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      {activeScannerMode === "payment" && !showSubstituteForm ? (
                        <button
                          onClick={confirmPayment}
                          disabled={paymentProcessing || modal.paymentStatus === "paid"}
                          className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-5 text-sm font-black text-white transition hover:from-orange-500 hover:to-amber-400 disabled:opacity-60"
                        >
                          {paymentProcessing
                            ? "Processing..."
                            : modal.paymentStatus === "paid"
                              ? "Payment Already Confirmed"
                              : `Confirm ${paymentMethod === "online" ? "Online" : "Cash"} Payment`}
                        </button>
                      ) : activeScannerMode === "kit" ? (
                        <button
                          onClick={() => claimKitItems(false)}
                          disabled={kitProcessing || modal.paymentStatus !== "paid"}
                          className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-5 text-sm font-black text-white transition hover:from-orange-500 hover:to-amber-400 disabled:opacity-60"
                        >
                          {kitProcessing ? "Processing..." : modal.paymentStatus === "paid" ? "Marked as Claimed" : "PAYMENT REQUIRED BEFORE KIT CLAIM"}
                        </button>
                      ) : (
                        <div className="flex-1 rounded-2xl border border-white/8 bg-black/25 px-5 py-3 text-sm font-semibold text-orange-100/70">
                          {showSubstituteForm ? "Use the Save Substitute button in the right panel." : "Review the actions above, then close when finished."}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          resetDisplayBoard();
                          setModal(null);
                          setManualCode("");
                          setPaymentMethod("cash");
                          setShowOnlinePaymentDetails(false);
                          setShowSubstituteForm(false);
                          setSubstituteFullName("");
                          setSubstituteStatus("");
                          if (scanInputRef.current) scanInputRef.current.focus();
                        }}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-700 px-5 text-sm font-bold text-white transition hover:bg-slate-600 sm:w-44"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Walk-in Registration Modal */}
        {walkInOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-neutral-950 to-orange-950 rounded-3xl border border-orange-500/30 p-8 max-w-md w-full shadow-2xl">
              <div className="text-center mb-6">
                <p className="text-orange-300 text-xs font-bold uppercase tracking-wider">Walk-in Registration</p>
                <h2 className="text-3xl font-black text-white mt-2">Add Attendee</h2>
                <p className="text-orange-100/70 text-sm mt-2">This will be saved to Supabase and appear in QR search.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-orange-200 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={walkInFullName}
                    onChange={(e) => setWalkInFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-4 py-3 bg-black/70 border-2 border-orange-500/50 text-white rounded-xl placeholder-orange-100/25 focus:outline-none focus:border-orange-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-orange-200 mb-2">Church</label>
                  <input
                    type="text"
                    value={walkInChurch}
                    onChange={(e) => setWalkInChurch(e.target.value)}
                    placeholder="Enter church name"
                    className="w-full px-4 py-3 bg-black/70 border-2 border-orange-500/50 text-white rounded-xl placeholder-orange-100/25 focus:outline-none focus:border-orange-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-orange-200 mb-2">Conference</label>
                  <select
                    value={walkInConference}
                    onChange={(e) => setWalkInConference(e.target.value as "leyte" | "cebu")}
                    className="w-full px-4 py-3 bg-black/70 border-2 border-orange-500/50 text-white rounded-xl focus:outline-none focus:border-orange-400"
                  >
                    <option value="leyte">Leyte Conference</option>
                    <option value="cebu">Cebu Conference</option>
                  </select>
                </div>

                <p className="text-xs text-orange-100/70">
                  Choose where this walk-in attendee should be recorded.
                </p>

                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 rounded-xl text-sm font-semibold">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  <button
                    onClick={submitWalkInRegistration}
                    disabled={walkInSaving}
                    className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
                  >
                    {walkInSaving ? "Registering..." : "REGISTER WALK-IN"}
                  </button>

                  <button
                    onClick={() => {
                      setWalkInOpen(false);
                      setWalkInFullName("");
                      setWalkInChurch("");
                      setWalkInConference("leyte");
                    }}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Modal */}
        {bulkModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-auto">
            <div className="bg-gradient-to-br from-neutral-950 to-orange-950 rounded-3xl border border-orange-500/30 p-8 max-w-2xl w-full shadow-2xl my-8">
              <div className="text-center mb-8">
                <div className="inline-block bg-orange-600/20 border border-orange-500/50 px-4 py-1 rounded-full mb-4">
                  <p className="text-orange-300 text-xs font-bold uppercase tracking-wider">{bulkModal.conference}</p>
                </div>
                <h2 className="text-3xl font-black text-white">BULK PAYMENT</h2>
                {bulkModal.contactPerson && (
                  <p className="text-orange-100/60 mt-2">
                    Contact: <span className="text-orange-300 font-bold">{bulkModal.contactPerson}</span>
                  </p>
                )}
              </div>

              {/* Selection Controls */}
              <div className="flex gap-2 justify-center mb-6">
                <button
                  onClick={selectAllBulkAttendees}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg text-sm transition"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllBulkAttendees}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg text-sm transition"
                >
                  Clear All
                </button>
              </div>

              {/* Attendee List */}
              <div className="max-h-96 overflow-auto mb-6 space-y-2">
                {bulkModal.attendees.map((att) => (
                  <div
                    key={att.id}
                    onClick={() => toggleBulkAttendeeSelection(att.id)}
                    className={`cursor-pointer p-4 rounded-lg border-2 transition ${
                      att.selected
                        ? "bg-orange-600/20 border-orange-500"
                        : "bg-black/50 border-orange-500/15 hover:border-orange-500/40"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={att.selected || false}
                        onChange={() => {}}
                        className="w-5 h-5"
                      />
                      <div className="flex-1">
                        <p className="font-bold text-white">{att.name}</p>
                        <div className="text-xs text-orange-100/55 mt-1 space-y-0.5">
                          {att.ministry && <p>{att.ministry}</p>}
                          {att.church && <p>{att.church}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-orange-300">{formatPeso(200)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              {bulkModal.attendees.filter((a) => a.selected).length > 0 && (
                <div className="bg-green-600/20 border border-green-500/50 rounded-lg p-4 mb-6 text-center">
                  <p className="text-sm text-gray-300 mb-1">TOTAL</p>
                  <p className="text-3xl font-black text-white">
                    {formatPeso(bulkModal.attendees.filter((a) => a.selected).length * 200)}
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 rounded-lg text-sm font-semibold mb-6 text-center">
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={processBulkPayment}
                  disabled={bulkPaymentProcessing || bulkModal.attendees.filter((a) => a.selected).length === 0}
                  className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
                >
                  {bulkPaymentProcessing ? "Processing..." : "CONFIRM BULK PAYMENT"}
                </button>
                <button
                  onClick={() => {
                    setBulkModal(null);
                    setManualCode("");
                    if (scanInputRef.current) scanInputRef.current.focus();
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Entry Modal */}
        {showBulkEntry && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-auto">
            <div className="bg-gradient-to-br from-neutral-950 to-orange-950 rounded-3xl border border-orange-500/30 p-8 max-w-2xl w-full shadow-2xl my-8">
              <div className="text-center mb-8">
                <div className="inline-block bg-orange-600/20 border border-orange-500/50 px-4 py-1 rounded-full mb-4">
                  <p className="text-orange-300 text-xs font-bold uppercase tracking-wider">Bulk Entry</p>
                </div>
                <h2 className="text-3xl font-black text-white">Scan or Type Attendees</h2>
                <p className="text-orange-100/60 mt-2">Scan QR codes or type attendee IDs/names to build your list, then process all at once</p>
              </div>

              {/* Quick Input Field */}
              <div className="mb-6 relative">
                <label className="block text-sm font-bold text-orange-300 mb-2">Scan or Type Attendee ID/Name</label>
                <div className="relative">
                  <input
                    ref={bulkEntryInputRef}
                    type="text"
                    value={bulkEntryInput}
                    onChange={handleBulkEntryInput}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        processSingleBulkEntry();
                      }
                    }}
                    placeholder="Scan QR code or type name..."
                    disabled={bulkEntryProcessing || bulkEntryScanning}
                    autoFocus
                    className={`w-full px-4 py-3 bg-black/70 border-2 rounded-xl placeholder-orange-100/25 focus:outline-none transition-colors disabled:opacity-50 ${
                      bulkEntryScanning
                        ? "text-transparent caret-transparent border-green-500/70"
                        : "text-white border-orange-500/40 focus:border-orange-400"
                    }`}
                  />
                  {bulkEntryScanning && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl pointer-events-none">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-t-green-400 border-orange-400/50 rounded-full animate-spin" />
                        <span className="text-green-400 font-bold animate-pulse">Scanning...</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Search Results Dropdown */}
                {bulkEntrySearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-black/95 border border-orange-500/40 rounded-xl z-10 max-h-40 overflow-y-auto">
                    {bulkEntrySearchResults.map((result) => (
                      (() => {
                        const alreadyAdded = bulkEntryList.some((item) => item.attendeeId === result.attendeeId);
                        return (
                      <button
                        key={result.attendeeId}
                        onClick={() => {
                          if (alreadyAdded) return;
                          addToBulkEntryList(result);
                        }}
                        disabled={alreadyAdded}
                        className={`w-full text-left px-4 py-2 text-gray-200 text-sm border-b border-orange-500/20 last:border-0 ${
                          alreadyAdded ? "opacity-70 cursor-not-allowed bg-orange-900/20" : "hover:bg-orange-600/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">{result.name}</div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                result.paymentStatus === "paid"
                                  ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                  : "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                              }`}
                            >
                              {result.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                            </span>
                            {alreadyAdded && (
                              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 border border-amber-500/40 text-amber-200">
                                Already Added
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">{result.church || "No church info"}</div>
                      </button>
                        );
                      })()
                    ))}
                  </div>
                )}
              </div>

              {/* Added Attendees List */}
              <div className="mb-6 p-4 bg-black/40 border border-orange-500/15 rounded-xl max-h-48 overflow-y-auto">
                <p className="text-sm font-bold text-orange-100/80 mb-3">
                  Added Attendees ({bulkEntryList.length})
                </p>
                {bulkEntryList.length === 0 ? (
                  <p className="text-orange-100/50 text-sm italic">Scan or type to add attendees...</p>
                ) : (
                  <div className="space-y-2">
                    {bulkEntryList.map((attendee) => (
                      <div key={attendee.attendeeId} className="flex items-center justify-between bg-black/40 p-3 rounded-lg border border-orange-500/10">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-200">{attendee.name}</div>
                          <div className="text-xs text-orange-100/45">{attendee.church || "No church info"}</div>
                        </div>
                        <button
                          onClick={() => removeFromBulkEntryList(attendee.attendeeId)}
                          className="ml-4 px-3 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-300 text-sm rounded-lg transition"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-6 rounded-xl border border-orange-500/25 bg-black/35 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-200 mb-3">Payment Method</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => setBulkEntryPaymentMethod("cash")}
                    type="button"
                    className={`py-2.5 rounded-lg font-bold transition border ${
                      bulkEntryPaymentMethod === "cash"
                        ? "bg-amber-600 text-white border-amber-500"
                        : "bg-amber-900/25 text-amber-300 border-amber-600/30"
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    onClick={() => setBulkEntryPaymentMethod("online")}
                    type="button"
                    className={`py-2.5 rounded-lg font-bold transition border ${
                      bulkEntryPaymentMethod === "online"
                        ? "bg-orange-600 text-white border-orange-500"
                        : "bg-orange-900/25 text-orange-300 border-orange-600/30"
                    }`}
                  >
                    Online
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-orange-500/20 bg-black/40 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-orange-200/80">Total Attendees</p>
                    <p className="mt-1 text-xl font-black text-white">{bulkEntryList.length}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-900/15 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-emerald-200/80">Total Amount</p>
                    <p className="mt-1 text-xl font-black text-emerald-300">{formatPeso(bulkEntryList.length * 200)}</p>
                  </div>
                </div>
              </div>

              {/* Results Display */}
              {bulkEntryResults.length > 0 && (
                <div className="mb-6 p-4 bg-black/40 border border-orange-500/15 rounded-xl max-h-48 overflow-y-auto">
                  <p className="text-sm font-bold text-orange-100/80 mb-3">Processing Results:</p>
                  <div className="space-y-2">
                    {bulkEntryResults.map((result) => (
                      <div key={result.id} className="flex items-center justify-between text-sm">
                        <span className="text-orange-100/80">{result.name}</span>
                        {result.status === "loading" && <span className="text-yellow-300">⏳ Loading...</span>}
                        {result.status === "success" && <span className="text-green-300">✓ Success</span>}
                        {result.status === "error" && <span className="text-red-300">✗ {result.message}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={processBulkEntries}
                  disabled={bulkEntryProcessing || bulkEntryList.length === 0}
                  className="w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
                >
                  {bulkEntryProcessing ? "Processing..." : `PROCESS ${bulkEntryList.length} PAYMENT${bulkEntryList.length !== 1 ? 'S' : ''}`}
                </button>
                <button
                  onClick={() => {
                    setShowBulkEntry(false);
                    setBulkEntryList([]);
                    setBulkEntryInput("");
                    setBulkEntrySearchResults([]);
                    setBulkEntryResults([]);
                    setBulkEntryPaymentMethod("cash");
                  }}
                  disabled={bulkEntryProcessing}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}
