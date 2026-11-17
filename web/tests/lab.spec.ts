import { expect, test } from "@playwright/test";

test("the board is square, the judge is on the left, and a piece is not covered", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/∇ Nabla/);
  await expect(page.locator("h1")).toContainText("∇");
  await expect(page.locator("#status")).toHaveText("White to move.", { timeout: 15000 });

  const board = page.locator(".square-board");
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThan(2);

  const judge = await page.locator(".judge").boundingBox();
  const panel = await page.locator(".panel").boundingBox();
  expect(judge && box && judge.x < box.x).toBeTruthy();
  expect(panel && box && panel.x > box.x).toBeTruthy();

  const stack = await page.evaluate(() => {
    const piece = document.querySelector("piece.white.pawn");
    const canvas = document.querySelector("#fields");
    return {
      parent: canvas?.parentElement?.tagName ?? "",
      pieceZ: getComputedStyle(piece!).zIndex,
      canvasZ: getComputedStyle(canvas!).zIndex,
    };
  });
  expect(stack.parent).toBe("CG-BOARD");
  expect(Number(stack.pieceZ)).toBeGreaterThan(Number(stack.canvasZ));

  await page.locator("#legend-board .lm").first().hover();
  await expect(page.locator("#legend-caption")).toContainText("White controls");
  await expect(page.locator(".math .katex")).toHaveCount(3);
});
