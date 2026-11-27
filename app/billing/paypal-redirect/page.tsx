import PayPalRedirectCheckout from "@/components/PayPalRedirectCheckout";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

export default async function PayPalRedirectCheckoutPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  return (
    <PayPalRedirectCheckout
      cancelled={params.status === "cancelled"}
    />
  );
}
