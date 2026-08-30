/**
 * pools.ts — the words the demo is made of.
 *
 * Two properties matter here, and both were user-reported gaps:
 *
 * 1. COHERENCE. A transaction in "Groceries" must not read "Airline Booking".
 *    Merchants are therefore indexed BY CATEGORY: `merchantsByCategory[i]`
 *    belongs to `category[i]`. Incomes and scheduled payments get their own
 *    vocabularies rather than borrowing the merchant list, because "Streamly"
 *    is not a plausible salary.
 *
 * 2. LOCALE. The demo exists in three languages, and a Polish visitor seeing
 *    English category names is a broken demo, not a translated one. Each locale
 *    carries a full set; the arrays are INDEX-ALIGNED across locales so the same
 *    row maps to the same concept in every language.
 *
 * The category list is deliberately longer than any real budget's category
 * count (the owner's is 19). When the pool is shorter than the data, names wrap
 * and pick up a lap suffix — which is what produced the reported "Dining out 2".
 */

export type DemoLocale = "en" | "pl" | "uk";

export type PoolName =
  | "category"
  | "merchant"
  | "income"
  | "scheduled"
  | "wallet"
  | "holding"
  | "budget";

type LocalePools = {
  category: string[];
  /** Index-aligned with `category`. */
  merchantsByCategory: string[][];
  income: string[];
  scheduled: string[];
  wallet: string[];
  holding: string[];
  budget: string[];
};

const EN: LocalePools = {
  category: [
    "Groceries",
    "Transport",
    "Utilities",
    "Dining Out",
    "Health",
    "Household",
    "Subscriptions",
    "Travel",
    "Education",
    "Gifts",
    "Clothing",
    "Pets",
    "Home Repair",
    "Entertainment",
    "Savings",
    "Childcare",
    "Insurance",
    "Fitness",
    "Beauty",
    "Books",
    "Electronics",
    "Garden",
    "Charity",
    "Taxes",
    "Fuel",
    "Parking",
    "Phone",
    "Internet",
  ],
  merchantsByCategory: [
    ["City Market", "Corner Grocer", "Fresh Foods", "Weekly shop"],
    ["Metro card", "Bus ticket", "Tram pass", "Taxi ride"],
    ["Electricity bill", "Water bill", "Gas bill", "Heating"],
    ["Family Diner", "The Coffee Bar", "Pizza night", "Lunch out"],
    ["Pharmacy", "Dentist visit", "Doctor appointment", "Prescription"],
    ["Cleaning supplies", "Kitchen basics", "Laundry detergent"],
    ["Streaming plan", "Music plan", "Cloud storage", "News subscription"],
    ["Flight booking", "Hotel stay", "Train tickets", "Car rental"],
    ["Course fee", "Textbooks", "Online class", "Tuition"],
    ["Birthday gift", "Anniversary gift", "Holiday present"],
    ["Winter jacket", "Running shoes", "T-shirts", "Jeans"],
    ["Pet food", "Vet visit", "Grooming"],
    ["Hardware store", "Plumber", "Paint and brushes", "Electrician"],
    ["Cinema tickets", "Concert", "Board game", "Museum"],
    ["Monthly transfer", "Emergency top-up"],
    ["Nursery fee", "Babysitter", "School lunch"],
    ["Car insurance", "Home insurance", "Health cover"],
    ["Gym membership", "Yoga class", "Sports gear"],
    ["Haircut", "Cosmetics", "Spa visit"],
    ["Bookshop", "E-book", "Magazine"],
    ["Phone case", "Headphones", "Laptop charger"],
    ["Garden centre", "Seeds and soil", "Lawn care"],
    ["Monthly donation", "Fundraiser"],
    ["Income tax", "Property tax"],
    ["Petrol fill-up", "Fuel stop", "Diesel"],
    ["Parking garage", "Street parking", "Monthly permit"],
    ["Mobile plan", "Top-up"],
    ["Home internet", "Router rental"],
  ],
  income: [
    "Salary",
    "Freelance project",
    "Bonus",
    "Dividends",
    "Rental income",
    "Refund",
    "Side project",
    "Interest",
  ],
  scheduled: [
    "Rent",
    "Mortgage payment",
    "Electricity bill",
    "Internet bill",
    "Mobile plan",
    "Gym membership",
    "Insurance premium",
    "Streaming subscription",
    "Water bill",
    "Nursery fee",
    "Car loan",
    "Cloud storage",
  ],
  wallet: [
    "Main Account",
    "Joint Account",
    "Cash",
    "Credit Card",
    "Travel Card",
    "Savings Pot",
    "Reserve Pot",
    "Second Account",
    "Brokerage",
    "Emergency Fund",
    "Household Pot",
    "Holiday Fund",
  ],
  holding: [
    "Global Equity Fund",
    "Tech Growth ETF",
    "Government Bond",
    "Gold Holding",
    "Digital Asset",
    "Dividend Fund",
    "Property Share",
    "Index Tracker",
    "Corporate Bond",
  ],
  budget: ["Personal", "Family"],
};

