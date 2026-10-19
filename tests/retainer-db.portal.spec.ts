import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminRpc,
  cleanup,
  clientAccount,
  createUser,
  hasPortalAdmin,
  newRun,
  signedIn,
} from "./helpers/portal";

/**
 * Retainers, shoot booking, deliverables, inquiries and invoice approval (owner, 10 Oct 2026), in
 * the database: budget totals, the per-client switch, frozen prices, "log what we shot",
 * per-deliverable revisions, inquiries, drafts on the 25th, approval and scheduled publishing,
 * and Members seeing no money.
 */
test.skip(!hasPortalAdmin, "needs the portal env and PORTAL_ADMIN_SECRET in .env.local");
test.describe.configure({ mode: "serial" });

const RUN = newRun();
type Res = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const must = async <T>(p: Res) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
};
const fails = async (p: Res) => (await p).error?.message ?? "";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
const month = today.slice(0, 8) + "01";
const y = Number(today.slice(0, 4));
const m = Number(today.slice(5, 7));
const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const day25 = today.slice(0, 8) + "25";
const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

let O: SupabaseClient, M: SupabaseClient; // budget client: Owner and Member
let budget = "";
let P: SupabaseClient; // pay-as-you-go client (Owner)
let payg = "";
let shoot = ""; // a booked shoot of the budget client

type Billing = {
  mode: string;
  show_budget: boolean;
  budget: {
    budget: number;
    total: number;
    activity: { project_id: string; total: number; items: { amount: number }[] }[];
  } | null;
  activity: unknown[] | null;
};

test.beforeAll(async () => {
  const c = await clientAccount(RUN, "owner", "Budget Realty");
  O = c.db;
  budget = c.account;
  const mem = await createUser(RUN, "member");
  await must(O.from("account_invites").insert({ account_id: budget, email: mem, name: "Mia" }));
  M = await signedIn(mem);
  await must(M.rpc("accept_my_invites"));
  const p = await clientAccount(RUN, "payg", "Payg Studio");
  P = p.db;
  payg = p.account;
  // The budget client's own rates, from the start of this month.
  for (const [key, amount] of [
    ["reel", 400],
    ["long_form", 1200],
  ] as const)
    await must(
      adminRpc("portal_admin_set_client_rate", {
        p_account: budget,
        p_key: key,
        p_amount: amount,
        p_from: month,
      }),
    );
});
test.afterAll(async () => {
  await cleanup(RUN);
});

test("a budget package: Owner/Admins see the month; Members get no money anywhere", async () => {
  await must(
    adminRpc("portal_admin_set_budget", {
      p_account: budget,
      p_amount: 10000,
      p_from: month,
      p_advance: false,
    }),
  );
  const b = await must<Billing>(O.rpc("my_billing", { p_account: budget }));
  expect(b.mode).toBe("budget");
  expect(b.show_budget).toBe(true);
  expect(b.budget).toMatchObject({ budget: 10000, total: 0, activity: [] });
  // Members: no billing, no rates for the estimate, no line items or invoices.
  expect(await fails(M.rpc("my_billing", { p_account: budget }))).toMatch(/owners and admins/);
  const opts = await must<{ can_book: boolean; rates: unknown }>(
    M.rpc("my_booking_options", { p_account: budget }),
  );
  expect(opts).toMatchObject({ can_book: true, rates: null });
  const own = await must<{ rates: { reel: number } }>(
    O.rpc("my_booking_options", { p_account: budget }),
  );
  expect(Number(own.rates.reel)).toBe(400);
});

