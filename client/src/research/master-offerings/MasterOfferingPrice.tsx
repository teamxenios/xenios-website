import {
  isDisplayablePrice,
  MASTER_OFFERING_PRICE_BASIS_LABEL,
  MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";

export function MasterOfferingPrice({
  price,
  testId,
}: {
  price: MasterOfferingPriceView;
  testId: string;
}) {
  if (!isDisplayablePrice(price)) {
    return (
      <span className="body-s text-ink-mute min-w-0 break-words" data-testid={testId}>
        {MASTER_OFFERING_PRICE_ON_REQUEST_LABEL}
      </span>
    );
  }

  // The server's USD display uses a dollar sign without the currency code.
  const amount = price.currency === "USD" ? price.display + " USD" : price.display;
  return (
    <span className="inline-grid min-w-0 max-w-full gap-0.5 rounded-lg border border-[#cbdaf2] bg-[#f2edff] px-2.5 py-1.5 text-[#24164b]">
      <span className="tabular font-700 break-words" data-testid={testId}>
        {amount}
      </span>
      <span className="body-s break-words" data-testid={testId + "-basis"}>
        {MASTER_OFFERING_PRICE_BASIS_LABEL}
      </span>
    </span>
  );
}
