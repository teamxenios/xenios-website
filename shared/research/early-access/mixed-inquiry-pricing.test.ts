import { describe,expect,it } from "vitest";
import { mixedInquiryCatalogPage,mixedInquiryPriceNote } from "./quote-only";
describe("price-free customer inquiry regardless of legacy switches",()=>{
  it("keeps the original staff-facing catalog intact while removing guest/member amounts and private price revision",()=>{
    const item=Object.freeze({unitPriceCents:1250,priceVersion:"revision-1",workflowMode:"request_pricing",actionLabel:"Request pricing",minimumQuantity:2});
    const safe=mixedInquiryCatalogPage({items:[item]});
    expect(safe.items[0]).toMatchObject({unitPriceCents:null,priceVersion:null,actionLabel:"Request a quote",minimumQuantity:2});
    expect(item.unitPriceCents).toBe(1250);expect(item.priceVersion).toBe("revision-1");
    expect(mixedInquiryPriceNote(false)).toBe("Request a quote");
    expect(mixedInquiryPriceNote(true)).toBe("Final price follows applicable review.");
  });
  it("refuses an unexpected canonical money field in a nested payload rather than exposing it",()=>{
    expect(()=>mixedInquiryCatalogPage({items:[{unitPriceCents:1250,extra:{estimatedTotalCents:500}}]})).toThrow("unsupported monetary field");
  });
});
