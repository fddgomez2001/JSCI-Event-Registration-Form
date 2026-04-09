"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";

type ImportedRow = {
  fullName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
};

type RegistrationMode = "manual" | "excel" | "image";

type LeadDetails = {
  contactName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
};

type ManualContactDetails = {
  contactName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
};

type ImageLeadDetails = {
  contactName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
};

type AttendeeDraft = {
  fullName: string;
  phoneNumber: string;
  ministry: string;
  address: string;
};

type DeletedRowState = {
  row: ImportedRow;
  index: number;
};

type OcrWord = {
  text: string;
  confidence?: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
};

type OcrResultData = {
  text?: string;
  words?: OcrWord[];
};

type OcrLine = {
  words: OcrWord[];
  yCenter: number;
};

type PsgcLocation = {
  code: string;
  name: string;
};

type CascadingAddressFieldProps = {
  value: string;
  onChange: (address: string) => void;
  idPrefix: string;
};

type BulkSubmitMode = "manual" | "excel" | "image";

type BulkConfirmationData = {
  submitMode: BulkSubmitMode;
  contactName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
  attendees: string[];
};

const PSGC_BASE_URL = "https://psgc.gitlab.io/api";
const provinceCodeByName: Record<"Leyte" | "Cebu", string> = {
  Leyte: "083700000",
  Cebu: "072200000",
};

const municipalityCache = new Map<string, PsgcLocation[]>();
const barangayCache = new Map<string, PsgcLocation[]>();

function CascadingAddressField({ value, onChange, idPrefix }: CascadingAddressFieldProps) {
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

  useEffect(() => {
    const matchedMunicipality = municipalityOptions.find(
      (item) => item.name.toLowerCase() === selectedMunicipality.trim().toLowerCase(),
    );
    setSelectedMunicipalityCode(matchedMunicipality?.code ?? "");
  }, [municipalityOptions, selectedMunicipality]);

  useEffect(() => {
    const matchedBarangay = barangayOptions.find(
      (item) => item.name.toLowerCase() === selectedBarangay.trim().toLowerCase(),
    );
    setSelectedBarangayCode(matchedBarangay?.code ?? "");
  }, [barangayOptions, selectedBarangay]);

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

  const computedAddress =
    selectedLocation && selectedMunicipality && selectedBarangay
      ? `${selectedBarangay}, ${selectedMunicipality}, ${selectedLocation}${addressDetails ? ` (${addressDetails})` : ""}`
      : "";

  useEffect(() => {
    if (value !== computedAddress) {
      onChange(computedAddress);
    }
  }, [computedAddress, onChange, value]);

  return (
    <label className="grid gap-1">
      <span className="text-xs">Address *</span>
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

      <input type="hidden" name={`${idPrefix}-address`} value={computedAddress} />
      <input type="hidden" name={`${idPrefix}-municipalityCode`} value={selectedMunicipalityCode} />
      <input type="hidden" name={`${idPrefix}-barangayCode`} value={selectedBarangayCode} />

      {isLoadingMunicipalities ? <p className="text-xs text-amber-200">Loading municipality options...</p> : null}
      {isLoadingBarangays ? <p className="text-xs text-amber-200">Loading barangay options...</p> : null}
      {addressError ? <p className="text-xs text-rose-200">{addressError}</p> : null}

      {computedAddress ? (
        <p className="text-xs text-amber-200">Selected address: {computedAddress}</p>
      ) : (
        <p className="text-xs text-amber-300">Choose location, municipality, and barangay to complete address.</p>
      )}
    </label>
  );
}

async function preprocessImageForOcr(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const maxWidth = 2200;
  const scale = Math.min(2.2, maxWidth / bitmap.width);

  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to create image context.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.85 + 128));
    const thresholded = contrasted < 165 ? 0 : 255;

    pixels[i] = thresholded;
    pixels[i + 1] = thresholded;
    pixels[i + 2] = thresholded;
  }

  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/png", 1);
  });

  if (!blob) throw new Error("Unable to preprocess image.");
  return blob;
}

function clusterWordsIntoLines(words: OcrWord[]): OcrLine[] {
  const cleaned = words
    .filter((word) => word.text?.trim())
    .sort((a, b) => (a.bbox.y0 === b.bbox.y0 ? a.bbox.x0 - b.bbox.x0 : a.bbox.y0 - b.bbox.y0));

  const lines: OcrLine[] = [];

  for (const word of cleaned) {
    const yCenter = (word.bbox.y0 + word.bbox.y1) / 2;
    const existingLine = lines.find((line) => Math.abs(line.yCenter - yCenter) <= 14);

    if (existingLine) {
      existingLine.words.push(word);
      existingLine.yCenter =
        existingLine.words.reduce((sum, current) => sum + (current.bbox.y0 + current.bbox.y1) / 2, 0) /
        existingLine.words.length;
    } else {
      lines.push({ words: [word], yCenter });
    }
  }

  return lines
    .map((line) => ({
      ...line,
      words: line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0),
    }))
    .sort((a, b) => a.yCenter - b.yCenter);
}

function buildRowFromParts(parts: string[], defaults: ImageLeadDetails): ImportedRow | null {
  if (parts.length < 4) return null;

  if (parts.length >= 6) {
    return {
      fullName: parts[0].trim(),
      church: parts[1].trim() || defaults.church,
      ministry: normalizeMinistry(parts[2]),
      address: parts.slice(3, parts.length - 2).join(" ").trim() || defaults.address,
      localChurchPastor: parts[parts.length - 2].trim() || defaults.localChurchPastor,
      phoneNumber: parts[parts.length - 1].trim(),
    };
  }

  return {
    fullName: parts[0].trim(),
    church: defaults.church,
    ministry: normalizeMinistry(parts[1] ?? defaults.ministry),
    address: parts[2]?.trim() || defaults.address,
    localChurchPastor: parts[3]?.trim() || defaults.localChurchPastor,
    phoneNumber: parts[4]?.trim() || "",
  };
}

function buildRowFromColumns(columns: string[], defaults: ImageLeadDetails): ImportedRow | null {
  if (columns.every((value) => !value.trim())) return null;

  return {
    fullName: columns[0]?.trim() || "",
    church: columns[1]?.trim() || defaults.church,
    ministry: normalizeMinistry(columns[2] || defaults.ministry),
    address: columns[3]?.trim() || defaults.address,
    localChurchPastor: columns[4]?.trim() || defaults.localChurchPastor,
    phoneNumber: columns[5]?.trim() || "",
  };
}

function isLikelyDataRow(row: ImportedRow): boolean {
  const values = [row.fullName, row.church, row.ministry, row.address, row.localChurchPastor, row.phoneNumber]
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length < 2) return false;

  const rowText = values.join(" ").toLowerCase();
  if (rowText.includes("fullname") && rowText.includes("church") && rowText.includes("phone")) return false;

  return true;
}

