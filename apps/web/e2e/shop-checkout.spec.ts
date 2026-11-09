import { expect, test, type Page } from "@playwright/test";

import { ORDER_REF, installStoreMock } from "./fixtures/storeMock";

const GRID = "#shop-catalog .vg-catalog__grid .vg-pcard";
const PRODUCT = "Front Brake Pads";

async function addFromCatalog(page: Page, productName: string) {
  await page.goto("/shop", { waitUntil: "domcontentloaded" });
  await expect(page.locator(GRID).first()).toBeVisible({ timeout: 60_000 });

  const card = page.locator(GRID).filter({ hasText: productName }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card
    .getByRole("button", { name: `Add ${productName} to cart` })
    .click();

  // Adding opens the cart drawer.
  await expect(page.locator(".vg-cart")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".vg-cart__name")).toContainText(productName);
}

async function fillCheckoutForm(page: Page) {
  await page.locator("#checkout-first").fill("Ada");
  await page.locator("#checkout-last").fill("Obi");
  await page.locator("#checkout-email").fill("ada@example.com");
  await page.locator("#checkout-phone").fill("08012345678");
  await page.locator("#checkout-city").fill("Abuja");
  await page.locator("#checkout-address").fill("12 Alexander Road, Ikoyi");
  await page.locator("#checkout-notes").fill("Call on arrival");
}

test.describe("shop: checkout flow", () => {
  test("browse → cart → checkout → pay → confirmation", async ({ page }) => {
    test.setTimeout(180_000);
    const store = await installStoreMock(page);

    // 1. Browse and add a part to the basket.
    await addFromCatalog(page, PRODUCT);

    // 2. Cart: line, SKU, subtotal; bump the quantity to 2.
    await page.goto("/shop/cart", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Selected products" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".ve-cart-simple-row")).toHaveCount(1);

    const row = page.locator(".ve-cart-simple-row").filter({ hasText: PRODUCT });
    await expect(row).toContainText("SKU BRK-PAD-F");
    await expect(row).toContainText("42,000");

    await row.locator("select").selectOption("2");
    await expect(row).toContainText("84,000");
    await expect(
      page.getByRole("link", { name: "Go to Checkout" }),
    ).toBeVisible();

    // 3. Checkout form.
    await page.getByRole("link", { name: "Go to Checkout" }).click();
    await expect(page).toHaveURL(/\/shop\/checkout/, { timeout: 30_000 });
    const section = page.locator('[data-qa-section="shop-checkout"]');
    await expect(section).toBeVisible({ timeout: 60_000 });

    await fillCheckoutForm(page);
    await page.getByRole("button", { name: "Pay with Paystack" }).click();

    // 4. The server received the order we built from the basket.
    await expect
      .poll(() => store.checkoutRequests.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const payload = store.checkoutRequests[0]!;
    expect(payload.customerName).toBe("Ada Obi");
    expect(payload.customerEmail).toBe("ada@example.com");
    expect(payload.customerPhone).toBe("08012345678");
    expect(payload.fulfillment).toBe("delivery");
    expect(payload.lines).toEqual([{ itemId: "p_brake", qty: 2 }]);
    expect(payload.callbackUrl).toContain("/shop/confirmation");
    expect(payload.notes).toContain(
      "Delivery address: 12 Alexander Road, Ikoyi, Abuja, Nigeria",
    );
    expect(payload.notes).toContain("Call on arrival");

    // 5. Paystack hands the customer back to our confirmation page.
    await page.waitForURL(
      new RegExp(`/shop/confirmation\\?ref=${ORDER_REF}`),
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("heading", { name: "Thanks for your order!" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".ve-thanks__ref")).toContainText(ORDER_REF);
    await expect(
      page.getByText("Payment confirmed — order is with the workshop."),
    ).toBeVisible();

    // 6. Receipt carries the same line and total the cart showed.
    const receipt = page.locator(".shop-receipt-block");
    await expect(receipt).toContainText(PRODUCT);
    await expect(receipt).toContainText("84,000");

    // 7. Basket is emptied once the order is placed.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            try {
              const raw = localStorage.getItem("vonos-shop-cart-v2");
              if (!raw) return -1;
              const parsed = JSON.parse(raw) as {
                state?: { lines?: unknown[] };
              };
              return parsed.state?.lines?.length ?? -1;
            } catch {
              return -1;
            }
          }),
        { timeout: 15_000 },
      )
      .toBe(0);
  });

  test("rejects an incomplete or invalid form before calling the API", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const store = await installStoreMock(page);

    await addFromCatalog(page, PRODUCT);
    await page.goto("/shop/checkout", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-qa-section="shop-checkout"]'),
    ).toBeVisible({ timeout: 60_000 });

    // Everything required is empty.
    await page.getByRole("button", { name: "Pay with Paystack" }).click();
    await expect(page.locator(".ve-checkout-error")).toHaveText(
      "Please complete all required fields.",
    );

    // Complete except the email, which must be rejected too.
    await fillCheckoutForm(page);
    await page.locator("#checkout-email").fill("not-an-email");
    await page.getByRole("button", { name: "Pay with Paystack" }).click();
    await expect(page.locator(".ve-checkout-error")).toHaveText(
      "Enter a valid email address.",
    );

    // No order was created and we never left the page.
    expect(store.checkoutRequests).toHaveLength(0);
    await expect(page).toHaveURL(/\/shop\/checkout/);
    await expect(
      page.locator('[data-qa-section="shop-checkout"]'),
    ).toBeVisible();
  });
});
