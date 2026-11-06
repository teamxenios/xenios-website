import { productGuidance, type ProductGuidanceInput } from "./product-guidance-model";
import "./early-access-guidance.css";

/** Never controls a button, filter, selection, price, or legal acknowledgment. */
export function ProductPathwayNotice({ item, detailed = false }: Readonly<{ item: ProductGuidanceInput; detailed?: boolean }>) {
  const guidance = productGuidance(item);
  return <div className="ea-pathway" data-category={guidance.category} data-testid="product-pathway-notice">
    <p className="ea-pathway__label">{guidance.label}</p>
    {detailed && <p>{guidance.explanation}</p>}
    {guidance.limits.map((limit) => <p className="ea-pathway__limit" key={limit}>{limit}</p>)}
  </div>;
}
