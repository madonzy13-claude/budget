import { describe, test, expect } from "bun:test";
import { renderEmail } from "../src/email/templates";

describe("Email Templates", () => {
  describe("verify-email", () => {
    test("renders English by default", () => {
      const url = "http://x/auth/verify-email?token=abc";
      const out = renderEmail("verify-email", { url });
      expect(out.subject).toBe("Verify your email — Budget");
      expect(out.html).toContain("Verify your email");
      expect(out.text).toContain("Verify your email");
      expect(out.text).toContain(url);
    });

    test("escapes HTML-unsafe characters in url", () => {
      const url = 'http://x/?q="><script>alert(1)</script>';
      const out = renderEmail("verify-email", { url }, "en");
      expect(out.html).not.toContain("<script>");
      expect(out.html).toContain("&lt;script&gt;");
    });

    test("renders Polish for locale=pl", () => {
      const out = renderEmail("verify-email", { url: "http://x" }, "pl");
      expect(out.subject).toBe("Potwierdź swój adres e-mail — Budget");
      expect(out.text).toContain("Potwierdź swój adres e-mail");
      expect(out.text).toContain("aktywować konto Budget");
    });

    test("renders Ukrainian for locale=uk", () => {
      const out = renderEmail("verify-email", { url: "http://x" }, "uk");
      expect(out.subject).toBe("Підтвердьте електронну адресу — Budget");
      expect(out.text).toContain("Підтвердьте електронну адресу");
      expect(out.text).toContain("активувати ваш обліковий запис");
    });

    test("falls back to English for unknown locale", () => {
      const out = renderEmail("verify-email", { url: "http://x" }, "fr");
      expect(out.subject).toBe("Verify your email — Budget");
    });
  });

  describe("reset-password", () => {
    test("renders English subject and url", () => {
      const url = "http://x/reset?token=xyz";
      const out = renderEmail("reset-password", { url });
      expect(out.subject).toBe("Reset your password — Budget");
      expect(out.html).toContain(url);
      expect(out.text).toContain(url);
    });

    test("renders Polish reset email", () => {
      const out = renderEmail("reset-password", { url: "http://x" }, "pl");
      expect(out.subject).toBe("Zresetuj hasło — Budget");
    });

    test("renders Ukrainian reset email", () => {
      const out = renderEmail("reset-password", { url: "http://x" }, "uk");
      expect(out.subject).toBe("Скидання пароля — Budget");
    });
  });

  describe("change-email", () => {
    test("renders English with the confirm url and the new address", () => {
      const url = "http://x/auth/verify-email?token=ce";
      const out = renderEmail(
        "change-email",
        { url, newEmail: "new@example.com" },
        "en",
      );
      expect(out.subject).toContain("Budget");
      expect(out.html).toContain(url);
      expect(out.text).toContain(url);
      expect(out.text).toContain("new@example.com");
      expect(out.html).toContain("new@example.com");
    });

    test("renders Polish with the new address", () => {
      const out = renderEmail(
        "change-email",
        { url: "http://x", newEmail: "new@example.com" },
        "pl",
      );
      expect(out.subject).toContain("Budget");
      expect(out.text).toContain("new@example.com");
    });

    test("renders Ukrainian with the new address", () => {
      const out = renderEmail(
        "change-email",
        { url: "http://x", newEmail: "new@example.com" },
        "uk",
      );
      expect(out.subject).toContain("Budget");
      expect(out.text).toContain("new@example.com");
    });

    test("escapes an HTML-unsafe new email", () => {
      const out = renderEmail(
        "change-email",
        { url: "http://x", newEmail: "<script>@x.com" },
        "en",
      );
      expect(out.html).not.toContain("<script>");
    });
  });

  describe("delete-account", () => {
    test("renders English with the confirm url", () => {
      const url = "http://x/auth/delete-user/callback?token=da";
      const out = renderEmail("delete-account", { url }, "en");
      expect(out.subject).toContain("Budget");
      expect(out.html).toContain(url);
      expect(out.text).toContain(url);
    });

    test("renders Polish + Ukrainian", () => {
      for (const loc of ["pl", "uk"] as const) {
        const out = renderEmail("delete-account", { url: "http://x" }, loc);
        expect(out.subject).toContain("Budget");
        expect(out.text).toContain("http://x");
      }
    });

    test("escapes an HTML-unsafe url", () => {
      const out = renderEmail(
        "delete-account",
        { url: 'http://x/?q="><script>alert(1)</script>' },
        "en",
      );
      expect(out.html).not.toContain("<script>");
    });
  });

  test("throws on unknown template name", () => {
    expect(() => renderEmail("unknown", {})).toThrow(/Unknown email template/);
  });
});