test("booking: every client books in the portal (a Member too), half or full day", async () => {
  // Pay as you go books here too now (owner, 10 Oct 2026).
  await must(
    P.rpc("book_shoot", {
      p_account: payg,
      p_date: today,
      p_slot: "morning",
      p_location: { address: "Marina Gate 1, Dubai Marina" },
      p_services: [{ service: "reels", qty: 2, day: "half" }],
    }),
  );
  expect(
    await fails(
      P.rpc("book_shoot", {
        p_account: payg,
        p_date: today,
        p_slot: "morning",
        p_location: { address: "Marina Gate 1, Dubai Marina" },
        p_services: [{ service: "reels", qty: 2, day: "week" }],
      }),
    ),
  ).toMatch(/half day or full day/);
  expect(
    await fails(
      M.rpc("book_shoot", {
        p_account: budget,
        p_date: today,
        p_slot: "brunch",
        p_location: { address: "Marina Gate 1" },
        p_services: [{ service: "reels", qty: 2 }],
      }),
    ),
  ).toMatch(/time slot/);
  expect(
    await fails(
      M.rpc("book_shoot", {
        p_account: budget,
        p_date: today,
        p_slot: "morning",
        p_location: { address: "Marina Gate 1", lat: 40.7, lng: -74 },
        p_services: [{ service: "reels", qty: 2 }],
      }),
    ),
  ).toMatch(/in the UAE/);
  const out = await must<{ id: string; ref: string }>(
    M.rpc("book_shoot", {
      p_account: budget,
      p_date: today,
      p_slot: "full_day",
      p_location: {
        address: "Marina Gate 1, Dubai Marina, Dubai",
        lat: 25.0866,
        lng: 55.1462,
        place_id: "ChIJtest",
        unit: "Apt 2304",
        access: "Concierge has the key",
      },
      p_services: [
        {
          service: "reels",
          qty: 4,
          notes: "Golden hour",
          links: ["https://www.instagram.com/reel/x/"],
        },
        { service: "long_form", qty: 1 },
        {
          service: "property",
          property: { type: "apartment", size: 1, photo: true, video: false, tour: false },
        },
      ],
      p_estimate: 3200,
    }),
  );
  shoot = out.id;
  const [p] = await must<
    {
      status: string;
      slot: string;
      shoot_date: string;
      meta: { booking: { location: { place_id: string } } };
    }[]
  >(O.from("projects").select("status, slot, shoot_date, meta").eq("id", shoot));
  expect(p).toMatchObject({ status: "requested", slot: "Full day", shoot_date: today });
  expect(p.meta.booking.location.place_id).toBe("ChIJtest");
});

test("log what we shot: client rates on the shoot date, extras, an override needs a reason", async () => {
  expect(
    await fails(
      adminRpc("portal_admin_log_shoot", {
        p_project: shoot,
        p_lines: [
          {
            key: "reel",
            description: "Social media reel",
            qty: 4,
            basis: "override",
            unit_price: 350,
          },
        ],
      }),
    ),
  ).toMatch(/say why the price was changed/);
  await must(
    adminRpc("portal_admin_log_shoot", {
      p_project: shoot,
      p_lines: [
        { key: "reel", description: "Social media reel", qty: 5, basis: "client_rate" }, // 1 more than asked
        { key: "long_form", description: "YouTube long-form video", qty: 1, basis: "client_rate" },
        {
          key: "property",
          kind: "shoot",
          description: "Property shoot · 2BR apartment: photos",
          qty: 1,
          basis: "price_list",
          unit_price: 900,
        },
        {
          key: "photo",
          description: "Extra drone stills",
          qty: 1,
          basis: "override",
          unit_price: 500,
          list_price: 0,
          reason: "Agreed on site",
        },
      ],
      p_deliverables: [
        { label: "Reel 1", kind: "reel" },
        { label: "Reel 2", kind: "reel" },
        { label: "Photos", kind: "photos" },
      ],
    }),
  );
  const items = await must<
    {
      description: string;
      unit_price: number;
      price_basis: string;
      override_reason: string | null;
      delivered_month: string;
    }[]
  >(O.from("line_items").select("*").eq("project_id", shoot).order("sort"));
  expect(items.map((i) => [i.description, Number(i.unit_price), i.price_basis])).toEqual([
    ["Social media reel", 400, "client_rate"],
    ["YouTube long-form video", 1200, "client_rate"],
    ["Property shoot · 2BR apartment: photos", 900, "price_list"],
    ["Extra drone stills", 500, "override"],
  ]);
  expect(items[3].override_reason).toBe("Agreed on site");
  // Budget clients see it this month straight away: 5×400 + 1200 + 900 + 500 = 4,600.
  expect(items.every((i) => i.delivered_month.slice(0, 10) === month)).toBe(true);
  const b = await must<Billing>(O.rpc("my_billing", { p_account: budget }));
  expect(Number(b.budget!.total)).toBe(4600);
  expect(b.budget!.activity).toHaveLength(1);
  expect(b.budget!.activity[0].items).toHaveLength(4);
  // Members never read line items.
  expect(await must<unknown[]>(M.from("line_items").select("id"))).toEqual([]);
});

