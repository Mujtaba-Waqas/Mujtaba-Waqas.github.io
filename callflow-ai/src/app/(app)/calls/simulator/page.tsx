import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { SCENARIOS } from "@/lib/simulator/scenarios";
import { Simulator } from "./simulator";

export const metadata = { title: "Call simulator" };

export default async function SimulatorPage() {
  await requireAuth("calls:simulate");
  return (
    <>
      <PageHeader
        eyebrow="Calls"
        title="Call simulator"
        description="Play the caller and watch the AI receptionist work: it collects details, triages urgency, checks the service area and real calendar availability, books the job, and sends an SMS confirmation. Everything it creates is saved to your workspace — no real call or text is placed."
      />
      <Simulator scenarios={SCENARIOS} />
    </>
  );
}
