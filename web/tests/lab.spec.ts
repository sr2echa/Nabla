import { expect, test, type Page } from "@playwright/test";

async function assertCleanCharts(page: Page, expectedCount: number) {
  const info = await page.evaluate(() => {
    const p = document.querySelector<HTMLElement>(".paper > p:not(.lede)");
    const pWidth = p ? p.getBoundingClientRect().width : 0;
    const figures = [...document.querySelectorAll<HTMLElement>(".chart-figure")];
    const allowedBgs = new Set(["rgba(0, 0, 0, 0)", "transparent", "rgb(243, 241, 235)"]);
    const badContainers: string[] = [];
    const widerThanPara: string[] = [];
    for (const fig of figures) {
      const rect = fig.getBoundingClientRect();
      if (pWidth > 0 && rect.width > pWidth + 1) {
        widerThanPara.push(`${rect.width.toFixed(1)} > ${pWidth.toFixed(1)}`);
      }
      const s = getComputedStyle(fig);
      if (!allowedBgs.has(s.backgroundColor)) {
        badContainers.push(`figure bg=${s.backgroundColor}`);
      }
      if (s.borderLeftStyle !== "none" || s.borderRightStyle !== "none" || s.borderBottomStyle !== "none") {
        badContainers.push(`figure borders=${s.borderLeftStyle}/${s.borderRightStyle}/${s.borderBottomStyle}`);
      }
    }
    const charts = [...document.querySelectorAll<HTMLElement>(".shadcn-chart")];
    for (const c of charts) {
      const bg = getComputedStyle(c).backgroundColor;
      if (!allowedBgs.has(bg)) {
        badContainers.push(`chart bg=${bg}`);
      }
    }

    const svgs = [...document.querySelectorAll<SVGSVGElement>(".shadcn-chart svg.recharts-surface")];
    const zeroSized = svgs.filter((s) => {
      const r = s.getBoundingClientRect();
      return r.width < 50 || r.height < 50;
    }).length;
    const nanAttrs: string[] = [];
    const unboldedNabla: string[] = [];
    for (const s of svgs) {
      const sBg = getComputedStyle(s).backgroundColor;
      if (!allowedBgs.has(sBg)) {
        badContainers.push(`svg bg=${sBg}`);
      }
      for (const t of s.querySelectorAll<SVGTextElement>("text")) {
        if ((t.textContent ?? "").includes("Nabla")) {
          const fw = Number(getComputedStyle(t).fontWeight);
          if (!Number.isFinite(fw) || fw < 700) {
            unboldedNabla.push(`${t.textContent}=${getComputedStyle(t).fontWeight}`);
          }
        }
      }
      for (const el of s.querySelectorAll("*")) {
        for (const attr of ["d", "cx", "cy", "x", "y", "x1", "x2", "y1", "y2", "width", "height"]) {
          const v = el.getAttribute(attr);
          if (v && v.includes("NaN")) nanAttrs.push(`${el.tagName}@${attr}=${v}`);
        }
      }
    }
    return { count: svgs.length, zeroSized, nanAttrs, badContainers, widerThanPara, unboldedNabla };
  });
  expect(info.count).toBe(expectedCount);
  expect(info.zeroSized).toBe(0);
  expect(info.nanAttrs).toEqual([]);
  expect(info.badContainers).toEqual([]);
  expect(info.widerThanPara).toEqual([]);
  expect(info.unboldedNabla).toEqual([]);
}

async function assertMinBoldNablaLabels(page: Page, minCount: number) {
  const count = await page.evaluate(() => {
    const texts = [...document.querySelectorAll<SVGTextElement>(".shadcn-chart svg.recharts-surface text")];
    return texts.filter((t) => (t.textContent ?? "").includes("Nabla") && Number(getComputedStyle(t).fontWeight) >= 700).length;
  });
  expect(count).toBeGreaterThanOrEqual(minCount);
}

test("the notes are the front page and the board fits the play page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/∇ Nabla/);
  await expect(page.locator("h1")).toContainText("∇");
  await expect(page.getByRole("link", { name: /Try it out/ })).toHaveAttribute("href", "/play");
  await expect(page.locator(".math .katex")).toHaveCount(3);
  await expect(page.locator(".shadcn-chart svg.recharts-surface")).toHaveCount(4, { timeout: 10000 });
  await assertCleanCharts(page, 4);
  await assertMinBoldNablaLabels(page, 6);

  // Interactive chart toggles & diagnostics tabs
  await page.getByRole("button", { name: "Data table" }).click();
  await expect(page.locator(".chart-figure table.results tbody tr")).toHaveCount(15);
  await page.getByRole("button", { name: "Chart", exact: true }).click();
  await assertCleanCharts(page, 4);

  await page.getByRole("button", { name: "Time / move (ms)" }).click();
  await assertCleanCharts(page, 4);
  await assertMinBoldNablaLabels(page, 6);

  await page.getByRole("button", { name: "Level 0 (6 terms)" }).click();
  await assertCleanCharts(page, 4);

  await page.getByRole("tab", { name: "Temperature & Blunders" }).click();
  await assertCleanCharts(page, 4);
  await page.getByRole("button", { name: "Blunder Rate & ACPL" }).click();
  await assertCleanCharts(page, 4);
  await assertMinBoldNablaLabels(page, 9);

  await page.getByRole("tab", { name: "Tactics & Endgames" }).click();
  await assertCleanCharts(page, 4);
  await page.getByRole("button", { name: /WAC-300/ }).click();
  await assertCleanCharts(page, 4);
  await assertMinBoldNablaLabels(page, 9);

  await page.getByRole("tab", { name: "Static Eval" }).click();
  await assertCleanCharts(page, 4);
  await page.getByRole("button", { name: "Per-term Spearman ρ" }).click();
  await assertCleanCharts(page, 4);

  const notesFit = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(notesFit).toBeTruthy();

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
  expect(errors).toEqual([]);
});

test("a narrow screen stacks the reading under the board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".shadcn-chart svg.recharts-surface")).toHaveCount(4, { timeout: 10000 });
  await assertCleanCharts(page, 4);
  const notesWide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(notesWide).toBeTruthy();

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
