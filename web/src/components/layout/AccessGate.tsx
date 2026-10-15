import { ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "../../context/AppContext";
import { navItems, roleLabels } from "../../lib/roles";
import { ButtonLink, Card, EmptyState } from "../ui";

export function AccessGate({ path, children }: { path: string; children: ReactNode }) {
  const { role } = useApp();
  const item = navItems.find((n) => n.path === path);
  if (!item || item.roles.includes(role)) return <>{children}</>;
  return (
    <Card className="mx-auto max-w-xl">
      <EmptyState icon={ShieldOff} title={`${item.label} isn't available to the ${roleLabels[role]} role`}>This page is hidden from your navigation. The API also refuses changes from roles without permission (demo roles only — real enforcement is Phase 4).</EmptyState>
      <div className="mt-4 flex justify-center"><ButtonLink to="/">Back to Overview</ButtonLink></div>
    </Card>
  );
}
