import { expect, type Page, type Locator } from "@playwright/test";

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

  budgetCard(budgetName: string): Locator {
    return this.page.getByRole("link", { name: new RegExp(budgetName) });
  }

  cardBadge(budgetName: string): Locator {
    return this.budgetCard(budgetName).getByTestId("pill-badge");
  }

  async assertCardBadge(budgetName: string, count: number): Promise<void> {
    if (count === 0) {
      await expect(this.cardBadge(budgetName)).toHaveCount(0);
    } else {
      await expect(this.cardBadge(budgetName)).toHaveText(String(count));
    }
  }
}
