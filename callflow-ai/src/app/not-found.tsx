import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 className="mt-1 text-xl font-semibold text-ink">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-sm text-muted">It may have been removed, or it belongs to a different organization.</p>
      <Button asChild className="mt-4">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
