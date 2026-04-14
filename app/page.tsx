"use client";

import { useMemo, useState } from "react";
import LiveSlotsIndicator from "./components/live-slots-indicator";

const churchLogo =
	"https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/LOGO.png";
const imageVersion = "20260408";

type ConferenceKey = "leyte" | "cebu";

type ConferenceConfig = {
	key: ConferenceKey;
	label: string;
	bannerImage: string;
	registrationTitle: string;
	totalSlots: number;
	emailSubject: string;
};

const conferenceConfigs: Record<ConferenceKey, ConferenceConfig> = {
	leyte: {
		key: "leyte",
		label: "Leyte Conference",
		bannerImage:
			`https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/LEYTE_Empowered_With_Purpose.png?v=${imageVersion}`,
		registrationTitle: "REGISTRATION FORM: LEYTE CHRISTIAN LEADERSHIP CONFERENCE 2026",
		totalSlots: 100,
		emailSubject: "Leyte Christian Leadership Conference 2026 Inquiry",
	},
	cebu: {
		key: "cebu",
		label: "Cebu Conference",
		bannerImage:
			`https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/CEBU_Empowered_With_Purpose.png?v=${imageVersion}`,
		registrationTitle: "REGISTRATION FORM: CEBU CHRISTIAN LEADERSHIP CONFERENCE 2026",
		totalSlots: 100,
		emailSubject: "Cebu Christian Leadership Conference 2026 Inquiry",
	},
};

