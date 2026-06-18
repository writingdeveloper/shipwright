import { TRPCReactProvider } from "@repo/api/client";

/**
 * Dashboard layout: provides the tRPC + React Query client to the dashboard
 * subtree only (other routes don't need it). Auth is still verified inside the
 * page and every Server Action / procedure.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
