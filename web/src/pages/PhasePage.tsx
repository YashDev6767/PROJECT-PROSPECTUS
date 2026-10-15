import { Hammer, ShieldOff } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Badge, ButtonLink, Card, EmptyState } from "../components/ui";
import { navItems, roleLabels } from "../lib/roles";

/** Honest placeholder for sections that ship in a later phase. */
export function PhasePage() {
  const { pathname } = useLocation();
  const { role } = useApp();
  const item = navItems.find((n) => n.path === pathname);
  if (!item || item.phase === undefined) return <Navigate to="/" replace />;

  if (!item.roles.includes(role)) {
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState icon={ShieldOff} title={`${item.label} isn't available to the ${roleLabels[role]} role`}>
          This page is hidden from your navigation. Server-side role enforcement arrives in Phase 4.
        </EmptyState>
        <div className="mt-4 flex justify-center"><ButtonLink to="/">Back to Overview</ButtonLink></div>
      </Card>
    );
  }

  const Icon = item.icon;
  return (
    <div className="stagger mx-auto max-w-xl space-y-8">
      <h1 className="flex items-center gap-3 text-xl font-semibold tracking-tight text-fg"><Icon className="size-6 text-accent-text" aria-hidden /> {item.label}</h1>
      <Card>
        <div className="mb-3 flex items-center gap-2"><Badge tone="warn">Not available yet</Badge><Badge>Planned for Phase {item.phase}</Badge></div>
        <EmptyState icon={Hammer} title={`${item.label} isn't built yet`}>{item.summary}</EmptyState>
        <div className="mt-4 flex justify-center"><ButtonLink to="/">Back to Overview</ButtonLink></div>
      </Card>
    </div>
  );
}
