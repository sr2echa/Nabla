import { expect, test } from "@playwright/test";

test("the notes are the front page and the board fits the play page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/∇ Nabla/);
  await expect(page.locator("h1")).toContainText("∇");
  await expect(page.getByRole("link", { name: /Try it out/ })).toHaveAttribute("href", "/play");
  await expect(page.locator(".math .katex")).toHaveCount(3);

  await page.goto("/play");
  await expect(page.locator("piece.white.king")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#status")).toHaveText("White to move.");
  await expect(page.locator("#seat-bottom")).toHaveClass(/on/);

  const board = page.locator(".board");
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThan(2);

  const bar = await page.locator(".evalbar").boundingBox();
  const judge = await page.locator(".judge").boundingBox();
  const playbar = await page.locator(".playbar").boundingBox();
  const side = await page.locator(".side").boundingBox();
  expect(bar && box && bar.x + bar.width <= box.x + 2).toBeTruthy();
  expect(playbar && box && playbar.y > box.y + box.height - 8).toBeTruthy();
  expect(judge && side && judge.x >= side.x - 2 && judge.y <= side.y + 12).toBeTruthy();
  expect(side && box && side.x > box.x + box.width - 8).toBeTruthy();
  await expect(page.locator(".side .layers")).toBeVisible();
  const contained = await page.evaluate(() => {
    const column = document.querySelector(".column")?.getBoundingClientRect();
    const mast = document.querySelector(".mast")?.getBoundingClientRect();
    const bar = document.querySelector(".evalbar")?.getBoundingClientRect();
    const label = document.querySelector("#meter-read");
    const box = label?.getBoundingClientRect();
    const transform = label ? getComputedStyle(label).transform : "none";
    const matrix = transform === "none" ? null : new DOMMatrix(transform);
    const outside = (node: Element, host: DOMRect | undefined) => {
      const rect = node.getBoundingClientRect();
      return !host || rect.right > host.right + 1 || rect.left < host.left - 1 || rect.width < 8;
    };
    const clipped = [
      ...[...document.querySelectorAll(".playbar button")].filter((node) => outside(node, column)),
      ...[...document.querySelectorAll("#new-game")].filter((node) => outside(node, mast)),
    ].map((node) => (node as HTMLElement).id);
    return {
      clipped,
      rotated: !!matrix && Math.abs(matrix.b) > 0.2,
      nearBottom: !!bar && !!box && box.top >= bar.bottom - 2,
    };
  });
  expect(contained.clipped).toEqual([]);
  expect(contained.rotated).toBeFalsy();
  expect(contained.nearBottom).toBeTruthy();
  await expect(page.locator("[data-judge='maia']")).toHaveCount(0);
  await expect(page.locator("#pgn")).toBeVisible();
  const readingFits = await page.evaluate(() => {
    const side = document.querySelector(".side")?.getBoundingClientRect();
    const energy = document.querySelector("section.energy")?.getBoundingClientRect();
    const considered = document.querySelector(".considered")?.getBoundingClientRect();
    const rows = document.querySelectorAll("#candidates li").length;
    return {
      inside: !!side && !!considered && considered.top < side.bottom - 4 && considered.bottom <= side.bottom + 1,
      close: !!energy && !!considered && considered.top - energy.bottom < 48,
      rows,
    };
  });
  expect(readingFits.inside).toBeTruthy();
  expect(readingFits.close).toBeTruthy();
  expect(readingFits.rows).toBeLessThanOrEqual(8);
  const fitted = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= window.innerWidth + 1 && root.scrollHeight <= window.innerHeight + 2;
  });
  expect(fitted).toBeTruthy();

  await page.locator("#seat-bottom").click({ force: true });
  await expect(page.locator("#sheet")).toBeVisible();
  await expect(page.locator("#pace")).toBeVisible();
  await expect(page.locator("[data-pick='stockfish']")).toBeVisible();
  await expect(page.locator("#fish-elo")).toBeHidden();
  await page.locator("[data-pick='stockfish']").click();
  await expect(page.locator("#fish-elo")).toBeVisible();
  await page.locator("#sheet-close").click();

  const stack = await page.evaluate(() => {
    const piece = document.querySelector("piece.white.pawn");
    const canvas = document.querySelector("#fields");
    const wrap = document.querySelector("#board");
    return {
      parent: canvas?.parentElement?.className ?? "",
      piece: !!piece,
      wrapZ: wrap ? getComputedStyle(wrap).zIndex : "",
      canvasZ: canvas ? getComputedStyle(canvas).zIndex : "",
    };
  });
  expect(stack.parent).toContain("board");
  expect(stack.piece).toBeTruthy();
  expect(Number(stack.wrapZ)).toBeGreaterThan(Number(stack.canvasZ));

  await page.locator("#help-open").click();
  await expect(page.locator("#help")).toBeVisible();
  await page.locator("#legend-board .lm").first().hover({ force: true });
  await expect(page.locator("#legend-caption")).toContainText("White controls");
  await page.locator("#help-close").click();
  await expect(page.locator("#help .about")).toContainText("Pause the game and hover");
});

test("a narrow screen stacks the reading under the board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play");
  await expect(page.locator("piece.white.king")).toBeVisible({ timeout: 15000 });
  const board = await page.locator(".board").boundingBox();
  const judge = await page.locator(".judge").boundingBox();
  const side = await page.locator(".side").boundingBox();
  expect(board).not.toBeNull();
  expect(Math.abs((board?.width ?? 0) - (board?.height ?? 0))).toBeLessThan(2);
  expect(judge && board && judge.y > board.y).toBeTruthy();
  expect(side && board && side.y > board.y).toBeTruthy();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(wide).toBeTruthy();
});
