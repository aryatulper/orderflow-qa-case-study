const { test, expect } = require("@playwright/test");
test("Sepete bir adet Canvas Tote eklenir", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.getByLabel("Email address", { exact: true }).fill("arya@example.test");
    await page.getByLabel("Password" ,{exact : true}).fill("demo123");
    await page.getByRole("button", {
    name: "Sign in",
    exact: true
}).click();
await expect(
    page.getByText("Arya Customer · customer", { exact: true })
).toBeVisible();
await page.getByRole("button", {
    name: "Add Canvas Tote to cart",
    exact: true
}).click();
await expect(
    page.locator("#cart-items")
        .getByText("1 × Canvas Tote", { exact: true })
).toBeVisible();
await expect(page.locator("#cart-total")).toHaveText("TRY 249.00");
});

test("Sepete iki adet Canvas Tote eklenince toplam doğru hesaplanır", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.getByLabel("Email address", { exact: true }).fill("arya@example.test");
    await page.getByLabel("Password" ,{exact : true}).fill("demo123");
    await page.getByRole("button", {
    name: "Sign in",
    exact: true
}).click();
await expect(
    page.getByText("Arya Customer · customer", { exact: true })
).toBeVisible();
await page.getByRole("button", {
    name: "Add Canvas Tote to cart",
    exact: true
}).click();
await page.getByRole("button", {
    name: "Add Canvas Tote to cart",
    exact: true
}).click();
await expect(
    page.locator("#cart-items")
        .getByText("2 × Canvas Tote", { exact: true })
).toBeVisible();
await expect(page.locator("#cart-total")).toHaveText("TRY 498.00");
});

test("Sepetten ürün kaldırılınca sepet boşalır", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await page.getByLabel("Email address", { exact: true }).fill("arya@example.test");
    await page.getByLabel("Password" ,{exact : true}).fill("demo123");
    await page.getByRole("button", {
    name: "Sign in",
    exact: true
}).click();
await expect(
    page.getByText("Arya Customer · customer", { exact: true })
).toBeVisible();
await page.getByRole("button", {
    name: "Add Canvas Tote to cart",
    exact: true
}).click();
await expect(
    page.locator("#cart-items")
        .getByText("1 × Canvas Tote", { exact: true })
).toBeVisible();
await expect(page.locator("#cart-total")).toHaveText("TRY 249.00");

page.locator("#cart-items")
    .getByRole("button", {
        name: "Remove Canvas Tote",
        exact: true
    }).click();
    await expect(
    page.locator("#cart-total")
).toHaveText("TRY 0.00");
await expect(page.locator("#cart-items").getByText("Nothing in your cart yet.", {exact:true})).toBeVisible();
});
