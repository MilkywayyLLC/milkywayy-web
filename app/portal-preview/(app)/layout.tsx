import { Shell } from "@/components/portal-mock/Shell";

export default function PortalApp({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
