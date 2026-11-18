import {expect,it} from "vitest";
import {normalizeOptionalIntake as parse} from "./optional-intake";
const revision="10000000-0000-4000-8000-000000000001";
it("preserves goal and legacy code grammar/case",()=>{
 expect(parse({goal:"compare_options",referralCode:" A-2 "})).toEqual({goal:"compare_options",referralCode:"A-2"});
 expect(parse({referralCode:" "})).toBeUndefined();
 expect(()=>parse({referralCode:"Jane Smith"})).toThrow();
});
it("represents use_saved, replace and omit as different stable commands",()=>{
 expect(parse({referralChoice:{mode:"use_saved",admissionRevision:revision}})).toEqual({referralChoice:{mode:"use_saved",admissionRevision:revision}});
 expect(parse({goal:"ask_about_process",referralChoice:{mode:"replace",referralName:" Jane  O'Neil "}}))
  .toEqual({goal:"ask_about_process",referralChoice:{mode:"replace",referralName:"Jane O'Neil"}});
 expect(parse({referralChoice:{mode:"omit"}})).toEqual({referralChoice:{mode:"omit"}});
});
it.each([{referralChoice:{mode:"use_saved"}},{referralChoice:{mode:"use_saved",admissionRevision:revision,referralName:"Sam"}},
 {referralChoice:{mode:"replace"}},{referralChoice:{mode:"omit",referralName:"Sam"}},
 {referralCode:"OLD",referralChoice:{mode:"omit"}},{goal:"invented"},{referralChoice:{mode:"assign",aeId:revision}},
 Object.create({referralChoice:{mode:"omit"}})])("rejects ambiguous or authority-bearing context %#",value=>expect(()=>parse(value)).toThrow());
it("normalizes the permitted staff-reported projection without a command",()=>expect(parse({referralName:"Jane Smith",referralCode:"CODE"})).toEqual({referralName:"Jane Smith",referralCode:"CODE"}));
