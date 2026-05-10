import { notFound } from "next/navigation";
import CallerDashboard, { type CallerSlug } from "../components/caller-dashboard";

type CallerPageProps = {
  params: {
    caller: string;
  };
};

const callerDisplayNames: Record<CallerSlug, string> = {
  cathy: "Cathy",
  jewel: "Jewel",
  geneveve: "Geneveve",
  queenie: "Queenie",
};

function isCallerSlug(value: string): value is CallerSlug {
  return value in callerDisplayNames;
}

export default function CallerPage({ params }: CallerPageProps) {
  const slug = params.caller.toLowerCase();

  if (!isCallerSlug(slug)) {
    notFound();
  }

  return <CallerDashboard callerSlug={slug} displayName={callerDisplayNames[slug]} />;
}