export default function Page() {
	const [selectedConference, setSelectedConference] = useState<ConferenceKey>("leyte");
	const [pendingConference, setPendingConference] = useState<ConferenceKey | null>(null);
	const [isSwitchingConference, setIsSwitchingConference] = useState(false);
	const [availableSlotsByConference, setAvailableSlotsByConference] = useState<Record<ConferenceKey, number>>({
		leyte: conferenceConfigs.leyte.totalSlots,
		cebu: conferenceConfigs.cebu.totalSlots,
	});

	const conference = conferenceConfigs[selectedConference];
	const conferenceQuery = useMemo(() => `conference=${conference.key}`, [conference.key]);
	const isRegistrationClosed = (availableSlotsByConference[conference.key] ?? conference.totalSlots) <= 0;

	function onConferenceSelect(nextConference: ConferenceKey) {
		if (nextConference === selectedConference) {
			return;
		}

		setPendingConference(nextConference);
	}

	function confirmConferenceSwitch() {
		if (!pendingConference) return;
		setIsSwitchingConference(true);
		window.setTimeout(() => {
			setSelectedConference(pendingConference);
			setIsSwitchingConference(false);
		}, 220);
		setPendingConference(null);
	}

	function cancelConferenceSwitch() {
		setPendingConference(null);
	}

	function openEmail(event: React.MouseEvent<HTMLAnchorElement>) {
		event.preventDefault();

		const to = "gambepsalm50@gmail.com";
		const encodedSubject = encodeURIComponent(conference.emailSubject);
		const gmailWebComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${encodedSubject}`;
		const gmailAppUrl = `googlegmail://co?to=${to}&subject=${encodedSubject}`;
		const mailToUrl = `mailto:${to}?subject=${encodedSubject}`;

		const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

		if (!isMobile) {
			window.open(gmailWebComposeUrl, "_blank", "noopener,noreferrer");
			return;
		}

		const fallbackTimeout = window.setTimeout(() => {
			window.location.href = mailToUrl;
		}, 900);

		const clearFallback = () => {
			window.clearTimeout(fallbackTimeout);
			document.removeEventListener("visibilitychange", clearOnHidden);
		};

		const clearOnHidden = () => {
			if (document.visibilityState === "hidden") {
				clearFallback();
			}
		};

		document.addEventListener("visibilitychange", clearOnHidden);
		window.location.href = gmailAppUrl;
	}

	function onSlotsAvailabilityChange(availableSlots: number) {
		setAvailableSlotsByConference((current) => ({
			...current,
			[conference.key]: availableSlots,
		}));
	}

	return (
		<main className="relative min-h-screen overflow-x-hidden overflow-y-auto lg:h-screen lg:overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(207,103,54,0.4),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(255,207,122,0.22),transparent_32%),linear-gradient(130deg,#331a1c_0%,#5c2f2d_28%,#1f2942_72%,#142032_100%)] px-3 py-6 sm:px-4 sm:py-12 lg:px-4 lg:py-4">
			<div
				className="pointer-events-none absolute -left-[8vw] -top-[10vw] h-[42vw] w-[42vw] blur-[70px] opacity-20"
				style={{ background: "#f6b261" }}
				aria-hidden="true"
			/>
			<div
				className="pointer-events-none absolute -bottom-[16vw] -right-[10vw] h-[42vw] w-[42vw] blur-[70px] opacity-20"
				style={{ background: "#6989d6" }}
				aria-hidden="true"
			/>

			<section
				className="relative z-10 mx-auto grid h-auto lg:h-full min-h-screen w-full max-w-[1360px] animate-[fade-up_700ms_ease-out] content-center place-items-center gap-4 lg:grid-cols-[minmax(0,716px)_minmax(0,620px)] lg:gap-0"
				aria-label="Event registration landing page"
			>
				<article className="relative h-auto min-h-[min(450px,80vh)] w-full max-w-[716px] lg:aspect-square lg:h-full lg:max-w-[min(716px,calc(100vh-2rem))] overflow-hidden rounded-3xl border border-amber-100/35 shadow-[0_18px_45px_rgba(3,8,20,0.45)] lg:max-w-none lg:rounded-r-none">
					<img
						src={conference.bannerImage}
						alt="Empowered With Purpose event banner"
						className={`block h-full w-full object-contain transition-opacity duration-300 ease-out ${
							isSwitchingConference ? "opacity-0" : "opacity-100"
						}`}
					/>

					<div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent p-4 pb-6 sm:p-6 sm:pb-8">
						<div className="grid w-full max-w-[480px] grid-cols-2 gap-2 rounded-xl border border-amber-100/35 bg-black/45 p-2 backdrop-blur-sm">
							<button
								type="button"
								onClick={() => onConferenceSelect("leyte")}
								disabled={isSwitchingConference}
								className={`rounded-lg px-3 py-2.5 text-sm font-extrabold uppercase tracking-[0.045em] transition sm:text-base ${
									selectedConference === "leyte"
										? "bg-amber-100 text-rose-950 shadow-[0_4px_12px_rgba(251,191,36,0.3)] ring-2 ring-amber-200/50"
										: "text-amber-100 hover:bg-white/5 hover:text-white"
								}`}
							>
								Leyte Conference
							</button>
							<button
								type="button"
								onClick={() => onConferenceSelect("cebu")}
								disabled={isSwitchingConference}
								className={`rounded-lg px-3 py-2.5 text-sm font-extrabold uppercase tracking-[0.045em] transition sm:text-base ${
									selectedConference === "cebu"
										? "bg-amber-100 text-rose-950 shadow-[0_4px_12px_rgba(251,191,36,0.3)] ring-2 ring-amber-200/50"
										: "text-amber-100 hover:bg-white/5 hover:text-white"
								}`}
							>
								Cebu Conference
							</button>
						</div>
					</div>
				</article>

				<article
					className={`h-auto lg:h-[min(716px,calc(100vh-2rem))] w-full max-w-[620px] overflow-y-auto rounded-3xl border border-amber-100/20 bg-[linear-gradient(170deg,rgba(48,23,24,0.86),rgba(20,31,56,0.88))] shadow-[0_16px_40px_rgba(5,13,26,0.45)] transition-all duration-300 ease-out lg:rounded-l-none ${
						isSwitchingConference ? "translate-y-1 opacity-80" : "translate-y-0 opacity-100"
					}`}
				>
					<div className="flex h-full flex-col gap-4 p-5 text-amber-50 sm:gap-3.5 sm:p-6">
						<div className="mb-2 flex justify-center lg:mb-0">
							<img
								src={churchLogo}
								alt="Joyful Sound Church logo"
								className="logo-float max-h-[70px] max-w-[70px] object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)] sm:max-h-[80px] sm:max-w-[80px]"
							/>
						</div>
						<p className="m-0 text-center text-[0.8rem] font-bold uppercase tracking-[0.08em] text-amber-300 sm:text-[0.86rem]">
							Joyful Sound Church - International
						</p>
						<h1 className="m-0 text-[clamp(1.25rem,1.9vw,1.7rem)] font-bold leading-tight tracking-[0.02em] text-amber-100">
							{conference.registrationTitle}
						</h1>
						<h2 className="m-0 text-[clamp(1rem,1.2vw,1.1rem)] font-semibold tracking-[0.06em] text-amber-300">
							THEME: EMPOWERED WITH PURPOSE
						</h2>

						<blockquote className="m-0 rounded-lg border-l-4 border-amber-300/80 bg-white/5 p-3 text-[0.8rem] leading-relaxed text-amber-50 sm:text-[0.92rem]">
							"He has saved us and called us to a holy life-not because of anything we have done but
							because of his own purpose and grace. This grace was given us in Christ Jesus before
							the beginning of time" - 2 TIMOTHY 1:9 -
						</blockquote>

						<div className="rounded-xl border border-amber-200/25 bg-slate-950/20 p-3 text-[0.8rem] leading-relaxed text-amber-100 sm:text-[0.92rem]">
							<p className="mb-2 mt-0 font-semibold">For More details and Inquiries. Kindly contact the details below:</p>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
								<div className="space-y-1.5 rounded-lg border border-amber-200/20 bg-black/10 p-2">
									<p className="m-0 font-medium text-amber-200">Email Address</p>
									<a
										href={`https://mail.google.com/mail/?view=cm&fs=1&to=gambepsalm50@gmail.com&su=${encodeURIComponent(conference.emailSubject)}`}
										onClick={openEmail}
										className="inline-block break-all font-semibold text-amber-200 underline underline-offset-2 transition hover:text-amber-100"
									>
										gambepsalm50@gmail.com
									</a>
									<p className="m-0 pt-1 text-amber-100">
										Landline: <a href="tel:0325206977" className="font-semibold underline underline-offset-2 hover:text-amber-50">0325206977</a>
									</p>
								</div>

								<div className="space-y-1.5 rounded-lg border border-amber-200/20 bg-black/10 p-2">
									<p className="m-0 font-medium text-amber-200">Contact Numbers</p>
									<ul className="m-0 list-none space-y-0.5 p-0">
										<li>
											Mobile Number: <a href="tel:+639474803748" className="font-semibold underline underline-offset-2 hover:text-amber-50">0947 480 3748</a>
										</li>
										<li>
											Mobile Number: <a href="tel:+639173032172" className="font-semibold underline underline-offset-2 hover:text-amber-50">0917 303 2172</a>
										</li>
									</ul>
								</div>
							</div>
						</div>

						<div className="mt-1 flex flex-col-reverse gap-2">
							{isRegistrationClosed ? (
								<div className="rounded-xl border border-rose-200/35 bg-[linear-gradient(135deg,rgba(244,63,94,0.16),rgba(217,119,6,0.14),rgba(30,41,59,0.65))] p-4 text-center shadow-[0_10px_18px_rgba(0,0,0,0.28)]">
									<p className="m-0 text-[1.05rem] font-extrabold tracking-[0.03em] text-amber-100 sm:text-[1.15rem]">
										Registration Is Now Closed
									</p>
									<p className="mt-2 text-sm leading-relaxed text-amber-200">
										Thank you for your overwhelming love and support. We are deeply grateful for everyone who registered,
										and we pray this conference will be a blessing to all attendees.
									</p>
								</div>
							) : (
								<details className="register-toggle">
									<summary className="cursor-pointer list-none rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-5 py-3.5 text-center text-[1.2rem] font-extrabold tracking-[0.04em] text-rose-950 shadow-[0_10px_18px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(0,0,0,0.3)] sm:text-[1.28rem]">
										Register Now
									</summary>
									<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
										<a
											href={`/register/individual?${conferenceQuery}`}
											className="rounded-lg border border-amber-100/70 bg-amber-100 px-3 py-2.5 text-center text-[0.95rem] font-bold text-rose-950 transition hover:-translate-y-0.5 hover:bg-amber-50"
										>
											Individual Registration
										</a>
										<a
											href={`/register/bulk?${conferenceQuery}`}
											className="rounded-lg border border-indigo-200/60 bg-indigo-900/85 px-3 py-2.5 text-center text-[0.95rem] font-bold text-amber-50 transition hover:-translate-y-0.5 hover:bg-indigo-800"
										>
											Bulk Registration
										</a>
									</div>
								</details>
							)}
							<LiveSlotsIndicator
								initialAvailableSlots={conference.totalSlots}
								totalSlots={conference.totalSlots}
								conference={conference.key}
								onAvailabilityChange={onSlotsAvailabilityChange}
							/>
						</div>
					</div>
				</article>
			</section>

			{pendingConference ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Confirm conference selection"
						className="w-full max-w-md rounded-2xl border border-amber-100/30 bg-[linear-gradient(150deg,rgba(25,18,20,0.96),rgba(20,36,54,0.96))] p-5 text-amber-50 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
					>
						<h3 className="m-0 text-xl font-extrabold uppercase tracking-[0.04em] text-amber-100">
							Switch to {pendingConference === "cebu" ? "Cebu Conference" : "Leyte Conference"}?
						</h3>
						<p className="mb-0 mt-2 text-sm leading-relaxed text-amber-200">
							You are about to register in {pendingConference === "cebu" ? "Cebu Conference" : "Leyte Conference"}. Do you want to continue?
						</p>
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onClick={cancelConferenceSwitch}
								className="rounded-lg border border-amber-100/35 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-slate-800"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={confirmConferenceSwitch}
								className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-rose-950 transition hover:bg-amber-50"
							>
								Continue
							</button>
						</div>
					</div>
				</div>
			) : null}
		</main>
	);
}
