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
  paidAt?: string | null;
  paidByCommittee?: string | null;
  kit: {
    toteBag: boolean;
    mug: boolean;
    notebook: boolean;
    pencil: boolean;
    claimedAt?: string | null;
    claimedByCommittee?: string | null;
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
  const [bulkModal, setBulkModal] = useState<BulkModalState | null>(null);
  const [bulkPaymentProcessing, setBulkPaymentProcessing] = useState(false);
  const [showScanAnimation, setShowScanAnimation] = useState(false);
  const [paidSearch, setPaidSearch] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; fullName: string; church?: string; ministry?: string; paymentStatus?: "paid" | "pending"; lunchClaimed?: boolean }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [paidAttendees, setPaidAttendees] = useState<Array<{
    name: string;
    amount: number;
    paidAt: string;
    paidByCommittee: string;
    attendeeId: string;
  }>>([]);

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
      if (modal || bulkModal || walkInOpen) return;
      if (event.key === "Enter") {
        handleUSBScan();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthenticated, modal, bulkModal, walkInOpen, manualCode]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  async function handleUSBScan() {
    const raw = manualCode.trim();
    if (!raw) return;

    setManualCode("");
    setShowScanAnimation(true);
    setTimeout(() => setShowScanAnimation(false), 500);

    setProcessingAttendeeId(raw);

    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeKey: raw, attendeeId: raw, committeeName }),
      });

      if (!res.ok) {
        setError("Attendee not found.");
        setProcessingAttendeeId(null);
        return;
      }

      const body = await res.json();
      setModal({
        conference: body.conference,
        fullName: body.fullName,
        ministry: body.ministry ?? "",
        church: body.church ?? "",
        attendeeId: body.attendeeId ?? raw,
        checkedIn: !!body.checkedIn,
        lunch: !!body.lunch,
        paymentAmount: 200,
        paymentStatus: "pending",
        paidAt: null,
        paidByCommittee: null,
        kit: {
          toteBag: false,
          mug: false,
          notebook: false,
          pencil: false,
          claimedAt: null,
          claimedByCommittee: null,
        },
      });

      void (async () => {
        try {
          const resolvedAttendeeId = body.attendeeId ?? raw;
          const paymentRes = await fetch(`/api/qr/payment?attendeeId=${encodeURIComponent(resolvedAttendeeId)}`);
          if (!paymentRes.ok) return;

          const paymentData = await paymentRes.json();
          if (!paymentData.data) return;

          setModal((current) =>
            current
              ? {
                  ...current,
                  paymentStatus: paymentData.data.paymentStatus,
                  paidAt: paymentData.data.paidAt,
                  paidByCommittee: paymentData.data.paidByCommittee,
                }
              : current,
          );
          const kitRes = await fetch(`/api/qr/kit?attendeeId=${encodeURIComponent(resolvedAttendeeId)}`);
          if (!kitRes.ok) return;
          const kitData = await kitRes.json();
          if (!kitData.data) return;
          setModal((current) =>
            current
              ? {
                  ...current,
                  kit: {
                    toteBag: !!kitData.data.toteBag,
                    mug: !!kitData.data.mug,
                    notebook: !!kitData.data.notebook,
                    pencil: !!kitData.data.pencil,
                    claimedAt: kitData.data.claimedAt,
                    claimedByCommittee: kitData.data.claimedByCommittee,
                  },
                }
              : current,
          );
        } catch {
          // Keep the modal open with the initial state.
        }
      })();
    } catch (e) {
      setError("Lookup error. Please try again.");
    } finally {
      setProcessingAttendeeId(null);
    }
  }

  async function confirmPayment() {
    if (!modal) return;
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

        // Add to paid list
        if (body.data.paymentStatus === "paid" && body.data.paidAt) {
          addToPaidList({
            name: modal.fullName,
            amount: modal.paymentAmount,
            paidAt: body.data.paidAt,
            paidByCommittee: body.data.paidByCommittee || committeeName,
            attendeeId: modal.attendeeId,
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
      }
    } catch (err) {
      setError("Unable to record payment.");
    } finally {
      setPaymentProcessing(false);
    }
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

  function addToPaidList(attendee: { name: string; amount: number; paidAt: string; paidByCommittee: string; attendeeId: string }) {
    setPaidAttendees(prev => [attendee, ...prev]);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
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

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

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
    if (cameraActive) {
      stopCamera();
    }
    setShowScanAnimation(true);
    setTimeout(() => setShowScanAnimation(false), 500);
    setProcessingAttendeeId(rawValue);

    try {
      const res = await fetch("/api/qr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeKey: rawValue, attendeeId: rawValue, committeeName }),
      });

      if (!res.ok) {
        setError("Attendee not found.");
        setProcessingAttendeeId(null);
        return;
      }

      const body = await res.json();

      setModal({
        conference: body.conference,
        fullName: body.fullName,
        ministry: body.ministry ?? "",
        church: body.church ?? "",
        attendeeId: body.attendeeId ?? rawValue,
        checkedIn: !!body.checkedIn,
        lunch: !!body.lunch,
        paymentAmount: 200,
        paymentStatus: "pending",
        paidAt: null,
        paidByCommittee: null,
        kit: {
          toteBag: false,
          mug: false,
          notebook: false,
          pencil: false,
          claimedAt: null,
          claimedByCommittee: null,
        },
      });

      void (async () => {
        try {
          const resolvedAttendeeId = body.attendeeId ?? rawValue;
          const paymentRes = await fetch(`/api/qr/payment?attendeeId=${encodeURIComponent(resolvedAttendeeId)}`);
          if (!paymentRes.ok) return;

          const paymentData = await paymentRes.json();
          if (!paymentData.data) return;

          setModal((current) =>
            current
              ? {
                  ...current,
                  paymentStatus: paymentData.data.paymentStatus,
                  paidAt: paymentData.data.paidAt,
                  paidByCommittee: paymentData.data.paidByCommittee,
                }
              : current,
          );
          const kitRes = await fetch(`/api/qr/kit?attendeeId=${encodeURIComponent(resolvedAttendeeId)}`);
          if (!kitRes.ok) return;
          const kitData = await kitRes.json();
          if (!kitData.data) return;
          setModal((current) =>
            current
              ? {
                  ...current,
                  kit: {
                    toteBag: !!kitData.data.toteBag,
                    mug: !!kitData.data.mug,
                    notebook: !!kitData.data.notebook,
                    pencil: !!kitData.data.pencil,
                    claimedAt: kitData.data.claimedAt,
                    claimedByCommittee: kitData.data.claimedByCommittee,
                  },
                }
              : current,
          );
        } catch {
          // Keep the modal open with the initial state.
        }
      })();
    } catch (e) {
      setError("Lookup error. Please try again.");
    } finally {
      setProcessingAttendeeId(null);
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
          conference: "leyte",
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.data) {
        setError(body.message ?? "Unable to register walk-in attendee.");
        return;
      }

      setError(`Walk-in registered: ${body.data.fullName}`);
      setWalkInOpen(false);
      setWalkInFullName("");
      setWalkInChurch("");
    } catch {
      setError("Unable to register walk-in attendee.");
    } finally {
      setWalkInSaving(false);
    }
  }

  const filteredPaidAttendees = paidAttendees.filter((attendee) => {
    const searchValue = paidSearch.trim().toLowerCase();
    if (!searchValue) return true;

    return [
      attendee.name,
      attendee.paidByCommittee,
      attendee.amount.toString(),
      new Date(attendee.paidAt).toLocaleTimeString(),
    ].some((value) => value.toLowerCase().includes(searchValue));
  });

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
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch("/api/qr/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
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
    }, 300);
  }

  function handleUserSelect(userId: string) {
    setUserSearch("");
    setSearchResults([]);
    handleQRScan(userId);
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
    setSearchResults([]);
  }

  if (!loginReady) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-black text-blue-900 mb-2">QR Reader</h1>
              <p className="text-gray-600">Committee Login</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">Committee Name</label>
                <select
                  value={committeeName}
                  onChange={(e) => setCommitteeName(e.target.value as typeof committeeNames[number])}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 font-semibold"
                  required
                >
                  <option value="">Select committee</option>
                  {committeeNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 font-semibold"
                  required
                />
              </div>

              <label className="flex items-center gap-3 text-gray-700 font-semibold">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-5 h-5 accent-blue-600"
                />
                Remember me
              </label>

              {error && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-xl text-sm font-semibold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-3 rounded-xl hover:shadow-lg transition"
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
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-blue-400 font-bold text-sm tracking-widest uppercase">QR Payment Scanner</p>
          <h1 className="text-4xl font-black text-white mt-2">Payment Collection</h1>
          <p className="text-blue-200 mt-2">Logged in as <span className="font-bold text-blue-100">{committeeName}</span></p>
          <div className="mt-4 flex gap-2 justify-center">
            <button
              onClick={() => setWalkInOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
            >
              Walk-in Registration
            </button>
            <a href="/qrreader/lunch" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">Lunch</a>
            <a href="/qrreader/kit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold">Kit</a>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-blue-500/30 p-8 mb-8">
          <label className="block text-center mb-4">
            <p className="text-blue-300 font-bold text-sm uppercase tracking-wider mb-3">Scan QR or Paste ID</p>
            <input
              ref={scanInputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan USB QR code or paste ID..."
              className="w-full px-6 py-4 bg-slate-950 border-2 border-blue-500/50 text-white text-lg font-semibold rounded-xl placeholder-slate-500 focus:outline-none focus:border-blue-400 text-center"
            />
          </label>

          <div className="mb-6 relative">
            <label className="block text-center mb-3">
              <p className="text-blue-300 font-bold text-sm uppercase tracking-wider mb-3">Or Search for User</p>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  debounceSearch(e.target.value);
                }}
                placeholder="Type attendee name..."
                className="w-full px-6 py-4 bg-slate-950 border-2 border-blue-500/50 text-white text-lg font-semibold rounded-xl placeholder-slate-500 focus:outline-none focus:border-blue-400 text-center"
              />
            </label>

            {userSearch.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 z-40">
                {isSearching && <div className="bg-slate-950 border border-blue-500/50 rounded-lg p-4 text-center text-blue-200">Searching...</div>}

                {!isSearching && searchResults.length > 0 && (
                  <div className="bg-slate-950 border border-blue-500/50 rounded-lg overflow-hidden max-h-80 overflow-y-auto shadow-lg">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleUserSelect(result.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-blue-600/30 transition border-b border-slate-800 last:border-0 flex items-start justify-between ${
                          result.paymentStatus === "paid" ? "bg-green-900/20" : ""
                        }`}
                      >
                        <div>
                          <p className="text-white font-bold">{result.fullName}</p>
                          {(result.ministry || result.church) && (
                            <p className="text-blue-300 text-xs mt-1">
                              {result.ministry && <span>{result.ministry}</span>}
                              {result.ministry && result.church && <span> • </span>}
                              {result.church && <span>{result.church}</span>}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 ml-2">
                          {result.paymentStatus === "paid" ? (
                            <span className="bg-green-600/40 border border-green-500 text-green-300 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                              ✓ PAID
                            </span>
                          ) : (
                            <span className="bg-orange-600/40 border border-orange-500 text-orange-300 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                              PENDING
                            </span>
                          )}
                          {result.lunchClaimed ? (
                            <span className="bg-emerald-600/40 border border-emerald-500 text-emerald-300 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                              LUNCH CLAIMED
                            </span>
                          ) : (
                            <span className="bg-slate-700/60 border border-slate-500 text-slate-300 text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                              LUNCH NOT CLAIMED
                            </span>
                          )}
                          <div className="text-blue-400 text-lg">→</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!isSearching && searchResults.length === 0 && userSearch.length > 0 && (
                  <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 text-center text-gray-400 text-sm">
                    No attendees found - try another name
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scan Animation */}
        {showScanAnimation && (
          <>
            <div className="fixed inset-0 pointer-events-none z-40">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/30 to-green-500/0 animate-pulse"></div>
            </div>
          </>
        )}

        {processingAttendeeId && (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-3">
              <div className="w-6 h-6 border-3 border-blue-500 border-t-green-400 rounded-full animate-spin"></div>
              <span className="text-blue-300 font-semibold">Reading QR...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 text-red-300 rounded-xl text-sm font-semibold text-center">
            {error}
          </div>
        )}

        {/* Camera Toggle Button */}
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={() => {
              if (cameraActive) {
                stopCamera();
              } else {
                startCamera();
              }
            }}
            className={`px-6 py-3 font-bold rounded-xl transition ${
              cameraActive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {cameraActive ? "Stop Camera" : "Use Back Camera"}
          </button>
        </div>
        </div>

        {/* Camera Modal */}
        {cameraActive && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-2xl">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border-2 border-blue-500/50 overflow-hidden shadow-2xl">
                {/* Camera Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                  <h3 className="text-white font-black text-lg">📷 Camera Scanner</h3>
                </div>

                {/* Camera View */}
                <div className="relative bg-black">
                  <div className="aspect-video rounded-lg overflow-hidden mx-4 mt-4 border-2 border-blue-500/30">
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
                <div className="p-6 space-y-3 bg-slate-900/50">
                  <p className="text-center text-blue-300 font-bold text-sm uppercase tracking-wider">
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

        {/* Paid Attendees Table */}
        {paidAttendees.length > 0 && (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-green-500/30 p-8 mb-8">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-white">Payments Collected</h2>
                <div className="bg-green-600/20 border border-green-500/50 px-4 py-2 rounded-lg">
                  <p className="text-green-300 font-black text-lg">{paidAttendees.length} Paid</p>
                </div>
              </div>
              <div className="text-sm text-gray-400">
                Total: <span className="text-green-300 font-black text-lg">{paidAttendees.length * 200} PHP</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-blue-300 mb-2">Search payments</label>
              <input
                type="text"
                value={paidSearch}
                onChange={(e) => setPaidSearch(e.target.value)}
                placeholder="Search by name, committee, amount, or time..."
                className="w-full px-4 py-3 bg-slate-950 border-2 border-blue-500/40 text-white rounded-xl placeholder-slate-500 focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-blue-500/30 bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-3 font-bold text-blue-300">No.</th>
                    <th className="px-4 py-3 font-bold text-blue-300">Name</th>
                    <th className="px-4 py-3 font-bold text-blue-300">Amount</th>
                    <th className="px-4 py-3 font-bold text-blue-300">Payment By</th>
                    <th className="px-4 py-3 font-bold text-blue-300">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPaidAttendees.length > 0 ? (
                    filteredPaidAttendees.map((attendee, index) => (
                      <tr key={attendee.attendeeId} className="border-b border-slate-700 hover:bg-slate-950/50 transition">
                        <td className="px-4 py-3 text-white font-semibold">{index + 1}</td>
                        <td className="px-4 py-3 text-white font-semibold">{attendee.name}</td>
                        <td className="px-4 py-3 text-green-300 font-black">{attendee.amount} PHP</td>
                        <td className="px-4 py-3 text-blue-300">{attendee.paidByCommittee}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{new Date(attendee.paidAt).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                        No paid attendees match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="text-center">
          <button
            onClick={logout}
            className="px-6 py-2 bg-red-600/80 hover:bg-red-700 text-white font-bold rounded-lg transition"
          >
            Logout
          </button>
        </div>

        {/* Single Attendee Modal */}
        {modal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-blue-500/30 p-8 max-w-md w-full shadow-2xl">
              {/* Conference Badge */}
              <div className="text-center mb-6">
                <div className="inline-block bg-blue-600/20 border border-blue-500/50 px-4 py-1 rounded-full">
                  <p className="text-blue-300 text-xs font-bold uppercase tracking-wider">{modal.conference}</p>
                </div>
              </div>

              {/* Animated Name Display */}
              <div className="mb-8 animate-fadeIn">
                <p className="text-4xl font-black text-white text-center">{modal.fullName}</p>
              </div>

              {/* Details */}
              <div className="space-y-3 mb-8">
                <div className="bg-slate-950/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Ministry</p>
                  <p className="text-white font-semibold">{modal.ministry || "-"}</p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Church</p>
                  <p className="text-white font-semibold">{modal.church || "-"}</p>
                </div>
              </div>

              {/* Payment Section */}
              <div className={`rounded-lg p-4 mb-6 text-center ${
                modal.paymentStatus === "paid"
                  ? "bg-green-600/20 border border-green-500/50"
                  : "bg-orange-600/20 border border-orange-500/50"
              }`}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-300">Payment</p>
                <p className="text-3xl font-black text-white mb-2">{modal.paymentAmount} PHP</p>
                <p className={`text-sm font-bold uppercase tracking-wider ${
                  modal.paymentStatus === "paid" ? "text-green-300" : "text-orange-300"
                }`}>
                  {modal.paymentStatus === "paid" ? "✓ PAID" : "PENDING"}
                </p>
                {modal.paymentStatus === "paid" && modal.paidByCommittee && (
                  <>
                    <p className="text-xs text-gray-300 mt-2">By {modal.paidByCommittee}</p>
                    {modal.paidAt && <p className="text-xs text-gray-300">{new Date(modal.paidAt).toLocaleTimeString()}</p>}
                  </>
                )}
                {modal.checkedIn && (
                  <p className="text-xs text-green-300 mt-2 font-bold">✓ AUTO CHECKED IN</p>
                )}
                <p className={`text-xs mt-2 font-bold ${modal.lunch ? "text-emerald-300" : "text-slate-300"}`}>
                  {modal.lunch ? "✓ LUNCH CLAIMED" : "LUNCH NOT CLAIMED"}
                </p>
              </div>
              {/* Action Buttons */}
              <div className="space-y-3">
                {modal.paymentStatus !== "paid" ? (
                  <button
                    onClick={confirmPayment}
                    disabled={paymentProcessing}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
                  >
                    {paymentProcessing ? "Processing..." : "CONFIRM PAYMENT"}
                  </button>
                ) : (
                  <div className="bg-green-600/20 border border-green-500/50 rounded-xl py-4 text-center">
                    <p className="text-green-300 font-black text-lg">✓ PAYMENT CONFIRMED</p>
                  </div>
                )}

                <button
                  onClick={() => {
                    setModal(null);
                    setManualCode("");
                    if (scanInputRef.current) scanInputRef.current.focus();
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition"
                >
                  {modal.paymentStatus === "paid" ? "NEXT GUEST" : "CANCEL"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Walk-in Registration Modal */}
        {walkInOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-emerald-500/30 p-8 max-w-md w-full shadow-2xl">
              <div className="text-center mb-6">
                <p className="text-emerald-300 text-xs font-bold uppercase tracking-wider">Walk-in Registration</p>
                <h2 className="text-3xl font-black text-white mt-2">Add Attendee</h2>
                <p className="text-slate-300 text-sm mt-2">This will be saved to Supabase and appear in QR search.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-emerald-200 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={walkInFullName}
                    onChange={(e) => setWalkInFullName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-4 py-3 bg-slate-950 border-2 border-emerald-500/50 text-white rounded-xl placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-emerald-200 mb-2">Church</label>
                  <input
                    type="text"
                    value={walkInChurch}
                    onChange={(e) => setWalkInChurch(e.target.value)}
                    placeholder="Enter church name"
                    className="w-full px-4 py-3 bg-slate-950 border-2 border-emerald-500/50 text-white rounded-xl placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <p className="text-xs text-slate-300">
                  Conference defaults to Leyte for walk-in registrations.
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
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
                  >
                    {walkInSaving ? "Registering..." : "REGISTER WALK-IN"}
                  </button>

                  <button
                    onClick={() => {
                      setWalkInOpen(false);
                      setWalkInFullName("");
                      setWalkInChurch("");
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-auto">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-blue-500/30 p-8 max-w-2xl w-full shadow-2xl my-8">
              <div className="text-center mb-8">
                <div className="inline-block bg-blue-600/20 border border-blue-500/50 px-4 py-1 rounded-full mb-4">
                  <p className="text-blue-300 text-xs font-bold uppercase tracking-wider">{bulkModal.conference}</p>
                </div>
                <h2 className="text-3xl font-black text-white">BULK PAYMENT</h2>
                {bulkModal.contactPerson && (
                  <p className="text-gray-400 mt-2">
                    Contact: <span className="text-blue-300 font-bold">{bulkModal.contactPerson}</span>
                  </p>
                )}
              </div>

              {/* Selection Controls */}
              <div className="flex gap-2 justify-center mb-6">
                <button
                  onClick={selectAllBulkAttendees}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition"
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
                        ? "bg-blue-600/30 border-blue-500"
                        : "bg-slate-950/50 border-slate-700 hover:border-slate-600"
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
                        <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                          {att.ministry && <p>{att.ministry}</p>}
                          {att.church && <p>{att.church}</p>}
                        </div>
                      </div>
                      <p className="text-right">
                        <p className="text-xl font-black text-blue-300">200</p>
                        <p className="text-xs text-gray-400">PHP</p>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              {bulkModal.attendees.filter((a) => a.selected).length > 0 && (
                <div className="bg-green-600/20 border border-green-500/50 rounded-lg p-4 mb-6 text-center">
                  <p className="text-sm text-gray-300 mb-1">TOTAL</p>
                  <p className="text-3xl font-black text-white">
                    {bulkModal.attendees.filter((a) => a.selected).length * 200} PHP
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
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-60 text-white font-black py-4 rounded-xl transition text-lg"
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

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </main>
  );
}
