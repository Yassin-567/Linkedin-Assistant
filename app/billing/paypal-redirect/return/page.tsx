import PayPalRedirectReturn from "@/components/PayPalRedirectReturn";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    subscription_id?: string | string[];
    subscriptionId?: string | string[];
  }>;
};

export default async function PayPalRedirectReturnPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const rawId = params.subscription_id ?? params.subscriptionId ?? "";
  const subscriptionId = Array.isArray(rawId) ? rawId[0] || "" : rawId;

  return <PayPalRedirectReturn subscriptionId={subscriptionId} />;
}
