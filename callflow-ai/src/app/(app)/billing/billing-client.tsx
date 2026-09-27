"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { checkoutAction, portalAction } from "@/app/(app)/settings-actions";
import { Button } from "@/components/ui/button";

export function CheckoutButton({ plan, current, highlight, demo }: { plan: "STARTER" | "GROWTH" | "PRO"; current: boolean; highlight: boolean; demo: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (current) return <Button variant="secondary" disabled>Current plan</Button>;
  return (
    <Button
      variant={highlight ? "accent" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await checkoutAction({ plan });
          if (!r.ok) return void toast.error(r.error);
          if (r.data!.simulated) {
            toast.success("Plan switched (demo billing — no charge)");
            router.refresh();
          } else window.location.href = r.data!.url;
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null} {demo ? "Switch plan (demo)" : "Choose plan"}
    </Button>
  );
}

export function PortalButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await portalAction({});
          if (!r.ok) return void toast.error(r.error);
          if (r.data!.simulated) toast.info("Customer portal is available once Stripe is configured (demo billing).");
          else window.location.href = r.data!.url;
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />} Manage payment & invoices
    </Button>
  );
}