function parseRowsFromOcrWords(words: OcrWord[], defaults: ImageLeadDetails): ImportedRow[] {
  const lines = clusterWordsIntoLines(words);
  if (!lines.length) return [];

  const headerIndex = lines.findIndex((line) => {
    const text = line.words.map((word) => word.text).join(" ").toLowerCase();
    return (
      /full.?name/.test(text) &&
      /church/.test(text) &&
      /ministry/.test(text) &&
      /address/.test(text) &&
      /(pastor|local)/.test(text) &&
      /phone/.test(text)
    );
  });

  const baseLine = headerIndex >= 0 ? lines[headerIndex] : lines[0];
  const xMin = baseLine.words[0]?.bbox.x0 ?? 0;
  const xMax = baseLine.words[baseLine.words.length - 1]?.bbox.x1 ?? xMin + 1;
  const colWidth = Math.max(1, (xMax - xMin) / 6);
  const sourceLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const rows: ImportedRow[] = [];

  for (const line of sourceLines) {
    const columns = ["", "", "", "", "", ""];

    for (const word of line.words) {
      const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
      const rawIndex = Math.floor((centerX - xMin) / colWidth);
      const colIndex = Math.max(0, Math.min(5, rawIndex));

      columns[colIndex] = `${columns[colIndex]} ${word.text}`.trim();
    }

    const row = buildRowFromColumns(columns, defaults);
    if (!row) continue;
    if (!isLikelyDataRow(row)) continue;
    rows.push(row);
  }

  return rows;
}

function parseRowsFromOcrText(text: string, defaults: ImageLeadDetails): ImportedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerIndex = lines.findIndex(
    (line) =>
      /fullname/i.test(line) &&
      /church/i.test(line) &&
      /ministry/i.test(line) &&
      /address/i.test(line) &&
      /pastor/i.test(line) &&
      /phone/i.test(line),
  );

  const candidateLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
  const parsed: ImportedRow[] = [];

  for (const line of candidateLines) {
    const pipeParts = line.split("|").map((part) => part.trim()).filter(Boolean);
    const tabParts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    const spaceParts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    const looseParts = line.split(/\s+/).map((part) => part.trim()).filter(Boolean);
    const parts =
      pipeParts.length >= 4
        ? pipeParts
        : tabParts.length >= 4
          ? tabParts
          : spaceParts.length >= 4
            ? spaceParts
            : looseParts;

    const row = buildRowFromParts(parts, defaults);
    if (!row) continue;

    if (!isLikelyDataRow(row)) continue;

    parsed.push({
      fullName: row.fullName,
      church: row.church || defaults.church,
      ministry: normalizeMinistry(row.ministry || defaults.ministry),
      address: row.address || defaults.address,
      localChurchPastor: row.localChurchPastor || defaults.localChurchPastor,
      phoneNumber: row.phoneNumber,
    });
  }

  return parsed;
}

const requiredColumns = [
  "fullname",
  "church",
  "ministry",
  "address",
  "local church pastor",
  "phone number",
];

