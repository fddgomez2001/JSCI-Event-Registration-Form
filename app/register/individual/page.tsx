"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PsgcLocation = {
  code: string;
  name: string;
};

const PSGC_BASE_URL = "https://psgc.gitlab.io/api";
const provinceCodeByName: Record<"Leyte" | "Cebu", string> = {
  Leyte: "083700000",
  Cebu: "072200000",
};

const municipalityCache = new Map<string, PsgcLocation[]>();
const barangayCache = new Map<string, PsgcLocation[]>();

export default function IndividualRegistrationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
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
        const response = await fetch("/api/registrations", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { churches?: string[] };
        const options = Array.isArray(data.churches) ? data.churches : [];
        setChurchOptions(options);
      } catch {
        setChurchOptions([]);
      }
    }

    void loadChurchOptions();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      church: church,
      ministry: String(formData.get("ministry") ?? ""),
      address: computedAddress,
      localChurchPastor: String(formData.get("localChurchPastor") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
    };

    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", payload }),
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

    form.reset();
    setChurch("");
    setSelectedLocation("");
    setSelectedMunicipalityCode("");
    setSelectedMunicipality("");
    setSelectedBarangayCode("");
    setSelectedBarangay("");
    setAddressDetails("");
    setAddressError("");
    setStatus("Individual registration submitted successfully.");
    setShowSuccessModal(true);
    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] px-4 py-8 md:flex md:items-center md:justify-center">
      <section className="mx-auto w-full max-w-2xl rounded-3xl border border-amber-100/30 bg-slate-900/80 p-5 text-amber-50 shadow-[0_18px_45px_rgba(3,8,20,0.45)] sm:p-7">
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <a href="/" className="text-amber-300 underline underline-offset-2">
            Back to Landing Page
          </a>
          <a href="/register/bulk" className="text-amber-200 underline underline-offset-2 hover:text-amber-100">
            Switch to Bulk Registration
          </a>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-amber-100">Individual Registration</h1>
        <p className="mb-4 mt-1 text-sm text-amber-200">All fields are required.</p>

        <form className="grid gap-3" onSubmit={onSubmit}>
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
              className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-amber-100 [color-scheme:dark]"
            >
              <option value="">Select location (Leyte/Cebu)</option>
              <option value="Leyte">Leyte</option>
              <option value="Cebu">Cebu</option>
            </select>

            <input
              required
              value={selectedMunicipality}
              onChange={(event) => {
                setSelectedMunicipality(event.target.value);
                setSelectedBarangayCode("");
                setSelectedBarangay("");
              }}
              list="municipality-options-individual"
              placeholder={isLoadingMunicipalities ? "Loading municipalities..." : "Search or type municipality"}
              disabled={!selectedLocation}
              className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 disabled:opacity-60"
            />

            <datalist id="municipality-options-individual">
              {municipalityOptions.map((municipality) => (
                <option key={municipality.code} value={municipality.name} />
              ))}
            </datalist>

            <input
              required
              value={selectedBarangay}
              onChange={(event) => setSelectedBarangay(event.target.value)}
              list="barangay-options-individual"
              placeholder={isLoadingBarangays ? "Loading barangays..." : "Search or type barangay"}
              disabled={!selectedLocation || !selectedMunicipalityCode}
              className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 disabled:opacity-60"
            />

            <datalist id="barangay-options-individual">
              {barangayOptions.map((barangay) => (
                <option key={barangay.code} value={barangay.name} />
              ))}
            </datalist>

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
          select[name="ministry"] option {
            background-color: #020617;
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
    </main>
  );
}