test("a new rate or price list change never reprices what's already logged", async () => {
  await must(
    adminRpc("portal_admin_set_client_rate", {
      p_account: budget,
      p_key: "reel",
      p_amount: 600,
      p_from: today,
    }),
  );
  const [reel] = await must<{ unit_price: number }[]>(
    O.from("line_items").select("unit_price").eq("project_id", shoot).eq("rate_key", "reel"),
  );
  expect(Number(reel.unit_price)).toBe(400);
  // A new shoot logged now uses the new rate.
  const p2 = await must<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: budget,
      p_type: "shoot",
      p_title: "Second shoot",
      p_area: "JLT",
      p_building: "Cluster D",
      p_unit: "1",
      p_services: ["short"],
    }),
  );
  await must(
    adminRpc("portal_admin_log_shoot", {
      p_project: p2.id,
      p_lines: [{ key: "reel", description: "Social media reel", qty: 1, basis: "client_rate" }],
    }),
  );
  const [r2] = await must<{ unit_price: number }[]>(
    O.from("line_items").select("unit_price").eq("project_id", p2.id),
  );
  expect(Number(r2.unit_price)).toBe(600);
  // History keeps both.
  const h = await must<{ rates: { key: string; amount: number }[] }>(
    adminRpc("portal_admin_billing_history", { p_account: budget }),
  );
  expect(
    h.rates
      .filter((r) => r.key === "reel")
      .map((r) => Number(r.amount))
      .sort(),
  ).toEqual([400, 600]);
});

test("the budget card past 100%: the total simply grows (the app keeps the bar full)", async () => {
  await must(
    adminRpc("portal_admin_set_budget", { p_account: budget, p_amount: 4000, p_from: month }),
  );
  const b = await must<Billing>(O.rpc("my_billing", { p_account: budget }));
  expect(Number(b.budget!.budget)).toBe(4000);
  expect(Number(b.budget!.total)).toBe(5200); // 4,600 + the 600 reel
  // Back to 10,000 for the invoice tests below; the history keeps one row per month.
  await must(
    adminRpc("portal_admin_set_budget", { p_account: budget, p_amount: 10000, p_from: month }),
  );
});

test("“Show budget and activity”: off hides the money; on shows a pay-as-you-go client's activity", async () => {
  await must(
    adminRpc("portal_admin_set_billing_switches", {
      p_account: budget,
      p_show_budget: false,
      p_payg_invoicing: "per_project",
    }),
  );
  let b = await must<Billing>(O.rpc("my_billing", { p_account: budget }));
  expect(b).toMatchObject({ show_budget: false, budget: null, activity: null });
  await must(
    adminRpc("portal_admin_set_billing_switches", {
      p_account: budget,
      p_show_budget: null,
      p_payg_invoicing: "per_project",
    }),
  );
  b = await must<Billing>(O.rpc("my_billing", { p_account: budget }));
  expect(b.show_budget).toBe(true);
  // Pay as you go: off by default, on when switched on.
  b = await must<Billing>(P.rpc("my_billing", { p_account: payg }));
  expect(b).toMatchObject({ show_budget: false, activity: null });
  await must(
    adminRpc("portal_admin_set_billing_switches", {
      p_account: payg,
      p_show_budget: true,
      p_payg_invoicing: "month_end",
    }),
  );
  b = await must<Billing>(P.rpc("my_billing", { p_account: payg }));
  expect(b.show_budget).toBe(true);
  expect(Array.isArray(b.activity)).toBe(true);
});

