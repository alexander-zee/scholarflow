import ConditionalUsageBadge from "@/components/ConditionalUsageBadge";
import DashboardBodyChrome from "@/components/DashboardBodyChrome";
import SupportChatBubble from "@/components/SupportChatBubble";
import { auth } from "@/auth";
import { getOrCreateUsageLimit } from "@/lib/usage";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const usage = session?.user?.id
    ? await getOrCreateUsageLimit(session.user.id)
    : { aiReviewsUsed: 0, aiReviewsLimit: 0 };

  return (
    <DashboardBodyChrome>
      <ConditionalUsageBadge used={usage.aiReviewsUsed} limit={usage.aiReviewsLimit} />
      {children}
      <SupportChatBubble side="right" />
    </DashboardBodyChrome>
  );
}
