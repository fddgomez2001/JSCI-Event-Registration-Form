"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type PsgcLocation = {
  code: string;
  name: string;
};

type IndividualPayload = {
  name: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
  conference: "leyte" | "cebu";
};

const PSGC_BASE_URL = "https://psgc.gitlab.io/api";
const provinceCodeByName: Record<"Leyte" | "Cebu", string> = {
  Leyte: "083700000",
  Cebu: "072200000",
};

const municipalityCache = new Map<string, PsgcLocation[]>();
const barangayCache = new Map<string, PsgcLocation[]>();

export default function IndividualRegistrationPage() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [conference, setConference] = useState<"leyte" | "cebu">("leyte");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const value = (params.get("conference") ?? "leyte").toLowerCase();
    setConference(value === "cebu" ? "cebu" : "leyte");
  }, []);
  const conferenceLabel = conference === "cebu" ? "Cebu" : "Leyte";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<IndividualPayload | null>(null);
  const [churchOptions, setChurchOptions] = useState<string[]>([]);
  const [church, setChurch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<"Leyte" | "Cebu" | "">("");
  const [selectedMunicipalityCode, setSelectedMunicipalityCode] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangayCode, setSelectedBarangayCode] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [addressDetails, setAddressDetails] = useState("");
  const [municipalityOptions, setMunicipalityOptions] = useState<PsgcLocation[]>([]);
  const [barangayOptions, setBarangayOptions] = useState<PsgcLocation[]>([]);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);
  const [addressError, setAddressError] = useState("");

  const normalizedMunicipality = useMemo(() => selectedMunicipality.trim().toLowerCase(), [selectedMunicipality]);
  const normalizedBarangay = useMemo(() => selectedBarangay.trim().toLowerCase(), [selectedBarangay]);

  useEffect(() => {
    const matchedMunicipality = municipalityOptions.find((item) => item.name.toLowerCase() === normalizedMunicipality);
    setSelectedMunicipalityCode(matchedMunicipality?.code ?? "");
  }, [municipalityOptions, normalizedMunicipality]);

  useEffect(() => {
    const matchedBarangay = barangayOptions.find((item) => item.name.toLowerCase() === normalizedBarangay);
    setSelectedBarangayCode(matchedBarangay?.code ?? "");
  }, [barangayOptions, normalizedBarangay]);

  const computedAddress =
    selectedLocation && selectedMunicipality && selectedBarangay
      ? `${selectedBarangay}, ${selectedMunicipality}, ${selectedLocation}${addressDetails ? ` (${addressDetails})` : ""}`
      : "";

  useEffect(() => {
    if (!selectedLocation) {
      setMunicipalityOptions([]);
      setAddressError("");
      return;
    }

    const provinceCode = provinceCodeByName[selectedLocation];
    const cached = municipalityCache.get(provinceCode);
    if (cached) {
      setMunicipalityOptions(cached);
      setAddressError("");
      return;
    }

    const controller = new AbortController();

    async function loadMunicipalities() {
      setIsLoadingMunicipalities(true);
      setAddressError("");

      try {
        const response = await fetch(`${PSGC_BASE_URL}/provinces/${provinceCode}/cities-municipalities`, {
          cache: "force-cache",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load municipalities.");
        }

        const data = (await response.json()) as PsgcLocation[];
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        municipalityCache.set(provinceCode, sorted);
        setMunicipalityOptions(sorted);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setMunicipalityOptions([]);
        setAddressError("Unable to load municipalities right now. You can try again by reselecting the location.");
      } finally {
        setIsLoadingMunicipalities(false);
      }
    }

    void loadMunicipalities();

    return () => controller.abort();
  }, [selectedLocation]);

  useEffect(() => {
    if (!selectedMunicipalityCode) {
      setBarangayOptions([]);
      setAddressError((current) => (current.startsWith("Unable to load barangays") ? "" : current));
      return;
    }

    const cached = barangayCache.get(selectedMunicipalityCode);
    if (cached) {
      setBarangayOptions(cached);
      return;
    }

    const controller = new AbortController();

    async function loadBarangays() {
      setIsLoadingBarangays(true);
      setAddressError((current) => (current.startsWith("Unable to load barangays") ? "" : current));

      try {
        const response = await fetch(`${PSGC_BASE_URL}/cities-municipalities/${selectedMunicipalityCode}/barangays`, {
          cache: "force-cache",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load barangays.");
        }

        const data = (await response.json()) as PsgcLocation[];
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        barangayCache.set(selectedMunicipalityCode, sorted);
        setBarangayOptions(sorted);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setBarangayOptions([]);
        setAddressError("Unable to load barangays right now. Pick the municipality again to retry.");
      } finally {
        setIsLoadingBarangays(false);
      }
    }

    void loadBarangays();

    return () => controller.abort();
  }, [selectedMunicipalityCode]);

  useEffect(() => {
    async function loadChurchOptions() {
      try {
        const response = await fetch(`/api/registrations?conference=${conference}`, { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { churches?: string[] };
        const options = Array.isArray(data.churches) ? data.churches : [];
        setChurchOptions(options);
      } catch {
        setChurchOptions([]);
      }
    }

    void loadChurchOptions();
  }, [conference]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const payload: IndividualPayload = {
      name: String(formData.get("name") ?? ""),
      church: church,
      ministry: String(formData.get("ministry") ?? ""),
      address: computedAddress,
      localChurchPastor: String(formData.get("localChurchPastor") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
      conference,
    };

    setPendingPayload(payload);
    setShowConfirmModal(true);
  }

  async function confirmRegistrationSubmission() {
    if (!pendingPayload) return;

    setIsSubmitting(true);
    setStatus("");

    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", payload: pendingPayload }),
    });

    let data: { error?: string; message?: string } = {};
    try {
      data = (await response.json()) as { error?: string; message?: string };
    } catch {
      data = {};
    }

    if (!response.ok) {
      setStatus(data.error ?? "Unable to submit registration.");
      setIsSubmitting(false);
      return;
    }

    formRef.current?.reset();
    setChurch("");
    setSelectedLocation("");
    setSelectedMunicipalityCode("");
    setSelectedMunicipality("");
    setSelectedBarangayCode("");
    setSelectedBarangay("");
    setAddressDetails("");
    setAddressError("");
    setPendingPayload(null);
    setShowConfirmModal(false);
    setStatus("Individual registration submitted successfully.");
    setShowSuccessModal(true);
    setIsSubmitting(false);
  }

  function cancelRegistrationSubmission() {
    setShowConfirmModal(false);
    setPendingPayload(null);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] px-4 py-8 md:flex md:items-center md:justify-center">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-amber-100/30 bg-slate-900/80 p-5 text-amber-50 shadow-[0_18px_45px_rgba(3,8,20,0.45)] sm:p-7">
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <a href="/" className="text-amber-300 underline underline-offset-2">
            Back to Landing Page
          </a>
          <a href={`/register/bulk?conference=${conference}`} className="text-amber-200 underline underline-offset-2 hover:text-amber-100">
            Switch to Bulk Registration
          </a>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-amber-100">Individual Registration</h1>
        <p className="mb-1 mt-1 text-sm text-amber-200">All fields are required.</p>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">
          Conference: {conferenceLabel}
        </p>

        <form ref={formRef} className="grid gap-3" onSubmit={onSubmit}>
          <label className="grid gap-1">
            <span className="text-sm">Name *</span>
            <input name="name" required className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Church *</span>
            {churchOptions.length ? (
              <select
                defaultValue=""
                onChange={(event) => setChurch(event.target.value)}
                className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-amber-100 [color-scheme:dark]"
              >
                <option value="">Select saved church (optional)</option>
                {churchOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              name="church"
              required
              value={church}
              onChange={(event) => setChurch(event.target.value)}
              list="church-options-individual"
              className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2"
            />
          </label>

          <datalist id="church-options-individual">
            {churchOptions.map((church) => (
              <option key={church} value={church} />
            ))}
          </datalist>

          <label className="grid gap-1">
            <span className="text-sm">Ministry *</span>
            <select
              name="ministry"
              required
              defaultValue=""
              className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-amber-100 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-amber-300/40"
            >
              <option value="" disabled>
                Select ministry
              </option>
              <option value="Pastor">Pastor</option>
              <option value="Church Council">Church Council</option>
              <option value="Teacher">Teacher</option>
              <option value="Music">Music</option>
              <option value="Usher">Usher</option>
              <option value="Ministry Head">Ministry Head (e.g Head of Music, Head of Teachers, etc...)</option>
              <option value="Deacons">Deacons</option>
              <option value="Media Team">Media Team</option>
              <option value="Dance">Dance</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Address *</span>
            <select
              required
              value={selectedLocation}
              onChange={(event) => {
                setSelectedLocation(event.target.value as "Leyte" | "Cebu" | "");
                setSelectedMunicipalityCode("");
                setSelectedMunicipality("");
                setSelectedBarangayCode("");
                setSelectedBarangay("");
                setAddressError("");
              }}
              className="address-location-select rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-amber-100 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-amber-300/40"
            >
              <option value="">Select location (Leyte/Cebu)</option>
              <option value="Leyte">Leyte</option>
              <option value="Cebu">Cebu</option>
            </select>

            <select
              required
              value={selectedMunicipality}
              onChange={(event) => {
                const nextMunicipality = event.target.value;
                const matchedMunicipality = municipalityOptions.find((item) => item.name === nextMunicipality);
                setSelectedMunicipality(nextMunicipality);
                setSelectedMunicipalityCode(matchedMunicipality?.code ?? "");
                setSelectedBarangayCode("");
                setSelectedBarangay("");
              }}
              disabled={!selectedLocation || isLoadingMunicipalities}
              className="address-option-select rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-amber-100 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-amber-300/40 disabled:opacity-60"
            >
              <option value="" disabled>
                {isLoadingMunicipalities ? "Loading municipalities..." : "Select municipality"}
              </option>
              {municipalityOptions.map((municipality) => (
                <option key={municipality.code} value={municipality.name}>
                  {municipality.name}
                </option>
              ))}
            </select>

            <select
              required
              value={selectedBarangay}
              onChange={(event) => {
                const nextBarangay = event.target.value;
                const matchedBarangay = barangayOptions.find((item) => item.name === nextBarangay);
                setSelectedBarangay(nextBarangay);
                setSelectedBarangayCode(matchedBarangay?.code ?? "");
              }}
              disabled={!selectedLocation || !selectedMunicipalityCode || isLoadingBarangays}
              className="address-option-select rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-amber-100 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-amber-300/40 disabled:opacity-60"
            >
              <option value="" disabled>
                {isLoadingBarangays ? "Loading barangays..." : "Select barangay"}
              </option>
              {barangayOptions.map((barangay) => (
                <option key={barangay.code} value={barangay.name}>
                  {barangay.name}
                </option>
              ))}
            </select>

            <input
              value={addressDetails}
              onChange={(event) => setAddressDetails(event.target.value)}
              placeholder="Optional details (e.g. Sitio, Street, House No.)"
              className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2"
            />

            <input type="hidden" name="address" value={computedAddress} />
            <input type="hidden" name="municipalityCode" value={selectedMunicipalityCode} />
            <input type="hidden" name="barangayCode" value={selectedBarangayCode} />

            {isLoadingMunicipalities ? <p className="text-xs text-amber-200">Loading municipality options...</p> : null}
            {isLoadingBarangays ? <p className="text-xs text-amber-200">Loading barangay options...</p> : null}
            {addressError ? <p className="text-xs text-rose-200">{addressError}</p> : null}

            {computedAddress ? (
              <p className="text-xs text-amber-200">Selected address: {computedAddress}</p>
            ) : (
              <p className="text-xs text-amber-300">Choose location, municipality, and barangay to complete address.</p>
            )}
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Local Church Pastor *</span>
            <input
              name="localChurchPastor"
              required
              className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Phone Number *</span>
            <input
              name="phoneNumber"
              required
              type="tel"
              className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950 disabled:opacity-70"
          >
            {isSubmitting ? "Submitting..." : "Submit Individual Registration"}
          </button>
        </form>

        {status ? <p className="mt-3 text-sm text-amber-200">{status}</p> : null}

        <style jsx global>{`
          select[name="ministry"],
          select[name="ministry"] option,
          select.address-location-select,
          select.address-location-select option,
          select.address-option-select,
          select.address-option-select option {
            background-color: #020617;
            color: #fde68a;
          }

          select.address-location-select option:checked,
          select.address-option-select option:checked {
            background-color: #0f172a;
            color: #fde68a;
          }
        `}</style>
      </section>

      {showSuccessModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-100/30 bg-slate-900 p-5 shadow-[0_18px_50px_rgba(3,8,20,0.55)] sm:p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-500/20 text-xl text-emerald-200">
              ✓
            </div>
            <h2 className="mt-3 text-center text-xl font-bold text-amber-100">Registration Successful</h2>
            <p className="mt-2 text-center text-sm text-amber-200">
              Your individual registration has been submitted successfully.
            </p>

            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="mt-5 w-full rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {showConfirmModal && pendingPayload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-amber-100/30 bg-slate-900 p-5 shadow-[0_18px_50px_rgba(3,8,20,0.55)] sm:p-6">
            <h2 className="m-0 text-xl font-bold text-amber-100">Please Confirm Your Details</h2>
            <p className="mt-2 text-sm text-amber-200">Review your information before final submission.</p>

            <dl className="mt-4 grid gap-2 rounded-xl border border-amber-100/20 bg-slate-950/35 p-3 text-sm">
              <div>
                <dt className="font-semibold text-amber-300">Conference</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.conference === "cebu" ? "Cebu" : "Leyte"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-300">Name</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.name}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-300">Church</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.church}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-300">Ministry</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.ministry}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-300">Address</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.address}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-300">Local Church Pastor</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.localChurchPastor}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-300">Phone Number</dt>
                <dd className="m-0 text-amber-100">{pendingPayload.phoneNumber}</dd>
              </div>
            </dl>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={cancelRegistrationSubmission}
                disabled={isSubmitting}
                className="rounded-xl border border-amber-100/40 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-slate-800 disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRegistrationSubmission}
                disabled={isSubmitting}
                className="rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950 disabled:opacity-70"
              >
                {isSubmitting ? "Submitting..." : "Confirm and Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
