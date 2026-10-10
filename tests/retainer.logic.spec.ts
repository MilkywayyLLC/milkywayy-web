import { expect, test } from "@playwright/test";
import { propertyPricing } from "@/content/pricing";
import { invoicePdf } from "@/lib/invoice-pdf";
import { budgetPct, producedSummary } from "@/lib/portal/billing";
import { deliverablesFrom, estimate, logPrefill, serviceSummary } from "@/lib/portal/booking";
import { icsFeed } from "@/lib/portal/calendar";

/** Retainers and invoices (owner, 10 Oct 2026): the pure parts. */

test("the budget bar fills to 100% and stays full beyond it", () => {
  expect(budgetPct(6400, 10000)).toBe(64);
  expect(budgetPct(10000, 10000)).toBe(100);
  expect(budgetPct(13000, 10000)).toBe(100);
  expect(budgetPct(500, null)).toBe(0);
});

test("what a shoot produced, in a line", () => {
  expect(
    producedSummary([
      { description: "Social media reel", qty: 4, kind: "reel" },
      { description: "YouTube long-form video", qty: 1, kind: "long_form" },
      { description: "Property photos 2BR", qty: 1, kind: "shoot" },
    ]),
  ).toBe("4 reels, 1 long-form, property photos 2BR");
  expect(producedSummary([{ description: "Reel", qty: 1, kind: "reel" }])).toBe("1 reel");
});

test("the estimate: the client's own rates, the property price list", () => {
  const rates = { reel: 400, long_form: 1200 };
  expect(
    estimate(
      [
        { service: "reels", qty: 4 },
        { service: "long_form", qty: 1 },
      ],
      rates,
      propertyPricing,
    ),
  ).toBe(2800);
  const withProperty = estimate(
    [
      { service: "reels", qty: 1 },
      { service: "property", property: { type: "apartment", size: 0, photo: true } as never },
    ],
    rates,
    propertyPricing,
  );
  expect(withProperty).toBe(400 + propertyPricing.apartment.sizes[0].photo);
});

test("log prefill and the first deliverables come from the booking", () => {
  const services = [
    { service: "reels" as const, qty: 2 },
    {
      service: "property" as const,
      property: {
        type: "apartment",
        size: 1,
        photo: true,
        twilight: false,
        twilightQty: 5,
        video: true,
        short: true,
        long: false,
        lighting: "day",
        tour: true,
      } as never,
    },
  ];
  const lines = logPrefill(services, propertyPricing);
  expect(lines.map((l) => [l.key, l.basis, l.qty])).toEqual([
    ["reel", "client_rate", 2],
    ["property", "price_list", 1],
  ]);
  expect(lines[1].unit_price).toBeGreaterThan(0);
  expect(serviceSummary(services[0], propertyPricing)).toBe("2 reels");
  expect(deliverablesFrom(lines).map((d) => d.label)).toEqual([
    "Reel 1",
    "Reel 2",
    "Photos",
    "Reel 3",
    "360 tour",
  ]);
});

test("the invoice PDF: a valid file with the number, lines, VAT and bank details", () => {
  const bytes = invoicePdf(
    {
      invoice: {
        number: "MW-1001",
        issued_on: "2026-10-31",
        due_on: "2026-11-07",
        currency: "AED",
        lines: [
          {
            description: "Monthly package · October 2026",
            qty: 1,
            unit_price: 10000,
            amount: 10000,
          },
          {
            description: "Additional content (13,000.00 produced)",
            qty: 1,
            unit_price: 3000,
            amount: 3000,
          },
        ],
        subtotal: 13000,
        vat_rate: 5,
        vat: 650,
        amount: 13650,
        note: "Thank you",
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        status: "due",
      },
      account: {
        name: "Budget Realty (Agent’s Office)",
        trn: "100000000000003",
        billing_address: null,
      },
      company: {
        name: "Milkywayy LLC",
        address: "Dubai, UAE",
        trn: "100000000000001",
        email: null,
        vat_registered: true,
      },
      bank: {
        account_name: "Milkywayy LLC",
        bank: "Emirates NBD",
        iban: "AE070331234567890123456",
        swift: null,
      },
      pays_online: true,
    },
    { payUrl: "https://milkywayy.com/portal/billing" },
  );
  const text = Buffer.from(bytes).toString("latin1");
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  for (const s of [
    "TAX INVOICE",
    "MW-1001",
    "AED 13,650.00",
    "VAT 5%",
    "IBAN: AE070331234567890123456",
  ])
    expect(text).toContain(s);
  // The xref offsets point at the objects.
  const xref = Number(text.match(/startxref\n(\d+)/)![1]);
  expect(text.slice(xref, xref + 4)).toBe("xref");
  const firstObj = Number(text.match(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/)![1]);
  expect(text.slice(firstObj, firstObj + 7)).toBe("1 0 obj");
});

test("the calendar feed: one event per shoot, in Dubai time", () => {
  const ics = icsFeed(
    [
      {
        id: "p1",
        ref: "MW-2001",
        title: "Shoot · Marina Gate 1",
        status: "requested",
        shoot_date: "2026-10-20",
        slot: "Morning",
        client: "Budget Realty",
        address: "Marina Gate 1, Dubai Marina",
      },
    ],
    "https://milkywayy.com",
  );
  expect(ics).toContain("DTSTART:20261020T050000Z"); // 09:00 Dubai
  expect(ics).toContain("DTEND:20261020T090000Z");
  expect(ics).toContain("SUMMARY:[Requested] Budget Realty: Shoot · Marina Gate 1");
  expect(ics).toContain("LOCATION:Marina Gate 1\\, Dubai Marina");
  expect(ics).toContain("STATUS:TENTATIVE");
});