test("deliverables: revisions counted per item (2 each), only once delivered; a round can be added", async () => {
  const ds = await must<{ id: string; label: string; status: string }[]>(
    M.from("project_deliverables")
      .select("id, label, status")
      .eq("project_id", shoot)
      .order("sort"),
  );
  expect(ds.map((d) => d.label)).toEqual(["Reel 1", "Reel 2", "Photos"]);
  const [r1, r2] = ds;
  expect(
    await fails(M.rpc("request_deliverable_revision", { p_deliverable: r1.id, p_note: "x" })),
  ).toMatch(/delivered items/);
  for (const d of [r1, r2])
    await must(adminRpc("portal_admin_set_deliverable", { p_id: d.id, p_status: "delivered" }));
  await must(M.rpc("request_deliverable_revision", { p_deliverable: r1.id, p_note: "0:12 music" }));
  await must(adminRpc("portal_admin_set_deliverable", { p_id: r1.id, p_status: "delivered" }));
  await must(M.rpc("request_deliverable_revision", { p_deliverable: r1.id, p_note: "0:20 cut" }));
  await must(adminRpc("portal_admin_set_deliverable", { p_id: r1.id, p_status: "delivered" }));
  expect(
    await fails(M.rpc("request_deliverable_revision", { p_deliverable: r1.id, p_note: "again" })),
  ).toMatch(/no revision rounds left/);
  // Reel 2's rounds are its own.
  const rev = await must<{ round: number }>(
    M.rpc("request_deliverable_revision", { p_deliverable: r2.id, p_note: "brighter" }),
  );
  expect(rev.round).toBe(1);
  await must(adminRpc("portal_admin_set_deliverable", { p_id: r1.id, p_add_round: true }));
  expect(
    (
      await must<{ round: number }>(
        M.rpc("request_deliverable_revision", { p_deliverable: r1.id, p_note: "last one" }),
      )
    ).round,
  ).toBe(3);
  const [after] = await must<{ status: string; rounds_used: number; rounds_allowed: number }[]>(
    M.from("project_deliverables").select("status, rounds_used, rounds_allowed").eq("id", r1.id),
  );
  expect(after).toEqual({ status: "in_revision", rounds_used: 3, rounds_allowed: 3 });
  const revs = await must<unknown[]>(
    O.from("deliverable_revisions").select("round").eq("deliverable_id", r1.id),
  );
  expect(revs).toHaveLength(3);
});

test("inquiries: tagged with one of their shoots; our reply can carry a private link; Members see their own", async () => {
  expect(
    await fails(
      P.rpc("create_inquiry", {
        p_account: payg,
        p_subject: "About that shoot",
        p_body: "Hi",
        p_project: shoot, // the budget client's shoot
      }),
    ),
  ).toMatch(/isn't yours/);
  const id = await must<string>(
    M.rpc("create_inquiry", {
      p_account: budget,
      p_subject: "Raw footage?",
      p_body: "Can we have the raw clips from the shoot?",
      p_project: shoot,
    }),
  );
  const out = await must<{ recipients: { email: string }[] }>(
    adminRpc("portal_admin_reply_inquiry", {
      p_id: id,
      p_body: "Here they are.",
      p_link_url: "https://drive.google.com/drive/folders/abc",
      p_link_label: "Raw footage",
    }),
  );
  expect(out.recipients.map((r) => r.email)).toEqual([`${RUN}-member@example.com`]);
  const msgs = await must<{ is_admin: boolean; link_url: string | null }[]>(
    M.from("inquiry_messages").select("is_admin, link_url").eq("inquiry_id", id).order("at"),
  );
  expect(msgs).toEqual([
    { is_admin: false, link_url: null },
    { is_admin: true, link_url: "https://drive.google.com/drive/folders/abc" },
  ]);
  const [q] = await must<{ client_unread: boolean; project_id: string }[]>(
    M.from("inquiries").select("client_unread, project_id").eq("id", id),
  );
  expect(q).toEqual({ client_unread: true, project_id: shoot });
  // The Owner sees it; the other client doesn't.
  expect(await must<unknown[]>(O.from("inquiries").select("id").eq("id", id))).toHaveLength(1);
  expect(await must<unknown[]>(P.from("inquiries").select("id").eq("id", id))).toEqual([]);
  // Admin inbox: unread after a client reply.
  await must(M.rpc("reply_inquiry", { p_inquiry: id, p_body: "Thanks!" }));
  const inbox = await must<{ id: string; admin_unread: boolean; project_ref: string }[]>(
    adminRpc("portal_admin_inquiries", { p_account: budget }),
  );
  expect(inbox.find((x) => x.id === id)).toMatchObject({ admin_unread: true });
});

test("invoice drafts on the 25th: budget (package + additional), pay as you go monthly; nothing before", async () => {
  // A pay-as-you-go item this month.
  const pj = await must<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: payg,
      p_type: "edit",
      p_title: "October edits",
      p_kind: "short_form",
    }),
  );
  await must(
    adminRpc("portal_admin_add_line_item", {
      p_project: pj.id,
      p_kind: "reel",
      p_description: null,
      p_qty: 3,
      p_unit_price: 200,
    }),
  );
  await must(adminRpc("portal_admin_set_status", { p_id: pj.id, p_status: "delivered" }));
  // Before the 25th: nothing.
  const early = await must<{ created: number }>(
    adminRpc("portal_admin_generate_drafts", { p_today: today.slice(0, 8) + "24" }),
  );
  expect(early.created).toBe(0);
  await must(adminRpc("portal_admin_generate_drafts", { p_today: day25 }));
  // Twice is safe.
  await must(adminRpc("portal_admin_generate_drafts", { p_today: day25 }));
  type Q = {
    id: string;
    account_id: string;
    category: string;
    amount: number;
    status: string;
    publish_on: string;
    advance: boolean;
  };
  const q = await must<Q[]>(adminRpc("portal_admin_invoice_queue", { p_status: "open" }));
  const mine = q.filter((x) => [budget, payg].includes(x.account_id));
  const b = mine.filter((x) => x.account_id === budget);
  expect(b).toHaveLength(1);
  // 10,000 package; produced 5,200, so nothing beyond it.
  expect(b[0]).toMatchObject({ category: "budget", status: "draft", publish_on: lastDay });
  expect(Number(b[0].amount)).toBe(10000);
  const pg = mine.filter((x) => x.account_id === payg);
  expect(pg).toHaveLength(1);
  expect(pg[0]).toMatchObject({ category: "payg" });
  expect(Number(pg[0].amount)).toBe(600);
  // Clients never see drafts.
  expect(await must<unknown[]>(O.from("invoices").select("id"))).toEqual([]);
  expect(await must<unknown[]>(P.from("invoices").select("id"))).toEqual([]);
});

