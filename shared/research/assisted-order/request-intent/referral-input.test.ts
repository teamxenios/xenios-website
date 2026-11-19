import {describe,expect,it} from "vitest";
import {normalizeDeclaredReferralInput as parse} from "./referral-input";
describe("unverified reported referral facts",()=>{
 it.each([undefined,{}, {referralName:"  ",referralCode:" "}])("permits an empty optional answer %#",value=>expect(parse(value)).toBeUndefined());
 it("keeps Unicode names, spaces and punctuation distinct from codes",()=>{
  expect(parse({referralName:"  E\u0301lodie  O’Neill-Smith ",referralCode:" A-2 "})).toEqual({referralName:"Élodie O’Neill-Smith",referralCode:"A-2"});
  expect(parse({referralName:"李 明"})).toEqual({referralName:"李 明"});
  expect(parse({referralName:"a".repeat(80)})).toBeDefined();
 });
 it.each([null,[],"Seth",{referralName:7},{referralName:"a".repeat(81)},{referralName:"A\nB"},
  {referralName:"A\u202eB"},{referralName:"\ud800"},{referralCode:"Jane Smith"},{referralCode:"a"},
  {referralCode:"x".repeat(25)},{referralName:"Unknown Person",aeId:"arbitrary"},Object.create({referralName:"inherited"})])("rejects malformed/overlong/authority input %#",value=>expect(()=>parse(value)).toThrow());
 it("does not invoke accessors or inherited polluted getters",()=>{
  const value=Object.defineProperty({},"referralName",{enumerable:true,get(){throw Error("must not execute");}});
  expect(()=>parse(value)).toThrow("Check the optional");
 });
 it("does not resolve unknown or ambiguous names to identities",()=>{
  expect(parse({referralName:"Unknown Person"})).toEqual({referralName:"Unknown Person"});
  expect(parse({referralName:"Sam"})).toEqual({referralName:"Sam"});
  expect(Object.keys(parse({referralName:"Sam"})!)).toEqual(["referralName"]);
 });
});