const ministryOptions = [
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

function normalizeMinistry(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const matched = ministryOptions.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return matched ?? trimmed;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function blankLeadDetails(): LeadDetails {
  return {
    contactName: "",
    church: "",
    ministry: "",
    address: "",
    localChurchPastor: "",
    phoneNumber: "",
  };
}

function blankManualContactDetails(): ManualContactDetails {
  return {
    contactName: "",
    church: "",
    ministry: "",
    address: "",
    localChurchPastor: "",
    phoneNumber: "",
  };
}

function blankAttendeeDraft(): AttendeeDraft {
  return {
    fullName: "",
    phoneNumber: "",
    ministry: "",
    address: "",
  };
}

function blankImageLeadDetails(): ImageLeadDetails {
  return {
    contactName: "",
    church: "",
    ministry: "",
    address: "",
    localChurchPastor: "",
    phoneNumber: "",
  };
}

export default function BulkRegistrationPage() {
  const [conference, setConference] = useState<"leyte" | "cebu">("leyte");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const value = (params.get("conference") ?? "leyte").toLowerCase();
    setConference(value === "cebu" ? "cebu" : "leyte");
  }, []);
  const conferenceLabel = conference === "cebu" ? "Cebu" : "Leyte";

  const [mode, setMode] = useState<RegistrationMode>("manual");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<BulkConfirmationData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [importStatus, setImportStatus] = useState<string>("");
  const [showImportInstructions, setShowImportInstructions] = useState(false);
  const [excelLeadDetails, setExcelLeadDetails] = useState<LeadDetails>(blankLeadDetails());
  const [importedRows, setImportedRows] = useState<ImportedRow[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<ImportedRow[]>([]);

  const [manualContactDetails, setManualContactDetails] = useState<ManualContactDetails>(blankManualContactDetails());
  const [manualAttendeeDraft, setManualAttendeeDraft] = useState<AttendeeDraft>(blankAttendeeDraft());
  const [manualRows, setManualRows] = useState<ImportedRow[]>([]);
  const [lastDeletedManualRow, setLastDeletedManualRow] = useState<DeletedRowState | null>(null);
  const [useContactPersonDetails, setUseContactPersonDetails] = useState(true);
  const [churchOptions, setChurchOptions] = useState<string[]>([]);

  const [imageLeadDetails, setImageLeadDetails] = useState<ImageLeadDetails>(blankImageLeadDetails());
  const [imageStatus, setImageStatus] = useState<string>("");
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [imageRows, setImageRows] = useState<ImportedRow[]>([]);
  const [lastDeletedImageRow, setLastDeletedImageRow] = useState<DeletedRowState | null>(null);
  const [lastDeletedImportedRow, setLastDeletedImportedRow] = useState<DeletedRowState | null>(null);

  const isExcelLeadComplete = Object.values(excelLeadDetails).every((value) => value.trim().length > 0);
  const isImageLeadComplete = Object.values(imageLeadDetails).every((value) => value.trim().length > 0);

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

  function updateExcelLeadDetails(field: keyof LeadDetails, value: string) {
    setExcelLeadDetails((prev) => ({ ...prev, [field]: value }));
  }

  function updateImageLeadDetails(field: keyof ImageLeadDetails, value: string) {
    setImageLeadDetails((prev) => ({ ...prev, [field]: value }));
  }

  function downloadBlankTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Fullname", "Church", "Ministry", "Address", "Local Church Pastor", "Phone Number"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Registrations");
    XLSX.writeFile(workbook, "registration-template.xlsx");
  }

  function updateImportedRow(index: number, field: keyof ImportedRow, value: string) {
    setImportedRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function updateManualContactDetails(field: keyof ManualContactDetails, value: string) {
    setManualContactDetails((prev) => ({ ...prev, [field]: value }));
  }

  function updateManualAttendeeDraft(field: keyof AttendeeDraft, value: string) {
    setManualAttendeeDraft((prev) => ({ ...prev, [field]: value }));
  }

  function updateManualRow(index: number, field: keyof ImportedRow, value: string) {
    setManualRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function updateImageRow(index: number, field: keyof ImportedRow, value: string) {
    setImageRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function deleteManualRow(index: number) {
    setManualRows((prev) => {
      const rowToDelete = prev[index];
      if (!rowToDelete) return prev;
      setLastDeletedManualRow({ row: rowToDelete, index });
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  function undoManualDelete() {
    if (!lastDeletedManualRow) return;

    setManualRows((prev) => {
      const next = [...prev];
      const insertAt = Math.min(lastDeletedManualRow.index, next.length);
      next.splice(insertAt, 0, lastDeletedManualRow.row);
      return next;
    });
    setLastDeletedManualRow(null);
  }

  function deleteImportedRow(index: number) {
    setImportedRows((prev) => {
      const rowToDelete = prev[index];
      if (!rowToDelete) return prev;
      setLastDeletedImportedRow({ row: rowToDelete, index });
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  function undoImportedDelete() {
    if (!lastDeletedImportedRow) return;

    setImportedRows((prev) => {
      const next = [...prev];
      const insertAt = Math.min(lastDeletedImportedRow.index, next.length);
      next.splice(insertAt, 0, lastDeletedImportedRow.row);
      return next;
    });
    setLastDeletedImportedRow(null);
  }

  function deleteImageRow(index: number) {
    setImageRows((prev) => {
      const rowToDelete = prev[index];
      if (!rowToDelete) return prev;
      setLastDeletedImageRow({ row: rowToDelete, index });
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  function undoImageDelete() {
    if (!lastDeletedImageRow) return;

    setImageRows((prev) => {
      const next = [...prev];
      const insertAt = Math.min(lastDeletedImageRow.index, next.length);
      next.splice(insertAt, 0, lastDeletedImageRow.row);
      return next;
    });
    setLastDeletedImageRow(null);
  }

  function addManualAttendee() {
    if (
      !manualAttendeeDraft.fullName.trim() ||
      !manualAttendeeDraft.phoneNumber.trim() ||
      !manualAttendeeDraft.ministry.trim()
    ) {
      setStatus("Please complete Full Name, Phone Number, and Ministry before adding attendee.");
      return;
    }

    if (!useContactPersonDetails && !manualAttendeeDraft.address.trim()) {
      setStatus("Please enter attendee Address or use Contact Person details.");
      return;
    }

    const row: ImportedRow = {
      fullName: manualAttendeeDraft.fullName.trim(),
      phoneNumber: manualAttendeeDraft.phoneNumber.trim(),
      ministry: manualAttendeeDraft.ministry.trim(),
      church: useContactPersonDetails ? manualContactDetails.church.trim() : "",
      address: useContactPersonDetails ? manualContactDetails.address.trim() : manualAttendeeDraft.address.trim(),
      localChurchPastor: useContactPersonDetails 
        ? (manualContactDetails.localChurchPastor.trim().toLowerCase().startsWith("pastor") 
           ? manualContactDetails.localChurchPastor.trim() 
           : `Pastor ${manualContactDetails.localChurchPastor.trim()}`)
        : "",
    };

    setManualRows((prev) => [...prev, row]);
    setManualAttendeeDraft(blankAttendeeDraft());
    setStatus("Attendee added. You can edit details in Preview and Edit.");
  }

  async function onFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isExcelLeadComplete) {
      setImportStatus("Complete Contact Person Name, Church, Address, Local Church Pastor, and Phone Number first.");
      event.target.value = "";
      return;
    }

    setImportStatus("");
    setImportedRows([]);
    setDuplicateRows([]);
    setLastDeletedImportedRow(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(firstSheet, {
        header: 1,
        blankrows: false,
      });

      if (!rows.length) {
        setImportStatus("The selected file is empty.");
        return;
      }

      const headerRow = (rows[0] ?? []).map((cell: string | number | null | undefined) =>
        normalizeHeader(String(cell ?? "")),
      );
      const missing = requiredColumns.filter((column) => !headerRow.includes(column));

      if (missing.length) {
        setImportStatus(
          `Invalid columns. Missing: ${missing.join(", ")}. Required: Fullname | Church | Ministry | Address | Local Church Pastor | Phone Number.`,
        );
        return;
      }

      const idx = {
        fullName: headerRow.indexOf("fullname"),
        church: headerRow.indexOf("church"),
        ministry: headerRow.indexOf("ministry"),
        address: headerRow.indexOf("address"),
        localChurchPastor: headerRow.indexOf("local church pastor"),
        phoneNumber: headerRow.indexOf("phone number"),
      };

      const parsedRows: ImportedRow[] = rows
        .slice(1)
        .map((row: (string | number | null | undefined)[]) => ({
          fullName: String(row[idx.fullName] ?? "").trim(),
          church: String(row[idx.church] ?? "").trim(),
          ministry: normalizeMinistry(String(row[idx.ministry] ?? "")),
          address: String(row[idx.address] ?? "").trim(),
          localChurchPastor: String(row[idx.localChurchPastor] ?? "").trim(),
          phoneNumber: String(row[idx.phoneNumber] ?? "").trim(),
        }))
        .filter((row: ImportedRow) => Object.values(row).some((value: string) => value.length > 0));

      const invalid = parsedRows.find((row) => Object.values(row).some((value) => !value));
      if (invalid) {
        setImportStatus("Some rows have missing required values. Please complete all columns.");
        return;
      }

      const seen = new Set<string>();
      const uniques: ImportedRow[] = [];
      const dups: ImportedRow[] = [];

      for (const row of parsedRows) {
        const key = `${row.fullName.toLowerCase()}|${row.phoneNumber.replace(/\D/g, "")}`;
        if (seen.has(key)) {
          dups.push(row);
          continue;
        }
        seen.add(key);
        uniques.push(row);
      }

      setImportedRows(uniques);
      setDuplicateRows(dups);
      setImportStatus(
        `Imported ${uniques.length} valid rows.${dups.length ? ` ${dups.length} duplicate rows detected.` : ""}`,
      );
    } catch {
      setImportStatus("Unable to read the file. Please use .xlsx, .xls, or .csv.");
    } finally {
      event.target.value = "";
    }
  }

  async function submitImportedData() {
    if (!pendingConfirmation) return;

    if (!importedRows.length) {
      setImportStatus("Please import data first.");
      return;
    }

    const invalid = importedRows.find((row) => Object.values(row).some((value) => !value.trim()));
    if (invalid) {
      setImportStatus("Please complete all editable cells before registering imported data.");
      return;
    }

    setIsSubmitting(true);
    setImportStatus("");

    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bulkImport",
        payload: { rows: importedRows, leadDetails: excelLeadDetails, conference },
      }),
    });

    const data = (await response.json()) as {
      error?: string;
      message?: string;
      insertedCount?: number;
      duplicateInFileCount?: number;
      duplicateInDatabaseCount?: number;
    };

    if (!response.ok) {
      setImportStatus(data.error ?? "Unable to register imported data.");
      setIsSubmitting(false);
      return;
    }

    setImportStatus(
      `Success: ${data.insertedCount ?? 0} inserted. Duplicates in file: ${data.duplicateInFileCount ?? 0}. Duplicates in database: ${data.duplicateInDatabaseCount ?? 0}.`,
    );
    setImportedRows([]);
    setDuplicateRows([]);
    setShowConfirmModal(false);
    setPendingConfirmation(null);
    setSuccessMessage("Bulk registration submitted successfully.");
    setShowSuccessModal(true);
    setIsSubmitting(false);
  }

  function registerImportedData() {
    if (!importedRows.length) {
      setImportStatus("Please import data first.");
      return;
    }

    const invalid = importedRows.find((row) => Object.values(row).some((value) => !value.trim()));
    if (invalid) {
      setImportStatus("Please complete all editable cells before registering imported data.");
      return;
    }

    setPendingConfirmation({
      submitMode: "excel",
      contactName: excelLeadDetails.contactName,
      church: excelLeadDetails.church,
      ministry: excelLeadDetails.ministry,
      address: excelLeadDetails.address,
      localChurchPastor: `Pastor ${excelLeadDetails.localChurchPastor.trim()}`,
      phoneNumber: excelLeadDetails.phoneNumber,
      attendees: importedRows.map((row) => row.fullName),
    });
    setShowConfirmModal(true);
  }

  async function submitManualData() {
    if (!pendingConfirmation) return;

    const missingContactField = Object.entries(manualContactDetails).find(([, value]) => !value.trim());
    if (missingContactField) {
      setStatus("Please complete all Contact Person fields.");
      return;
    }

    if (!manualRows.length) {
      setStatus("Please add at least one attendee.");
      return;
    }

    const invalidRow = manualRows.find(
      (row) =>
        !row.fullName.trim() ||
        !row.phoneNumber.trim() ||
        !row.ministry.trim() ||
        !row.church.trim() ||
        !row.address.trim() ||
        !row.localChurchPastor.trim(),
    );

    if (invalidRow) {
      setStatus("Please complete all attendee row fields in Preview and Edit before submitting.");
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    const payload = {
      contactName: manualContactDetails.contactName,
      church: manualContactDetails.church,
      ministry: manualContactDetails.ministry,
      address: manualContactDetails.address,
      localChurchPastor: `Pastor ${manualContactDetails.localChurchPastor.trim()}`,
      phoneNumber: manualContactDetails.phoneNumber,
      attendeeCount: String(manualRows.length),
      attendeeNames: manualRows.map((row) => row.fullName).join("\n"),
      attendeeRows: manualRows,
      conference,
    };

    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bulk", payload }),
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

    setManualRows([]);
    setManualAttendeeDraft(blankAttendeeDraft());
    setLastDeletedManualRow(null);
    setShowConfirmModal(false);
    setPendingConfirmation(null);
    setStatus("Bulk registration submitted successfully.");
    setSuccessMessage("Bulk registration submitted successfully.");
    setShowSuccessModal(true);
    setIsSubmitting(false);
  }

  function onManualSubmit() {
    const missingContactField = Object.entries(manualContactDetails).find(([, value]) => !value.trim());
    if (missingContactField) {
      setStatus("Please complete all Contact Person fields.");
      return;
    }

    if (!manualRows.length) {
      setStatus("Please add at least one attendee.");
      return;
    }

    const invalidRow = manualRows.find(
      (row) =>
        !row.fullName.trim() ||
        !row.phoneNumber.trim() ||
        !row.ministry.trim() ||
        !row.church.trim() ||
        !row.address.trim() ||
        !row.localChurchPastor.trim(),
    );

    if (invalidRow) {
      setStatus("Please complete all attendee row fields in Preview and Edit before submitting.");
      return;
    }

    setPendingConfirmation({
      submitMode: "manual",
      contactName: manualContactDetails.contactName,
      church: manualContactDetails.church,
      ministry: manualContactDetails.ministry,
      address: manualContactDetails.address,
      localChurchPastor: manualContactDetails.localChurchPastor,
      phoneNumber: manualContactDetails.phoneNumber,
      attendees: manualRows.map((row) => row.fullName),
    });
    setShowConfirmModal(true);
  }

  async function onImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isImageLeadComplete) {
      setImageStatus("Complete Contact Person Name, Church, Ministry, Address, Local Church Pastor, and Phone Number first.");
      event.target.value = "";
      return;
    }

    setImageStatus("Reading image text. Please wait...");
    setIsReadingImage(true);

    try {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });

      const preprocessed = await preprocessImageForOcr(file);
      const primary = await worker.recognize(preprocessed);
      let rows = parseRowsFromOcrWords((primary.data as OcrResultData).words ?? [], imageLeadDetails);

      // Fallback: sparse mode + plain text parser for difficult handwriting/photos.
      if (!rows.length) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const fallback = await worker.recognize(file);
        rows = parseRowsFromOcrWords((fallback.data as OcrResultData).words ?? [], imageLeadDetails);

        if (!rows.length) {
          rows = parseRowsFromOcrText((fallback.data as OcrResultData).text ?? "", imageLeadDetails);
        }
      }

      await worker.terminate();

      if (!rows.length) {
        setImageStatus("No valid table rows were detected. Please use a clearer image with the expected header.");
        setImageRows([]);
        return;
      }

      setImageRows(rows);
      setLastDeletedImageRow(null);
      setImageStatus(`Image OCR complete. ${rows.length} row(s) loaded into preview.`);
    } catch {
      setImageStatus("Unable to read text from image. Please upload a clearer image or try again.");
      setImageRows([]);
    } finally {
      setIsReadingImage(false);
      event.target.value = "";
    }
  }

  async function submitImageData() {
    if (!pendingConfirmation) return;

    if (!imageRows.length) {
      setImageStatus("Please upload an image first.");
      return;
    }

    const invalid = imageRows.find((row) => Object.values(row).some((value) => !String(value).trim()));
    if (invalid) {
      setImageStatus("Please complete all row fields in Image Preview and Edit before registering.");
      return;
    }

    setIsSubmitting(true);
    setImageStatus("Registering image rows...");

    const response = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bulkImport",
        payload: { rows: imageRows, leadDetails: imageLeadDetails, conference },
      }),
    });

    const data = (await response.json()) as {
      error?: string;
      insertedCount?: number;
      duplicateInFileCount?: number;
      duplicateInDatabaseCount?: number;
    };

    if (!response.ok) {
      setImageStatus(data.error ?? "Unable to register image data.");
      setIsSubmitting(false);
      return;
    }

    setImageStatus(
      `Success: ${data.insertedCount ?? 0} inserted. Duplicates in file: ${data.duplicateInFileCount ?? 0}. Duplicates in database: ${data.duplicateInDatabaseCount ?? 0}.`,
    );
    setImageRows([]);
    setLastDeletedImageRow(null);
    setShowConfirmModal(false);
    setPendingConfirmation(null);
    setSuccessMessage("Bulk registration submitted successfully.");
    setShowSuccessModal(true);
    setIsSubmitting(false);
  }

  function registerImageData() {
    if (!imageRows.length) {
      setImageStatus("Please upload an image first.");
      return;
    }

    const invalid = imageRows.find((row) => Object.values(row).some((value) => !String(value).trim()));
    if (invalid) {
      setImageStatus("Please complete all row fields in Image Preview and Edit before registering.");
      return;
    }

    setPendingConfirmation({
      submitMode: "image",
      contactName: imageLeadDetails.contactName,
      church: imageLeadDetails.church,
      ministry: imageLeadDetails.ministry,
      address: imageLeadDetails.address,
      localChurchPastor: `Pastor ${imageLeadDetails.localChurchPastor.trim()}`,
      phoneNumber: imageLeadDetails.phoneNumber,
      attendees: imageRows.map((row) => row.fullName),
    });
    setShowConfirmModal(true);
  }

  async function confirmBulkSubmission() {
    if (!pendingConfirmation || isSubmitting) return;

    if (pendingConfirmation.submitMode === "manual") {
      await submitManualData();
      return;
    }

    if (pendingConfirmation.submitMode === "excel") {
      await submitImportedData();
      return;
    }

    await submitImageData();
  }

  function cancelBulkConfirmation() {
    setShowConfirmModal(false);
    setPendingConfirmation(null);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#331a1c_0%,#5c2f2d_30%,#1f2942_70%,#142032_100%)] px-4 py-8 md:flex md:items-center md:justify-center">
      <section className="mx-auto w-full max-w-[1500px] rounded-3xl border border-amber-100/30 bg-slate-900/80 p-5 text-amber-50 shadow-[0_18px_45px_rgba(3,8,20,0.45)] sm:p-7">
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <a href="/" className="text-amber-300 underline underline-offset-2">
            Back to Landing Page
          </a>
          <a href={`/register/individual?conference=${conference}`} className="text-amber-200 underline underline-offset-2 hover:text-amber-100">
            Switch to Individual Registration
          </a>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-amber-100">Bulk Registration</h1>
        <p className="mb-1 mt-1 text-sm text-amber-200">All fields are required.</p>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">
          Conference: {conferenceLabel}
        </p>

        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${
              mode === "manual"
                ? "border-amber-200 bg-amber-100 text-rose-950"
                : "border-amber-100/35 bg-slate-900/60 text-amber-100"
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode("excel")}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${
              mode === "excel"
                ? "border-amber-200 bg-amber-100 text-rose-950"
                : "border-amber-100/35 bg-slate-900/60 text-amber-100"
            }`}
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => setMode("image")}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${
              mode === "image"
                ? "border-amber-200 bg-amber-100 text-rose-950"
                : "border-amber-100/35 bg-slate-900/60 text-amber-100"
            }`}
          >
            Upload Image
          </button>
        </div>

        <datalist id="church-options-bulk">
          {churchOptions.map((church) => (
            <option key={church} value={church} />
          ))}
        </datalist>

        {mode === "manual" ? (
          <section className="rounded-2xl border border-amber-100/25 bg-slate-950/35 p-4">
            <h2 className="text-lg font-semibold text-amber-100">Manual Registration</h2>
            <p className="mt-1 text-sm text-amber-200">Fill Contact Person details, add attendees, then review and edit.</p>

            <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(840px,2fr)]">
              <div className="rounded-xl border border-amber-100/20 bg-black/15 p-3">
                <h3 className="text-sm font-semibold text-amber-200">Contact Person</h3>
                <div className="mt-2 grid gap-2">
                  <label className="grid gap-1">
                    <span className="text-xs">Full Name *</span>
                    <input
                      value={manualContactDetails.contactName}
                      onChange={(event) => updateManualContactDetails("contactName", event.target.value)}
                      placeholder="e.g. Juan Dela Cruz"
                      className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm focus:border-amber-400/50 outline-none transition-all"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs">Church *</span>
                    {churchOptions.length ? (
                      <select
                        defaultValue=""
                        onChange={(event) => updateManualContactDetails("church", event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
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
                      value={manualContactDetails.church}
                      onChange={(event) => updateManualContactDetails("church", event.target.value)}
                      list="church-options-bulk"
                      className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs">Ministry *</span>
                    <select
                      value={manualContactDetails.ministry}
                      onChange={(event) => updateManualContactDetails("ministry", event.target.value)}
                      className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
                    >
                      <option value="">Select ministry</option>
                      {ministryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <CascadingAddressField
                    idPrefix="manual-contact"
                    value={manualContactDetails.address}
                    onChange={(address) => updateManualContactDetails("address", address)}
                  />
                  <label className="grid gap-1">
                    <span className="text-xs">Local Church Pastor *</span>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-[10px] font-bold text-amber-200/80 pointer-events-none">Pastor</span>
                      <input
                        value={manualContactDetails.localChurchPastor}
                        onChange={(event) => updateManualContactDetails("localChurchPastor", event.target.value)}
                        placeholder="Name only (e.g. Juan Dela Cruz)"
                        className="w-full rounded-lg border border-amber-100/30 bg-slate-950/40 pl-12 pr-3 py-2 text-sm focus:border-amber-400/50 outline-none transition-all"
                      />
                    </div>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs">Phone Number *</span>
                    <input
                      value={manualContactDetails.phoneNumber}
                      onChange={(event) => updateManualContactDetails("phoneNumber", event.target.value)}
                      className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 border-t border-amber-100/15 pt-3">
                  <h3 className="text-sm font-semibold text-amber-200">Add Attendee</h3>
                  <div className="mt-2 grid gap-2">
                    <label className="grid gap-1">
                      <span className="text-xs">Full Name *</span>
                      <input
                        value={manualAttendeeDraft.fullName}
                        onChange={(event) => updateManualAttendeeDraft("fullName", event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs">Phone Number *</span>
                      <input
                        value={manualAttendeeDraft.phoneNumber}
                        onChange={(event) => updateManualAttendeeDraft("phoneNumber", event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs">Ministry *</span>
                      <select
                        value={manualAttendeeDraft.ministry}
                        onChange={(event) => updateManualAttendeeDraft("ministry", event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
                      >
                        <option value="">Select ministry</option>
                        {ministryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs">Address *</span>
                      <input
                        value={useContactPersonDetails ? manualContactDetails.address : manualAttendeeDraft.address}
                        onChange={(event) => updateManualAttendeeDraft("address", event.target.value)}
                        disabled={useContactPersonDetails}
                        placeholder={
                          useContactPersonDetails
                            ? "Using Contact Person address"
                            : "Enter attendee address"
                        }
                        className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm disabled:opacity-60"
                      />
                    </label>

                    <label className="mt-1 flex items-center gap-2 text-xs text-amber-200">
                      <input
                        type="checkbox"
                        checked={useContactPersonDetails}
                        onChange={(event) => setUseContactPersonDetails(event.target.checked)}
                        className="h-4 w-4 rounded border-amber-100/40 bg-slate-900"
                      />
                      Use Contact Person Church, Address, and Local Church Pastor for this attendee
                    </label>

                    <button
                      type="button"
                      onClick={addManualAttendee}
                      className="mt-2 rounded-xl border border-amber-100/40 bg-amber-100 px-4 py-2.5 text-sm font-bold text-rose-950"
                    >
                      Add Attendee
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-100/20 bg-black/15 p-3">
                <h3 className="text-sm font-semibold text-amber-200">Preview and Edit</h3>

                {lastDeletedManualRow ? (
                  <button
                    type="button"
                    onClick={undoManualDelete}
                    className="mt-2 rounded-lg border border-amber-100/40 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-slate-800/70"
                  >
                    Undo Deleted Row
                  </button>
                ) : null}

                {manualRows.length ? (
                  <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-amber-100/20">
                    <table className="w-full table-fixed text-left text-[11px] text-amber-100 sm:text-xs">
                      <thead className="bg-black/20 text-amber-300">
                        <tr>
                          <th className="w-[16%] px-2 py-2">Fullname</th>
                          <th className="w-[16%] px-2 py-2">Church</th>
                          <th className="w-[14%] px-2 py-2">Ministry</th>
                          <th className="w-[16%] px-2 py-2">Address</th>
                          <th className="w-[16%] px-2 py-2">Local Church Pastor</th>
                          <th className="w-[14%] px-2 py-2">Phone Number</th>
                          <th className="w-[8%] px-2 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualRows.map((row, index) => (
                          <tr key={`${row.fullName}-${row.phoneNumber}-${index}`} className="border-t border-amber-100/15">
                            <td className="p-1">
                              <input
                                value={row.fullName}
                                onChange={(event) => updateManualRow(index, "fullName", event.target.value)}
                                className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                value={row.church}
                                onChange={(event) => updateManualRow(index, "church", event.target.value)}
                                list="church-options-bulk"
                                className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                              />
                            </td>
                            <td className="p-1">
                              <select
                                value={row.ministry}
                                onChange={(event) => updateManualRow(index, "ministry", event.target.value)}
                                className="w-full rounded-md border border-amber-100/30 bg-slate-950 px-2 py-1 text-amber-100 [color-scheme:dark]"
                              >
                                <option value="">Select ministry</option>
                                {ministryOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-1">
                              <input
                                value={row.address}
                                onChange={(event) => updateManualRow(index, "address", event.target.value)}
                                className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                value={row.localChurchPastor}
                                onChange={(event) => updateManualRow(index, "localChurchPastor", event.target.value)}
                                className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                value={row.phoneNumber}
                                onChange={(event) => updateManualRow(index, "phoneNumber", event.target.value)}
                                className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                              />
                            </td>
                            <td className="p-1">
                              <button
                                type="button"
                                onClick={() => deleteManualRow(index)}
                                className="w-full rounded-md border border-rose-300/40 bg-rose-900/25 px-2 py-1 text-[10px] font-semibold text-rose-100 hover:bg-rose-900/40"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-amber-200">No attendees yet. Add attendees from the form on the left.</p>
                )}
              </div>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={onManualSubmit}
                disabled={isSubmitting}
                className="rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950 disabled:opacity-70"
              >
                {isSubmitting ? "Submitting..." : "Submit Bulk Registration"}
              </button>
            </div>
          </section>
        ) : null}

        {mode === "excel" ? (
          <section className="grid gap-4">
            <section className="rounded-2xl border border-amber-100/25 bg-slate-950/35 p-4">
                <h2 className="text-lg font-semibold text-amber-100">Import Excel File</h2>
                <p className="mt-1 text-sm text-amber-200">Fill required fields first, then upload and review Excel rows.</p>

                <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(840px,2fr)]">
                  <div className="rounded-xl border border-amber-100/20 bg-black/15 p-3">
                    <h3 className="text-sm font-semibold text-amber-200">Required Before Upload</h3>
                    <div className="mt-2 grid gap-2">
                      <label className="grid gap-1">
                        <span className="text-xs">Full Name *</span>
                        <input
                          value={excelLeadDetails.contactName}
                          onChange={(event) => updateExcelLeadDetails("contactName", event.target.value)}
                          placeholder="e.g. Juan Dela Cruz"
                          className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm focus:border-amber-400/50 outline-none transition-all"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs">Church *</span>
                        {churchOptions.length ? (
                          <select
                            defaultValue=""
                            onChange={(event) => updateExcelLeadDetails("church", event.target.value)}
                            className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
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
                          value={excelLeadDetails.church}
                          onChange={(event) => updateExcelLeadDetails("church", event.target.value)}
                          list="church-options-bulk"
                          className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs">Ministry *</span>
                        <select
                          value={excelLeadDetails.ministry}
                          onChange={(event) => updateExcelLeadDetails("ministry", event.target.value)}
                          className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
                        >
                          <option value="">Select ministry</option>
                          {ministryOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <CascadingAddressField
                        idPrefix="excel-lead"
                        value={excelLeadDetails.address}
                        onChange={(address) => updateExcelLeadDetails("address", address)}
                      />
                      <label className="grid gap-1">
                        <span className="text-xs">Local Church Pastor *</span>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-[10px] font-bold text-amber-200/80 pointer-events-none">Pastor</span>
                          <input
                            value={excelLeadDetails.localChurchPastor}
                            onChange={(event) => updateExcelLeadDetails("localChurchPastor", event.target.value)}
                            placeholder="Name only (e.g. Juan Dela Cruz)"
                            className="w-full rounded-lg border border-amber-100/30 bg-slate-950/40 pl-12 pr-3 py-2 text-sm focus:border-amber-400/50 outline-none transition-all"
                          />
                        </div>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs">Phone Number *</span>
                        <input
                          value={excelLeadDetails.phoneNumber}
                          onChange={(event) => updateExcelLeadDetails("phoneNumber", event.target.value)}
                          className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label
                        className={`inline-block rounded-lg border px-3 py-2 text-sm font-semibold ${
                          isExcelLeadComplete
                            ? "cursor-pointer border-amber-100/40 bg-slate-900/60 text-amber-100 hover:bg-slate-800/70"
                            : "cursor-not-allowed border-amber-100/20 bg-slate-900/30 text-amber-200/60"
                        }`}
                      >
                        Upload Excel File
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={onFileImport}
                          disabled={!isExcelLeadComplete}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowImportInstructions(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-100/45 bg-slate-900/60 text-sm font-bold text-amber-100"
                        aria-label="Show import instructions"
                        title="Import instructions"
                      >
                        i
                      </button>

                      <button
                        type="button"
                        onClick={downloadBlankTemplate}
                        className="rounded-lg border border-amber-100/40 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-slate-800/70"
                      >
                        Download Blank Excel Template
                      </button>
                    </div>

                    {!isExcelLeadComplete ? (
                      <p className="mt-2 text-xs text-amber-300">
                        Complete all required fields first before upload is enabled.
                      </p>
                    ) : null}

                    {importStatus ? <p className="mt-2 text-sm text-amber-200">{importStatus}</p> : null}
                    {duplicateRows.length ? (
                      <p className="mt-2 text-sm font-semibold text-rose-300">
                        Duplicate rows detected in file: {duplicateRows.length}. Only unique rows are loaded.
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-amber-100/20 bg-black/15 p-3">
                    <h3 className="text-sm font-semibold text-amber-200">Excel Preview and Edit</h3>

                    {lastDeletedImportedRow ? (
                      <button
                        type="button"
                        onClick={undoImportedDelete}
                        className="mt-2 rounded-lg border border-amber-100/40 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-slate-800/70"
                      >
                        Undo Deleted Row
                      </button>
                    ) : null}

                    {importedRows.length ? (
                      <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-amber-100/20">
                        <table className="w-full table-fixed text-left text-[11px] text-amber-100 sm:text-xs">
                          <thead className="bg-black/20 text-amber-300">
                            <tr>
                              <th className="w-[16%] px-2 py-2">Fullname</th>
                              <th className="w-[16%] px-2 py-2">Church</th>
                              <th className="w-[14%] px-2 py-2">Ministry</th>
                              <th className="w-[16%] px-2 py-2">Address</th>
                              <th className="w-[16%] px-2 py-2">Local Church Pastor</th>
                              <th className="w-[14%] px-2 py-2">Phone Number</th>
                              <th className="w-[8%] px-2 py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importedRows.map((row, index) => (
                              <tr key={`${row.fullName}-${row.phoneNumber}-${index}`} className="border-t border-amber-100/15">
                                <td className="p-1">
                                  <input
                                    value={row.fullName}
                                    onChange={(event) => updateImportedRow(index, "fullName", event.target.value)}
                                    className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                  />
                                </td>
                                <td className="p-1">
                                  <input
                                    value={row.church}
                                    onChange={(event) => updateImportedRow(index, "church", event.target.value)}
                                    list="church-options-bulk"
                                    className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                  />
                                </td>
                                <td className="p-1">
                                  <select
                                    value={row.ministry}
                                    onChange={(event) => updateImportedRow(index, "ministry", event.target.value)}
                                    className="w-full rounded-md border border-amber-100/30 bg-slate-950 px-2 py-1 text-amber-100 [color-scheme:dark]"
                                  >
                                    <option value="">Select ministry</option>
                                    {row.ministry && !ministryOptions.includes(row.ministry) ? (
                                      <option value={row.ministry}>{row.ministry}</option>
                                    ) : null}
                                    {ministryOptions.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-1">
                                  <input
                                    value={row.address}
                                    onChange={(event) => updateImportedRow(index, "address", event.target.value)}
                                    className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                  />
                                </td>
                                <td className="p-1">
                                  <input
                                    value={row.localChurchPastor}
                                    onChange={(event) => updateImportedRow(index, "localChurchPastor", event.target.value)}
                                    className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                  />
                                </td>
                                <td className="p-1">
                                  <input
                                    value={row.phoneNumber}
                                    onChange={(event) => updateImportedRow(index, "phoneNumber", event.target.value)}
                                    className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                  />
                                </td>
                                <td className="p-1">
                                  <button
                                    type="button"
                                    onClick={() => deleteImportedRow(index)}
                                    className="w-full rounded-md border border-rose-300/40 bg-rose-900/25 px-2 py-1 text-[10px] font-semibold text-rose-100 hover:bg-rose-900/40"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-amber-200">No imported rows yet. Upload an Excel file to preview and edit.</p>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={registerImportedData}
                    disabled={isSubmitting || importedRows.length === 0}
                    className="rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950 disabled:opacity-60"
                  >
                    {isSubmitting ? "Registering..." : "Register Imported Data"}
                  </button>
                </div>
              </section>
          </section>
        ) : null}

        {mode === "image" ? (
          <section className="grid gap-4">
            <section className="rounded-2xl border border-amber-100/25 bg-slate-950/35 p-4">
              <h2 className="text-lg font-semibold text-amber-100">Upload Image</h2>
              <p className="mt-1 text-sm text-amber-200">Fill required fields first, then upload and review OCR rows.</p>

              <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(840px,2fr)]">
                <div className="rounded-xl border border-amber-100/20 bg-black/15 p-3">
                  <h3 className="text-sm font-semibold text-amber-200">Required Before Upload</h3>
                  <div className="mt-2 grid gap-2">
                    <label className="grid gap-1">
                      <span className="text-xs">Full Name *</span>
                      <input
                        value={imageLeadDetails.contactName}
                        onChange={(event) => updateImageLeadDetails("contactName", event.target.value)}
                        placeholder="e.g. Juan Dela Cruz"
                        className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm focus:border-amber-400/50 outline-none transition-all"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs">Church *</span>
                      {churchOptions.length ? (
                        <select
                          defaultValue=""
                          onChange={(event) => updateImageLeadDetails("church", event.target.value)}
                          className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
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
                        value={imageLeadDetails.church}
                        onChange={(event) => updateImageLeadDetails("church", event.target.value)}
                        list="church-options-bulk"
                        className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                      />
                    </label>
                    <CascadingAddressField
                      idPrefix="image-lead"
                      value={imageLeadDetails.address}
                      onChange={(address) => updateImageLeadDetails("address", address)}
                    />
                    <label className="grid gap-1">
                      <span className="text-xs">Ministry *</span>
                      <select
                        value={imageLeadDetails.ministry}
                        onChange={(event) => updateImageLeadDetails("ministry", event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
                      >
                        <option value="">Select ministry</option>
                        {ministryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs">Local Church Pastor *</span>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 text-[10px] font-bold text-amber-200/80 pointer-events-none">Pastor</span>
                        <input
                          value={imageLeadDetails.localChurchPastor}
                          onChange={(event) => updateImageLeadDetails("localChurchPastor", event.target.value)}
                          placeholder="Name only (e.g. Juan Dela Cruz)"
                          className="w-full rounded-lg border border-amber-100/30 bg-slate-950/40 pl-12 pr-3 py-2 text-sm focus:border-amber-400/50 outline-none transition-all"
                        />
                      </div>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs">Phone Number *</span>
                      <input
                        value={imageLeadDetails.phoneNumber}
                        onChange={(event) => updateImageLeadDetails("phoneNumber", event.target.value)}
                        className="rounded-lg border border-amber-100/30 bg-slate-950/40 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-3">
                      <label className="grid gap-1">
                        <span className="text-xs">Ministry *</span>
                        <select
                          value={excelLeadDetails.ministry}
                          onChange={(event) => updateExcelLeadDetails("ministry", event.target.value)}
                          className="rounded-lg border border-amber-100/30 bg-slate-950 px-3 py-2 text-sm text-amber-100 [color-scheme:dark]"
                        >
                          <option value="">Select ministry</option>
                          {ministryOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    <label
                      className={`inline-block rounded-lg border px-3 py-2 text-sm font-semibold ${
                        isImageLeadComplete
                          ? "cursor-pointer border-amber-100/40 bg-slate-900/60 text-amber-100 hover:bg-slate-800/70"
                          : "cursor-not-allowed border-amber-100/20 bg-slate-900/30 text-amber-200/60"
                      }`}
                    >
                      Upload Image File
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onImageUpload}
                        disabled={!isImageLeadComplete}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {!isImageLeadComplete ? (
                    <p className="mt-2 text-xs text-amber-300">Complete all required fields first before upload is enabled.</p>
                  ) : null}

                  {imageStatus ? <p className="mt-2 text-sm text-amber-200">{imageStatus}</p> : null}
                  {isReadingImage ? <p className="mt-2 text-sm text-amber-300">OCR is processing the image...</p> : null}
                </div>

                <div className="rounded-xl border border-amber-100/20 bg-black/15 p-3">
                  <h3 className="text-sm font-semibold text-amber-200">Image Preview and Edit</h3>

                  {lastDeletedImageRow ? (
                    <button
                      type="button"
                      onClick={undoImageDelete}
                      className="mt-2 rounded-lg border border-amber-100/40 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-slate-800/70"
                    >
                      Undo Deleted Row
                    </button>
                  ) : null}

                  {imageRows.length ? (
                    <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-amber-100/20">
                      <table className="w-full table-fixed text-left text-[11px] text-amber-100 sm:text-xs">
                        <thead className="bg-black/20 text-amber-300">
                          <tr>
                            <th className="w-[16%] px-2 py-2">Fullname</th>
                            <th className="w-[16%] px-2 py-2">Church</th>
                            <th className="w-[14%] px-2 py-2">Ministry</th>
                            <th className="w-[16%] px-2 py-2">Address</th>
                            <th className="w-[16%] px-2 py-2">Local Church Pastor</th>
                            <th className="w-[14%] px-2 py-2">Phone Number</th>
                            <th className="w-[8%] px-2 py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {imageRows.map((row, index) => (
                            <tr key={`${row.fullName}-${row.phoneNumber}-${index}`} className="border-t border-amber-100/15">
                              <td className="p-1">
                                <input
                                  value={row.fullName}
                                  onChange={(event) => updateImageRow(index, "fullName", event.target.value)}
                                  className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  value={row.church}
                                  onChange={(event) => updateImageRow(index, "church", event.target.value)}
                                  list="church-options-bulk"
                                  className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                />
                              </td>
                              <td className="p-1">
                                <select
                                  value={row.ministry}
                                  onChange={(event) => updateImageRow(index, "ministry", event.target.value)}
                                  className="w-full rounded-md border border-amber-100/30 bg-slate-950 px-2 py-1 text-amber-100 [color-scheme:dark]"
                                >
                                  <option value="">Select ministry</option>
                                  {row.ministry && !ministryOptions.includes(row.ministry) ? (
                                    <option value={row.ministry}>{row.ministry}</option>
                                  ) : null}
                                  {ministryOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-1">
                                <input
                                  value={row.address}
                                  onChange={(event) => updateImageRow(index, "address", event.target.value)}
                                  className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  value={row.localChurchPastor}
                                  onChange={(event) => updateImageRow(index, "localChurchPastor", event.target.value)}
                                  className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  value={row.phoneNumber}
                                  onChange={(event) => updateImageRow(index, "phoneNumber", event.target.value)}
                                  className="w-full rounded-md border border-amber-100/30 bg-slate-950/40 px-2 py-1"
                                />
                              </td>
                              <td className="p-1">
                                <button
                                  type="button"
                                  onClick={() => deleteImageRow(index)}
                                  className="w-full rounded-md border border-rose-300/40 bg-rose-900/25 px-2 py-1 text-[10px] font-semibold text-rose-100 hover:bg-rose-900/40"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-amber-200">
                      No OCR rows yet. Upload an image containing the header and table to preview and edit.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={registerImageData}
                  disabled={isSubmitting || imageRows.length === 0 || isReadingImage}
                  className="rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-sm font-extrabold text-rose-950 disabled:opacity-60"
                >
                  {isSubmitting ? "Registering..." : "Register Image Data"}
                </button>
              </div>
            </section>
          </section>
        ) : null}

        {showImportInstructions ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-4xl rounded-2xl border border-amber-100/25 bg-slate-900 p-4 text-amber-100 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-amber-100">Excel Import Instructions</h3>
                <button
                  type="button"
                  onClick={() => setShowImportInstructions(false)}
                  className="rounded-lg border border-amber-100/40 px-3 py-1 text-sm font-semibold text-amber-100 hover:bg-slate-800/70"
                >
                  Close
                </button>
              </div>

              <p className="mt-3 text-sm text-amber-200">
                File must be an Excel file and below is the required format.
              </p>

              <div className="mt-3 overflow-x-auto rounded-lg border border-amber-100/25">
                <table className="min-w-full text-left text-xs text-amber-100 sm:text-sm">
                  <thead className="bg-black/20 text-amber-300">
                    <tr>
                      <th className="px-2 py-2">Fullname</th>
                      <th className="px-2 py-2">Church</th>
                      <th className="px-2 py-2">Ministry</th>
                      <th className="px-2 py-2">Address</th>
                      <th className="px-2 py-2">Local Church Pastor</th>
                      <th className="px-2 py-2">Phone Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-amber-100/15">
                      <td className="px-2 py-2">Juan Dela Cruz</td>
                      <td className="px-2 py-2">Joyful Sound Church - International</td>
                      <td className="px-2 py-2">Media Team</td>
                      <td className="px-2 py-2">123 Mission Street</td>
                      <td className="px-2 py-2">Ptra. Gracelyn Gambe</td>
                      <td className="px-2 py-2">0991-0000-000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {showConfirmModal && pendingConfirmation ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-2xl rounded-2xl border border-amber-100/25 bg-slate-900 p-4 text-amber-100 shadow-2xl sm:p-5">
              <h3 className="text-lg font-bold text-amber-100">Confirm Bulk Registration Details</h3>
              <p className="mt-1 text-sm text-amber-200">Please review Contact Person and attendee list before submitting.</p>

              <div className="mt-3 rounded-lg border border-amber-100/20 bg-black/15 p-3 text-sm">
                <p className="m-0"><span className="font-semibold text-amber-300">Conference:</span> {conferenceLabel}</p>
                <p className="m-0 mt-1"><span className="font-semibold text-amber-300">Contact Person:</span> {pendingConfirmation.contactName}</p>
                <p className="m-0 mt-1"><span className="font-semibold text-amber-300">Church:</span> {pendingConfirmation.church}</p>
                <p className="m-0 mt-1"><span className="font-semibold text-amber-300">Ministry:</span> {pendingConfirmation.ministry || "N/A"}</p>
                <p className="m-0 mt-1"><span className="font-semibold text-amber-300">Address:</span> {pendingConfirmation.address}</p>
                <p className="m-0 mt-1"><span className="font-semibold text-amber-300">Local Church Pastor:</span> {pendingConfirmation.localChurchPastor}</p>
                <p className="m-0 mt-1"><span className="font-semibold text-amber-300">Phone Number:</span> {pendingConfirmation.phoneNumber}</p>
              </div>

              <div className="mt-3 rounded-lg border border-amber-100/20 bg-black/15 p-3">
                <p className="m-0 text-sm font-semibold text-amber-300">Attendees Added: {pendingConfirmation.attendees.length}</p>
                <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-amber-100/15 bg-slate-950/40 p-2 text-sm">
                  {pendingConfirmation.attendees.length ? (
                    <ul className="m-0 list-disc space-y-1 pl-4 text-amber-100">
                      {pendingConfirmation.attendees.map((attendee, index) => (
                        <li key={`${attendee}-${index}`}>{attendee}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 text-amber-200">No attendees found.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelBulkConfirmation}
                  disabled={isSubmitting}
                  className="rounded-lg border border-amber-100/40 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-slate-800/70 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmBulkSubmission}
                  disabled={isSubmitting}
                  className="rounded-lg bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2 text-sm font-extrabold text-rose-950 disabled:opacity-60"
                >
                  {isSubmitting ? "Submitting..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showSuccessModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-amber-100/30 bg-slate-900 p-5 shadow-[0_18px_50px_rgba(3,8,20,0.55)] sm:p-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-500/20 text-xl text-emerald-200">
                ✓
              </div>
              <h2 className="mt-3 text-center text-xl font-bold text-amber-100">Registration Successful</h2>
              <p className="mt-2 text-center text-sm text-amber-200">{successMessage || "Bulk registration submitted successfully."}</p>

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

        {mode === "manual" && status ? <p className="mt-3 text-sm text-amber-200">{status}</p> : null}

        <style jsx global>{`
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
    </main>
  );
}