test("edit a draft, approve: numbered, publishes on the month's last day; then the client sees it", async () => {
  const q = await must<{ id: string; account_id: string }[]>(
    adminRpc("portal_admin_invoice_queue", { p_status: "open" }),
  );
  const draft = q.find((x) => x.account_id === budget)!;
  await must(
    adminRpc("portal_admin_save_draft", {
      p_id: draft.id,
      p_lines: [
        { description: "Monthly package", qty: 1, unit_price: 10000 },
        { description: "Rush delivery", qty: 1, unit_price: 250 },
      ],
      p_note: "Thank you",
      p_due: nextMonth,
    }),
  );
  const out = await must<{ published: boolean; publish_on: string }>(
    adminRpc("portal_admin_approve_invoice", { p_id: draft.id, p_publish_now: false }),
  );
  if (lastDay !== today) expect(out).toMatchObject({ published: false, publish_on: lastDay });
  const inv = await must<{ status: string; number: string; amount: number }>(
    adminRpc("portal_admin_invoice", { p_id: draft.id }),
  );
  expect(inv.number).toMatch(/^[A-Z0-9-]+\d+$/);
  expect(Number(inv.amount)).toBe(10250);
  if (lastDay !== today) {
    expect(inv.status).toBe("approved");
    expect(await must<unknown[]>(O.from("invoices").select("id"))).toEqual([]);
    // The day before the last day nothing happens; on the last day it's published.
    const before = new Date(Date.parse(lastDay) - 864e5).toISOString().slice(0, 10);
    const none = await must<{ id: string }[]>(
      adminRpc("portal_admin_publish_due", { p_today: before }),
    );
    expect(none.map((x) => x.id)).not.toContain(draft.id);
    const pub = await must<{ id: string; recipients: { email: string }[] }[]>(
      adminRpc("portal_admin_publish_due", { p_today: lastDay }),
    );
    const mine = pub.find((x) => x.id === draft.id)!;
    expect(mine.recipients.map((r) => r.email)).toEqual([`${RUN}-owner@example.com`]);
  }
  const seen = await must<{ number: string; status: string; amount: number }[]>(
    O.from("invoices").select("number, status, amount"),
  );
  expect(seen).toEqual([{ number: inv.number, status: "due", amount: 10250 }]);
  expect(await must<unknown[]>(M.from("invoices").select("id"))).toEqual([]);
  // A published invoice can't be edited or set back.
  expect(
    await fails(
      adminRpc("portal_admin_save_draft", {
        p_id: draft.id,
        p_lines: [{ description: "x", qty: 1, unit_price: 1 }],
        p_note: "",
        p_due: nextMonth,
      }),
    ),
  ).toMatch(/can't be edited/);
});

test("approve & publish now; status changes refuse drafts", async () => {
  const q = await must<{ id: string; account_id: string }[]>(
    adminRpc("portal_admin_invoice_queue", { p_status: "open" }),
  );
  const draft = q.find((x) => x.account_id === payg)!;
  expect(
    await fails(adminRpc("portal_admin_set_invoice_status", { p_id: draft.id, p_status: "paid" })),
  ).toMatch(/approve and publish/);
  const out = await must<{ published: boolean }>(
    adminRpc("portal_admin_approve_invoice", { p_id: draft.id, p_publish_now: true }),
  );
  expect(out.published).toBe(true);
  const seen = await must<{ status: string }[]>(P.from("invoices").select("status"));
  expect(seen).toEqual([{ status: "due" }]);
});

test("past the package: the month-end draft adds a line for the content beyond it", async () => {
  const c = await clientAccount(RUN, "over", "Busy Brokers");
  await must(
    adminRpc("portal_admin_set_budget", { p_account: c.account, p_amount: 1000, p_from: month }),
  );
  await must(
    adminRpc("portal_admin_set_client_rate", {
      p_account: c.account,
      p_key: "reel",
      p_amount: 500,
      p_from: month,
    }),
  );
  const pj = await must<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: c.account,
      p_type: "shoot",
      p_title: "Reels day",
      p_area: "Business Bay",
      p_building: "Bay Square",
      p_unit: "1",
      p_services: ["short"],
    }),
  );
  await must(
    adminRpc("portal_admin_log_shoot", {
      p_project: pj.id,
      p_lines: [{ key: "reel", description: "Social media reel", qty: 3, basis: "client_rate" }],
    }),
  );
  await must(adminRpc("portal_admin_generate_drafts", { p_today: day25 }));
  const q = await must<{ id: string; account_id: string }[]>(
    adminRpc("portal_admin_invoice_queue", { p_status: "open" }),
  );
  const d = await must<{ lines: { description: string; amount: number }[]; amount: number }>(
    adminRpc("portal_admin_invoice", { p_id: q.find((x) => x.account_id === c.account)!.id }),
  );
  expect(d.lines.map((l) => Number(l.amount))).toEqual([1000, 500]);
  expect(d.lines[1].description).toMatch(/^Additional content beyond the monthly package/);
  expect(Number(d.amount)).toBe(1500);
});