const PL: LocalePools = {
  category: [
    "Zakupy spożywcze",
    "Transport",
    "Media",
    "Restauracje",
    "Zdrowie",
    "Dom",
    "Subskrypcje",
    "Podróże",
    "Edukacja",
    "Prezenty",
    "Odzież",
    "Zwierzęta",
    "Remont",
    "Rozrywka",
    "Oszczędności",
    "Opieka nad dziećmi",
    "Ubezpieczenia",
    "Sport",
    "Uroda",
    "Książki",
    "Elektronika",
    "Ogród",
    "Darowizny",
    "Podatki",
    "Paliwo",
    "Parking",
    "Telefon",
    "Internet",
  ],
  merchantsByCategory: [
    [
      "Market miejski",
      "Sklep osiedlowy",
      "Świeże produkty",
      "Zakupy tygodniowe",
    ],
    [
      "Bilet metra",
      "Bilet autobusowy",
      "Karta tramwajowa",
      "Przejazd taksówką",
    ],
    ["Rachunek za prąd", "Rachunek za wodę", "Rachunek za gaz", "Ogrzewanie"],
    ["Obiad na mieście", "Kawiarnia", "Wieczór z pizzą", "Lunch"],
    ["Apteka", "Wizyta u dentysty", "Wizyta u lekarza", "Recepta"],
    ["Środki czystości", "Wyposażenie kuchni", "Proszek do prania"],
    ["Plan streamingowy", "Plan muzyczny", "Chmura", "Prenumerata prasy"],
    ["Bilet lotniczy", "Nocleg w hotelu", "Bilety kolejowe", "Wynajem auta"],
    ["Opłata za kurs", "Podręczniki", "Kurs online", "Czesne"],
    ["Prezent urodzinowy", "Prezent rocznicowy", "Prezent świąteczny"],
    ["Kurtka zimowa", "Buty do biegania", "Koszulki", "Jeansy"],
    ["Karma dla zwierząt", "Wizyta u weterynarza", "Strzyżenie psa"],
    ["Sklep budowlany", "Hydraulik", "Farby i pędzle", "Elektryk"],
    ["Bilety do kina", "Koncert", "Gra planszowa", "Muzeum"],
    ["Przelew miesięczny", "Dopłata awaryjna"],
    ["Opłata za żłobek", "Opiekunka", "Obiady szkolne"],
    ["Ubezpieczenie auta", "Ubezpieczenie domu", "Ubezpieczenie zdrowotne"],
    ["Karnet na siłownię", "Zajęcia jogi", "Sprzęt sportowy"],
    ["Fryzjer", "Kosmetyki", "Wizyta w spa"],
    ["Księgarnia", "E-book", "Czasopismo"],
    ["Etui na telefon", "Słuchawki", "Ładowarka do laptopa"],
    ["Centrum ogrodnicze", "Nasiona i ziemia", "Pielęgnacja trawnika"],
    ["Darowizna miesięczna", "Zbiórka"],
    ["Podatek dochodowy", "Podatek od nieruchomości"],
    ["Tankowanie", "Stacja paliw", "Diesel"],
    ["Parking podziemny", "Parking uliczny", "Abonament parkingowy"],
    ["Abonament komórkowy", "Doładowanie"],
    ["Internet domowy", "Wynajem routera"],
  ],
  income: [
    "Wynagrodzenie",
    "Zlecenie freelance",
    "Premia",
    "Dywidendy",
    "Przychód z najmu",
    "Zwrot",
    "Projekt dodatkowy",
    "Odsetki",
  ],
  scheduled: [
    "Czynsz",
    "Rata kredytu",
    "Rachunek za prąd",
    "Rachunek za internet",
    "Abonament komórkowy",
    "Karnet na siłownię",
    "Składka ubezpieczeniowa",
    "Subskrypcja streamingowa",
    "Rachunek za wodę",
    "Opłata za żłobek",
    "Kredyt samochodowy",
    "Chmura",
  ],
  wallet: [
    "Konto główne",
    "Konto wspólne",
    "Gotówka",
    "Karta kredytowa",
    "Karta podróżna",
    "Skarbonka",
    "Rezerwa",
    "Drugie konto",
    "Rachunek maklerski",
    "Fundusz awaryjny",
    "Budżet domowy",
    "Fundusz wakacyjny",
  ],
  holding: [
    "Globalny fundusz akcji",
    "ETF technologiczny",
    "Obligacje skarbowe",
    "Złoto",
    "Aktywa cyfrowe",
    "Fundusz dywidendowy",
    "Udział w nieruchomości",
    "Fundusz indeksowy",
    "Obligacje korporacyjne",
  ],
  budget: ["Osobisty", "Rodzinny"],
};

