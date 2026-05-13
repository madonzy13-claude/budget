import type { Page } from "@playwright/test";

export class HomePo {
  constructor(private page: Page) {}

  async goto(locale = "en") {
    await this.page.goto(`/${locale}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  card(name: string) {
    return this.page.getByRole("link", {
      name: new RegExp(`Open ${name}|Otwórz ${name}|Відкрити ${name}`),
    });
  }

  emptyCta() {
    return this.page.getByRole("link", {
      name: /Create your first budget|Utwórz pierwszy budżet|Створити перший бюджет/,
    });
  }

  placeholderChart() {
    return this.page.getByText(
      /Insights coming soon|Wkrótce: statystyki|Скоро з'являться аналітичні графіки/,
    );
  }
}
