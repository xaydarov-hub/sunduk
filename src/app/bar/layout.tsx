import { DashboardShell } from '@/components/shared/DashboardShell';
export default function BarLayout({ children }: { children: React.ReactNode }) { return <DashboardShell role="bar">{children}</DashboardShell>; }
