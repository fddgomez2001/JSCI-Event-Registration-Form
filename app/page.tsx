import { createClient } from "@supabase/supabase-js";
import LiveSlotsIndicator from "./components/live-slots-indicator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bannerImage =
	"https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/Empowered_With_Purpose.jpg";
const churchLogo =
	"https://oilbgqmzxltdrksiypfi.supabase.co/storage/v1/object/public/Logo/assets/LOGO.png";

const TOTAL_SLOTS = 100;

async function getAttendeesCount() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseKey =
		process.env.SUPABASE_SERVICE_ROLE_KEY ??
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

	if (!supabaseUrl || !supabaseKey) {
		return 0;
	}

	const supabase = createClient(supabaseUrl, supabaseKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	const [{ count: individualCount, error: individualError }, { data: bulkRows, error: bulkError }] = await Promise.all([
		supabase.from("individual_registrations").select("id", { count: "exact", head: true }),
		supabase.from("bulk_registrations").select("attendee_count").limit(5000),
	]);

	if (individualError || bulkError) {
		return 0;
	}

	const bulkAttendees = (bulkRows ?? []).reduce((sum, row) => sum + Number(row.attendee_count ?? 0), 0);
	return Number(individualCount ?? 0) + bulkAttendees;
}

export default async function Page() {
	const attendeesCount = await getAttendeesCount();
	const availableSlots = Math.max(TOTAL_SLOTS - attendeesCount, 0);

	return (
		<main className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(207,103,54,0.4),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(255,207,122,0.22),transparent_32%),linear-gradient(130deg,#331a1c_0%,#5c2f2d_28%,#1f2942_72%,#142032_100%)] px-3 py-3 sm:px-4 sm:py-4">
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
				className="relative z-10 mx-auto grid h-full w-full max-w-[1360px] animate-[fade-up_700ms_ease-out] content-center place-items-center gap-4 lg:grid-cols-[minmax(0,716px)_minmax(0,620px)] lg:gap-0"
				aria-label="Event registration landing page"
			>
				<article className="aspect-square w-full max-w-[min(716px,calc(100vh-2rem))] overflow-hidden rounded-3xl border border-amber-100/35 shadow-[0_18px_45px_rgba(3,8,20,0.45)] lg:max-w-none lg:rounded-r-none">
					<img
						src={bannerImage}
						alt="Empowered With Purpose event banner"
						className="block h-full w-full object-contain"
					/>
				</article>

				<article className="h-[min(716px,calc(100vh-2rem))] w-full max-w-[620px] overflow-y-auto rounded-3xl border border-amber-100/20 bg-[linear-gradient(170deg,rgba(48,23,24,0.86),rgba(20,31,56,0.88))] shadow-[0_16px_40px_rgba(5,13,26,0.45)] lg:rounded-l-none">
					<div className="flex h-full flex-col gap-3 p-5 text-amber-50 sm:gap-3.5 sm:p-6">
						<div className="flex justify-center">
							<img
								src={churchLogo}
								alt="Joyful Sound Church logo"
								className="max-h-[70px] max-w-[70px] object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)] sm:max-h-[80px] sm:max-w-[80px]"
							/>
						</div>
						<p className="m-0 text-center text-[0.8rem] font-bold uppercase tracking-[0.08em] text-amber-300 sm:text-[0.86rem]">
							Joyful Sound Church - International
						</p>
						<h1 className="m-0 text-[clamp(1.25rem,1.9vw,1.7rem)] font-bold leading-tight tracking-[0.02em] text-amber-100">
							REGISTRATION FORM: LEYTE CHRISTIAN LEADERSHIP CONFERENCE 2026
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
										href="https://mail.google.com/mail/?view=cm&fs=1&to=gambepsalm50@gmail.com&su=Leyte%20Christian%20Leadership%20Conference%202026%20Inquiry"
										target="_blank"
										rel="noreferrer"
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
							<details className="register-toggle">
								<summary className="cursor-pointer list-none rounded-xl bg-[linear-gradient(110deg,#f2be73,#d58147)] px-4 py-2.5 text-center text-[0.95rem] font-extrabold tracking-[0.04em] text-rose-950 shadow-[0_10px_18px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(0,0,0,0.3)]">
									Register Now
								</summary>
								<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
									<a
										href="/register/individual"
										className="rounded-lg border border-amber-100/70 bg-amber-100 px-3 py-2.5 text-center text-[0.95rem] font-bold text-rose-950 transition hover:-translate-y-0.5 hover:bg-amber-50"
									>
										Individual Registration
									</a>
									<a
										href="/register/bulk"
										className="rounded-lg border border-indigo-200/60 bg-indigo-900/85 px-3 py-2.5 text-center text-[0.95rem] font-bold text-amber-50 transition hover:-translate-y-0.5 hover:bg-indigo-800"
									>
										Bulk Registration
									</a>
								</div>
							</details>
							<LiveSlotsIndicator initialAvailableSlots={availableSlots} totalSlots={TOTAL_SLOTS} />
						</div>
					</div>
				</article>
			</section>
		</main>
	);
}