test("billed in advance: next month's package drafted on the 25th, publishing on the 1st", async () => {
  const c = await clientAccount(RUN, "adv", "Advance Homes");
  await must(
    adminRpc("portal_admin_set_budget", {
      p_account: c.account,
      p_amount: 8000,
      p_from: month,
      p_advance: true,
    }),
  );
  await must(adminRpc("portal_admin_generate_drafts", { p_today: day25 }));
  const q = await must<
    {
      account_id: string;
      advance: boolean;
      period_start: string;
      publish_on: string;
      amount: number;
    }[]
  >(adminRpc("portal_admin_invoice_queue", { p_status: "open" }));
  const mine = q.filter((x) => x.account_id === c.account);
  // Nothing produced this month, so only next month's package (no month-end additional).
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ advance: true, period_start: nextMonth, publish_on: nextMonth });
  expect(Number(mine[0].amount)).toBe(8000);
});

test("one-off clients: a draft when the project is delivered", async () => {
  const c = await clientAccount(RUN, "oneoff", "One Off LLC");
  const pj = await must<{ id: string }>(
    adminRpc("portal_admin_create_project", {
      p_account: c.account,
      p_type: "shoot",
      p_title: "Villa shoot",
      p_area: "Arabian Ranches",
      p_building: "Saheel",
      p_unit: "12",
      p_services: ["photo"],
    }),
  );
  await must(
    adminRpc("portal_admin_add_line_item", {
      p_project: pj.id,
      p_kind: "shoot",
      p_description: "Villa photos",
      p_qty: 1,
      p_unit_price: 1500,
    }),
  );
  await must(adminRpc("portal_admin_set_status", { p_id: pj.id, p_status: "delivered" }));
  const q = await must<
    {
      account_id: string;
      category: string;
      project_id: string;
      publish_on: string | null;
      amount: number;
    }[]
  >(adminRpc("portal_admin_invoice_queue", { p_status: "open" }));
  const d = q.find((x) => x.account_id === c.account)!;
  expect(d).toMatchObject({ category: "property", project_id: pj.id, publish_on: null });
  expect(Number(d.amount)).toBe(1500);
});
