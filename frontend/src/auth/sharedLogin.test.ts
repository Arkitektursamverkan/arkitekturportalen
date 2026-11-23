import { beforeEach, describe, expect, it } from "vitest";
import { clearSignedOut, markAutoLogin, markSignedOut, mayAutoLogin } from "./sharedLogin";

describe("gemensam inloggning – spärrarna", () => {
  beforeEach(() => sessionStorage.clear());

  it("ett automatiskt försök högst en gång per minut", () => {
    expect(mayAutoLogin(1_000_000)).toBe(true);
    markAutoLogin(1_000_000);
    expect(mayAutoLogin(1_030_000)).toBe(false);
    expect(mayAutoLogin(1_061_000)).toBe(true);
  });

  it("den som loggat ut loggas inte in igen av sig själv – förrän hen själv loggar in", () => {
    markSignedOut();
    expect(mayAutoLogin()).toBe(false);
    clearSignedOut();
    expect(mayAutoLogin()).toBe(true);
  });
});