const UK: LocalePools = {
  category: [
    "Продукти",
    "Транспорт",
    "Комунальні",
    "Ресторани",
    "Здоров'я",
    "Дім",
    "Підписки",
    "Подорожі",
    "Освіта",
    "Подарунки",
    "Одяг",
    "Тварини",
    "Ремонт",
    "Розваги",
    "Заощадження",
    "Догляд за дітьми",
    "Страхування",
    "Спорт",
    "Краса",
    "Книги",
    "Електроніка",
    "Сад",
    "Благодійність",
    "Податки",
    "Пальне",
    "Парковка",
    "Телефон",
    "Інтернет",
  ],
  merchantsByCategory: [
    ["Міський ринок", "Магазин біля дому", "Свіжі продукти", "Тижневі покупки"],
    [
      "Квиток на метро",
      "Квиток на автобус",
      "Проїзний на трамвай",
      "Поїздка таксі",
    ],
    ["Рахунок за електрику", "Рахунок за воду", "Рахунок за газ", "Опалення"],
    ["Обід у місті", "Кав'ярня", "Вечір з піцою", "Ланч"],
    ["Аптека", "Візит до стоматолога", "Візит до лікаря", "Рецепт"],
    ["Засоби для прибирання", "Кухонне приладдя", "Пральний порошок"],
    ["Стримінг", "Музичний план", "Хмарне сховище", "Передплата новин"],
    ["Авіаквиток", "Готель", "Залізничні квитки", "Оренда авто"],
    ["Оплата курсу", "Підручники", "Онлайн-курс", "Навчання"],
    [
      "Подарунок на день народження",
      "Подарунок на річницю",
      "Святковий подарунок",
    ],
    ["Зимова куртка", "Кросівки", "Футболки", "Джинси"],
    ["Корм для тварин", "Візит до ветеринара", "Грумінг"],
    ["Будівельний магазин", "Сантехнік", "Фарби та пензлі", "Електрик"],
    ["Квитки в кіно", "Концерт", "Настільна гра", "Музей"],
    ["Щомісячний переказ", "Аварійне поповнення"],
    ["Оплата садочка", "Няня", "Шкільні обіди"],
    ["Страхування авто", "Страхування житла", "Медичне страхування"],
    ["Абонемент у спортзал", "Заняття йогою", "Спортивний інвентар"],
    ["Перукарня", "Косметика", "Спа"],
    ["Книгарня", "Електронна книга", "Журнал"],
    ["Чохол для телефона", "Навушники", "Зарядний пристрій"],
    ["Садовий центр", "Насіння та ґрунт", "Догляд за газоном"],
    ["Щомісячна пожертва", "Збір коштів"],
    ["Податок на доходи", "Податок на нерухомість"],
    ["Заправка", "Заправна станція", "Дизель"],
    ["Підземний паркінг", "Вулична парковка", "Місячний абонемент"],
    ["Мобільний тариф", "Поповнення"],
    ["Домашній інтернет", "Оренда роутера"],
  ],
  income: [
    "Зарплата",
    "Фриланс-проєкт",
    "Премія",
    "Дивіденди",
    "Дохід від оренди",
    "Повернення",
    "Додатковий проєкт",
    "Відсотки",
  ],
  scheduled: [
    "Оренда",
    "Платіж за іпотекою",
    "Рахунок за електрику",
    "Рахунок за інтернет",
    "Мобільний тариф",
    "Абонемент у спортзал",
    "Страховий внесок",
    "Підписка на стримінг",
    "Рахунок за воду",
    "Оплата садочка",
    "Автокредит",
    "Хмарне сховище",
  ],
  wallet: [
    "Основний рахунок",
    "Спільний рахунок",
    "Готівка",
    "Кредитна картка",
    "Картка для подорожей",
    "Скарбничка",
    "Резерв",
    "Другий рахунок",
    "Брокерський рахунок",
    "Резервний фонд",
    "Домашній бюджет",
    "Фонд відпустки",
  ],
  holding: [
    "Глобальний фонд акцій",
    "Технологічний ETF",
    "Державні облігації",
    "Золото",
    "Цифрові активи",
    "Дивідендний фонд",
    "Частка в нерухомості",
    "Індексний фонд",
    "Корпоративні облігації",
  ],
  budget: ["Особистий", "Сімейний"],
};

const BY_LOCALE: Record<DemoLocale, LocalePools> = { en: EN, pl: PL, uk: UK };

export function demoLocales(): DemoLocale[] {
  return ["en", "pl", "uk"];
}

export function isDemoLocale(v: string): v is DemoLocale {
  return v === "en" || v === "pl" || v === "uk";
}

/** Flat pools. `merchant` flattens every category's list, for non-category rows. */
export function poolValues(locale: DemoLocale, pool: PoolName): string[] {
  const p = BY_LOCALE[locale];
  if (pool === "merchant") return p.merchantsByCategory.flat();
  return p[pool];
}

/** Merchants belonging to the category at `index` (wrapping). */
export function merchantsForCategory(
  locale: DemoLocale,
  index: number,
): string[] {
  const lists = BY_LOCALE[locale].merchantsByCategory;
  return lists[Math.abs(index) % lists.length]!;
}

export function categoryCount(locale: DemoLocale): number {
  return BY_LOCALE[locale].category.length;
}
