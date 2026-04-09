"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LiveSlotsIndicatorProps = {
  initialAvailableSlots: number;
  totalSlots: number;
  conference: "leyte" | "cebu";
  onAvailabilityChange?: (availableSlots: number) => void;
};

export default function LiveSlotsIndicator({
  initialAvailableSlots,
  totalSlots,
  conference,
  onAvailabilityChange,
}: LiveSlotsIndicatorProps) {
  const [availableSlots, setAvailableSlots] = useState(initialAvailableSlots);
  const slotsCacheRef = useRef<Record<"leyte" | "cebu", number>>({
    leyte: initialAvailableSlots,
    cebu: initialAvailableSlots,
  });

  const refreshSlots = useCallback(async () => {
    try {
      const response = await fetch(`/api/registrations?mode=slots&conference=${conference}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return;

      const data = (await response.json()) as { availableSlots?: number; attendeesCount?: number };
      if (typeof data.availableSlots === "number") {
        const nextSlots = Math.max(data.availableSlots, 0);
        slotsCacheRef.current[conference] = nextSlots;
        setAvailableSlots(nextSlots);
        onAvailabilityChange?.(nextSlots);
        return;
      }

      const attendeesCount = Number(data.attendeesCount ?? 0);
      const nextSlots = Math.max(totalSlots - attendeesCount, 0);
      slotsCacheRef.current[conference] = nextSlots;
      setAvailableSlots(nextSlots);
      onAvailabilityChange?.(nextSlots);
    } catch {
      // Keep last known value on refresh error.
    }
  }, [conference, onAvailabilityChange, totalSlots]);

  useEffect(() => {
    const cached = slotsCacheRef.current[conference];
    if (typeof cached === "number") {
      setAvailableSlots(cached);
    }

    void refreshSlots();
  }, [conference, refreshSlots]);

  useEffect(() => {
    const intervalId = window.setInterval(refreshSlots, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSlots();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSlots]);

  return (
    <div className="slots-indicator-display rounded-xl border border-amber-200/35 bg-[linear-gradient(135deg,rgba(245,193,104,0.2),rgba(35,45,70,0.42))] px-3 py-3 text-center shadow-[0_10px_20px_rgba(7,13,28,0.35)]">
      <p className="m-0 text-[1.55rem] font-black leading-none tracking-[0.02em] text-amber-100 sm:text-[1.75rem]">
        {availableSlots} Slots Available
      </p>
    </div>
  );
}
