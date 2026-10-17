import type { Page, Route } from "@playwright/test";

/**
 * Public shop (marketing storefront) API mock.
 *
 * `mockApi.ts` covers the ops dashboard; this one covers the storefront's
 * `/public/store/*` surface so search and checkout e2e runs never touch the
 * real Neon database or Paystack.
 */

/** Origins the web app may point its API at (fresh Playwright server vs the already-running one). */
export const STORE_API_ORIGINS = [
  "http://127.0.0.1:3999",
  "http://localhost:3999",
  "http://127.0.0.1:3001",
  "http://localhost:3001",
] as const;

/** Mirrors playwright.config.ts so Paystack's return URL can be absolute. */
export const E2E_BASE_URL =
  process.env.E2E_BASE_URL ??
  `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;

export const ORDER_REF = "VON-E2E-001";

export type StoreApiItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  tenantCode: string;
  tenantId: string;
  availableQuantity: number;
  inStock: boolean;
  carModel: string;
};

function item(
  id: string,
  sku: string,
  name: string,
  category: string,
  description: string,
  price: number,
  carModel: string,
  availableQuantity = 12,
): StoreApiItem {
  return {
    id,
    sku,
    name,
    category,
    description,
    price,
    currency: "NGN",
    imageUrl: null,
    tenantCode: "VW",
    tenantId: "tenant_vw_001",
    availableQuantity,
    inStock: availableQuantity > 0,
    carModel,
  };
}

/**
 * Superset the server searches. The landing page only ever receives the first
 * three rows (see `landingPage`), which is what keeps a client-side miss
 * honest: "zeta" exists on the server but never in the in-memory catalogue.
 */
export const STORE_CATALOG: StoreApiItem[] = [
  item(
    "p_oil",
    "OIL-10W40",
    "Engine Oil 10W40 5L",
    "Oil",
    "Fully synthetic 10W-40 engine oil for modern petrol engines.",
    18500,
    "Camry",
    40,
  ),
  item(
    "p_brake",
    "BRK-PAD-F",
    "Front Brake Pads",
    "Brakes",
    "OEM front axle pad set, low dust.",
    42000,
    "Corolla",
    25,
  ),
  item(
    "p_air",
    "FLT-AIR",
    "Air Filter",
    "Filters",
    "High flow engine air filter element.",
    7500,
    "Hilux",
    60,
  ),
  item(
    "p_sensor",
    "SNS-O2",
    "Oxygen Sensor",
    "Electrical",
    "Upstream lambda sensor for emissions control.",
    26000,
    "Camry",
    8,
  ),
  item(
    "p_belt",
    "BLT-TEN",
    "Timing Belt Kit",
    "Engine",
    "Full timing belt kit with water pump.",
    58000,
    "Corolla",
    5,
  ),
  item(
    "p_zeta",
    "ZETA-SA",
    "Zeta Shock Absorber",
    "Suspension",
    "Gas charged front shock absorber.",
    64000,
    "Hilux",
    3,
  ),
];

/** Page 1 the landing page hydrates with — no cursor, so warm-up stops here. */
export const landingPage = STORE_CATALOG.slice(0, 3);

const CATEGORIES = [...new Set(STORE_CATALOG.map((row) => row.category))].sort(
  (a, b) => a.localeCompare(b),
);
const MODELS = [...new Set(STORE_CATALOG.map((row) => row.carModel))].sort(
  (a, b) => a.localeCompare(b),
);

export type CheckoutBody = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillment: string;
  notes?: string;
  lines: Array<{ itemId: string; qty: number }>;
  callbackUrl: string;
};

export type StoreMockHandle = {
  /** Every POST /public/store/checkout the page made, in order. */
  checkoutRequests: CheckoutBody[];
};

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    Vary: "Origin",
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

function sortRows(rows: StoreApiItem[], sort: string | null): StoreApiItem[] {
  const copy = [...rows];
  switch (sort) {
    case "price_desc":
      return copy.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
    case "name_asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  }
}

function orderResponse(reference: string, checkout: CheckoutBody | null) {
  const lines = (checkout?.lines ?? []).map((line) => {
    const found = STORE_CATALOG.find((row) => row.id === line.itemId);
    const unitPrice = found?.price ?? 0;
    return {
      itemId: line.itemId,
      name: found?.name ?? line.itemId,
      qty: line.qty,
      unitPrice,
      lineTotal: unitPrice * line.qty,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return {
    id: "ord_e2e_1",
    reference,
    status: "paid",
    fulfillment: checkout?.fulfillment ?? "delivery",
    customerName: checkout?.customerName ?? "",
    customerEmail: checkout?.customerEmail ?? "",
    customerPhone: checkout?.customerPhone ?? "",
    registration: null,
    notes: checkout?.notes ?? null,
    currency: "NGN",
    total,
    paidAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    lines,
  };
}

function handleCatalog(url: URL, route: Route) {
  const search = url.searchParams.get("search")?.trim() ?? "";
  const category = url.searchParams.get("category") ?? "";
  const model = url.searchParams.get("model") ?? "";
  const minPrice = url.searchParams.get("minPrice");
  const maxPrice = url.searchParams.get("maxPrice");
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const sort = url.searchParams.get("sort");

  // No search → the landing page's first page only. Returning the whole
  // catalogue here would let the in-memory warm-up answer every query and
  // the server-fallback path would never run.
  if (!search) {
    return json(route, {
      items: landingPage.slice(0, Number.isFinite(limit) ? limit : 100),
      nextCursor: null,
      categories: CATEGORIES,
      models: MODELS,
    });
  }

  const needle = search.toLowerCase();
  const rows = sortRows(
    STORE_CATALOG.filter((row) => {
      const haystack = [
        row.name,
        row.sku,
        row.category,
        row.description,
        row.carModel,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
      if (category && category !== "All" && row.category !== category) return false;
      if (model && model !== "All" && !row.carModel.toLowerCase().includes(model.toLowerCase())) {
        return false;
      }
      if (minPrice != null && row.price < Number(minPrice)) return false;
      if (maxPrice != null && row.price > Number(maxPrice)) return false;
      return true;
    }),
    sort,
  ).slice(0, Number.isFinite(limit) ? limit : 100);

  return json(route, {
    items: rows,
    nextCursor: null,
    categories: CATEGORIES,
    models: MODELS,
  });
}

/**
 * Installs the storefront API mock. Returns a handle with every checkout POST
 * the page made so tests can assert the payload the server would receive.
 */
export async function installStoreMock(page: Page): Promise<StoreMockHandle> {
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.documentElement.appendChild(style);
  });

  const handle: StoreMockHandle = { checkoutRequests: [] };

  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method();

    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders(route) });
    }

    if (path === "/public/store/catalog") {
      return handleCatalog(url, route);
    }

    if (path === "/public/store/checkout" && method === "POST") {
      const body = (request.postDataJSON() ?? {}) as CheckoutBody;
      handle.checkoutRequests.push(body);
      const reference = ORDER_REF;
      return json(route, {
        orderReference: reference,
        total: body.lines.reduce((sum, line) => {
          const found = STORE_CATALOG.find((row) => row.id === line.itemId);
          return sum + (found?.price ?? 0) * line.qty;
        }, 0),
        currency: "NGN",
        paystackPublicKey: "pk_test_e2e",
        // Stands in for Paystack sending the customer to the callback URL the
        // app passed in — same `?ref=` shape the confirmation page accepts.
        authorizationUrl: `${E2E_BASE_URL}/shop/confirmation?ref=${reference}`,
        accessCode: "acc_e2e",
        paystackReference: `store_${reference}`,
      });
    }

    const orderMatch = path.match(
      /^\/public\/store\/orders\/([^/]+)(\/confirm)?$/,
    );
    if (orderMatch) {
      const reference = decodeURIComponent(orderMatch[1] ?? "");
      const checkout = handle.checkoutRequests.at(-1) ?? null;
      return json(route, orderResponse(reference, checkout));
    }

    if (method === "GET") return json(route, { items: [], totalCount: 0 });
    return json(route, { ok: true });
  };

  await page.route("**/*", async (route) => {
    const type = route.request().resourceType();
    if (
      type === "document" ||
      type === "stylesheet" ||
      type === "script" ||
      type === "image" ||
      type === "font" ||
      type === "media"
    ) {
      return route.continue();
    }

    let url: URL;
    try {
      url = new URL(route.request().url());
    } catch {
      return route.continue();
    }

    if (!(STORE_API_ORIGINS as readonly string[]).includes(url.origin)) {
      return route.continue();
    }
    return handler(route);
  });

  return handle;
}

export const storeMockData = {
  ORDER_REF,
  STORE_CATALOG,
  landingPage,
};
