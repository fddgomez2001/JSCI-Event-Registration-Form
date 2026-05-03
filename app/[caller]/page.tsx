import { notFound } from "next/navigation";
import CallerDashboard from "../components/caller-dashboard";

const callerMap = {
  cathy: "Cathy",
  jewel: "Jewel",
  geneveve: "Geneveve",
} as const;

type CallerSlug = keyof typeof callerMap;

type CallerPageProps = {
  params: {
    caller: string;
  };
};

export default function CallerPage({ params }: CallerPageProps) {
  const caller = params.caller.toLowerCase() as CallerSlug;
  const displayName = callerMap[caller];

  if (!displayName) {
    notFound();
  }

  return <CallerDashboard callerSlug={caller} displayName={displayName} />;
}