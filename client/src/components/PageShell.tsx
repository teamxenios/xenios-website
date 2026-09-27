import type { ReactNode } from "react";
import PublicShell from "@/clarity/PublicShell";

export default function PageShell({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
