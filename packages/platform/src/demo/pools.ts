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
  | "budget"
  | "walletSPENDINGS"
  | "walletCUSHION"
  | "walletRESERVE"
  | "walletPOSSESSION"
  | "walletOTHER"
  | "reserveIn"
  | "reserveOut";

type LocalePools = {
  category: string[];
  /** Index-aligned with `category`. */
  merchantsByCategory: string[][];
  income: string[];
  scheduled: string[];
  wallet: string[];
  holding: string[];
  budget: string[];
  // 261113 (user): a name has to fit what the row IS — a cushion wallet named
  // "Credit Card" or BTC named "Property Share 2" read as noise.
  walletSPENDINGS: string[];
  walletCUSHION: string[];
  walletRESERVE: string[];
  walletPOSSESSION: string[];
  walletOTHER: string[];
  /** Reserve moves, by direction — never a shop item. */
  reserveIn: string[];
  reserveOut: string[];
  /** Where a crypto position is held: "BTC – Exchange". */
  places: string[];
  coins: string[];
  brokers: string[];
  /** Followed by the account's currency: "Savings USD". */
  cashAccounts: string[];
  bonds: string[];
  stablecoin: string;
  groupMetals: string[];
  groupDefault: string[];
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
    "Housing",
    "Car",
    "Celebrations",
    "Other",
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
    ["Rent", "Mortgage payment", "Building fees", "Service charge"],
    ["Petrol fill-up", "Car service", "Car wash", "Tyres"],
    ["Birthday party", "Holiday dinner", "Party supplies", "Wedding gift"],
    ["Online order", "Market stall", "Miscellaneous"],
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
  walletSPENDINGS: [
    "Main Account",
    "Debit Card",
    "Cash",
    "Credit Card",
    "Second Account",
    "Joint Account",
  ],
  walletCUSHION: [
    "Emergency Fund",
    "Savings Account",
    "Rainy Day Fund",
    "Deposit Account",
  ],
  walletRESERVE: ["Reserve Pot", "Reserve Account"],
  walletPOSSESSION: [
    "Apartment",
    "Car",
    "Land Plot",
    "Garage",
    "Summer House",
    "Jewellery",
  ],
  walletOTHER: ["Holiday Fund", "Kids Fund", "Gift Fund"],
  reserveIn: ["Monthly top-up", "Top-up", "Moved from savings"],
  reserveOut: ["Covered overspend", "Used for a purchase", "Rebalanced"],
  places: ["Exchange", "Hardware wallet", "Mobile wallet", "Savings app"],
  coins: [
    "Krugerrand 1 oz",
    "Maple Leaf 1 oz",
    "Britannia 1 oz",
    "Philharmonic 1 oz",
    "Kangaroo 1 oz",
    "Gold bar 1 oz",
  ],
  brokers: [
    "Brokerage Account",
    "Retirement Account",
    "Pension Account",
    "Investment Account",
  ],
  cashAccounts: ["Savings", "Currency Account", "Deposit", "Cash Reserve"],
  bonds: ["Treasury Bonds", "Savings Bonds", "Inflation-linked Bonds"],
  stablecoin: "Stablecoin",
  groupMetals: ["Gold Coins", "Bullion"],
  groupDefault: ["Portfolio", "Long Term"],
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
    "Mieszkanie",
    "Samochód",
    "Uroczystości",
    "Inne",
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
    ["Czynsz", "Rata kredytu", "Opłaty wspólnoty", "Fundusz remontowy"],
    ["Tankowanie", "Serwis auta", "Myjnia", "Opony"],
    [
      "Przyjęcie urodzinowe",
      "Kolacja świąteczna",
      "Artykuły imprezowe",
      "Prezent ślubny",
    ],
    ["Zamówienie online", "Targ", "Różne"],
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
  walletSPENDINGS: [
    "Konto główne",
    "Karta debetowa",
    "Gotówka",
    "Karta kredytowa",
    "Drugie konto",
    "Konto wspólne",
  ],
  walletCUSHION: [
    "Fundusz awaryjny",
    "Konto oszczędnościowe",
    "Poduszka finansowa",
    "Lokata",
  ],
  walletRESERVE: ["Rezerwa", "Konto rezerwowe"],
  walletPOSSESSION: [
    "Mieszkanie",
    "Samochód",
    "Działka",
    "Garaż",
    "Domek letniskowy",
    "Biżuteria",
  ],
  walletOTHER: [
    "Fundusz wakacyjny",
    "Fundusz dla dzieci",
    "Fundusz prezentowy",
  ],
  reserveIn: ["Miesięczne zasilenie", "Zasilenie", "Przelew z oszczędności"],
  reserveOut: [
    "Pokrycie przekroczenia",
    "Wykorzystane na zakup",
    "Przesunięcie",
  ],
  places: ["Giełda", "Portfel sprzętowy", "Portfel mobilny", "Aplikacja"],
  coins: [
    "Krugerrand 1 oz",
    "Liść klonu 1 oz",
    "Britannia 1 oz",
    "Wiedeńscy Filharmonicy 1 oz",
    "Kangur 1 oz",
    "Sztabka złota 1 oz",
  ],
  brokers: ["Rachunek maklerski", "IKE", "IKZE", "Konto inwestycyjne"],
  cashAccounts: [
    "Oszczędności",
    "Konto walutowe",
    "Lokata",
    "Rezerwa gotówkowa",
  ],
  bonds: [
    "Obligacje skarbowe",
    "Obligacje oszczędnościowe",
    "Obligacje indeksowane",
  ],
  stablecoin: "Stablecoin",
  groupMetals: ["Złote monety", "Sztabki"],
  groupDefault: ["Portfel", "Długoterminowe"],
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
    "Житло",
    "Автомобіль",
    "Свята",
    "Інше",
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
    ["Оренда", "Платіж за іпотекою", "Внески ОСББ", "Комунальний платіж"],
    ["Заправка", "Сервіс авто", "Автомийка", "Шини"],
    [
      "День народження",
      "Святкова вечеря",
      "Товари для свята",
      "Весільний подарунок",
    ],
    ["Онлайн-замовлення", "Ринок", "Різне"],
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
  walletSPENDINGS: [
    "Основний рахунок",
    "Дебетова картка",
    "Готівка",
    "Кредитна картка",
    "Другий рахунок",
    "Спільний рахунок",
  ],
  walletCUSHION: [
    "Резервний фонд",
    "Ощадний рахунок",
    "Фінансова подушка",
    "Депозитний рахунок",
  ],
  walletRESERVE: ["Резерв", "Резервний рахунок"],
  walletPOSSESSION: [
    "Квартира",
    "Автомобіль",
    "Ділянка",
    "Гараж",
    "Дача",
    "Прикраси",
  ],
  walletOTHER: ["Фонд відпустки", "Фонд для дітей", "Фонд подарунків"],
  reserveIn: ["Щомісячне поповнення", "Поповнення", "Переказ із заощаджень"],
  reserveOut: [
    "Покриття перевитрати",
    "Використано на покупку",
    "Перерозподіл",
  ],
  places: ["Біржа", "Апаратний гаманець", "Мобільний гаманець", "Застосунок"],
  coins: [
    "Крюгерранд 1 унція",
    "Кленовий лист 1 унція",
    "Британія 1 унція",
    "Віденська філармонія 1 унція",
    "Кенгуру 1 унція",
    "Злиток золота 1 унція",
  ],
  brokers: [
    "Брокерський рахунок",
    "Пенсійний рахунок",
    "Накопичувальний рахунок",
    "Інвестиційний рахунок",
  ],
  cashAccounts: [
    "Заощадження",
    "Валютний рахунок",
    "Депозит",
    "Готівковий резерв",
  ],
  bonds: ["ОВДП", "Ощадні облігації", "Облігації з індексацією"],
  stablecoin: "Стейблкоїн",
  groupMetals: ["Золоті монети", "Злитки"],
  groupDefault: ["Портфель", "Довгострокові"],
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

/** The whole vocabulary of a locale, for name generation in copy.ts. */
export function localePools(locale: DemoLocale): Readonly<LocalePools> {
  return BY_LOCALE[locale];
}

/**
 * Which concept (index into `category`) a SOURCE category name is about.
 *
 * 261113 (user): categories used to be renamed by the order of their random
 * ids, so the owner's "House" (rent, mortgage) became "Household" with a
 * €11,064 "Laundry detergent". The name is matched against a few stems in the
 * languages the source may be written in; the first match wins, so the more
 * specific rules come first ("Food & Home" is food, "Household" is not
 * housing). null = no idea — the caller hands out an unused concept.
 */
const CONCEPT_RULES: Array<[RegExp, number]> = [
  [/food|grocer|продукт|їжа|еда|jedzen|żywn|spożyw/i, 0],
  [/transport|taxi|metro|komunik|транспорт/i, 1],
  [/utilit|\bmedia\b|bills?\b|комунал/i, 2],
  [/restaur|dining|cafe|kawiar|ресторан|кафе/i, 3],
  [/health|medic|zdrow|здоров|медиц|лік/i, 4],
  [/household|chemi|побут/i, 5],
  [/subscri|subskr|підпис|abonam/i, 6],
  [/travel|trip|vacation|podró|wakac|подорож|відпуст/i, 7],
  [/educat|school|course|eduk|szkoł|освіт|навч/i, 8],
  [/present|gift|prezent|подарун/i, 9],
  [/cloth|apparel|odzież|ubran|одяг/i, 10],
  [/\bpets?\b|zwierz|тварин/i, 11],
  [/repair|renov|remont|ремонт/i, 12],
  [/entertain|leisure|rozryw|розваг/i, 13],
  [/invest|saving|oszczęd|inwest|заощадж|інвест/i, 14],
  [/\bkids?\b|child|baby|dzieci|dziec|діт|дит/i, 15],
  [/insur|ubezp|страх/i, 16],
  [/sport|fitness|\bgym\b|siłown|спорт/i, 17],
  [/beauty|cosmet|uroda|краса|космет/i, 18],
  [/\bbooks?\b|książ|книг/i, 19],
  [/electron|gadget|електрон/i, 20],
  [/garden|ogród|сад/i, 21],
  [/altru|charit|donat|darowiz|благод/i, 22],
  [/\btax|podat|подат/i, 23],
  [/fuel|petrol|paliw|пальн/i, 24],
  [/parking|парков/i, 25],
  [/phone|mobile|telefon|телефон/i, 26],
  [/internet|інтернет/i, 27],
  [
    /house|housing|\bhome\b|\brent\b|mortgage|\bdom\b|mieszk|czynsz|житл|оренд|квартир|дім/i,
    28,
  ],
  [/\bcars?\b|\bauto|samoch|машин|авто/i, 29],
  [/celebr|party|party|święt|imprez|свят/i, 30],
  [/uncategor|other|misc|\binne\b|різне|інше/i, 31],
];

export function conceptForName(name: string): number | null {
  for (const [re, i] of CONCEPT_RULES) if (re.test(name)) return i;
  return null;
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
