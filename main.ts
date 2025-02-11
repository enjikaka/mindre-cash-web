import { createClient } from "jsr:@supabase/supabase-js@2";
import { eTag, ifNoneMatch } from "jsr:@std/http/etag";
import type { CleanedItem, Item, Store } from "./types.ts";
import { renderMemberPrompt, renderSavings, renderTable } from "./render.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_KEY")!,
);

const adminKey = Deno.env.get("ADMIN_KEY");

const svgLogo = await Deno.readTextFile("logo.svg");
const stylesheet = await Deno.readTextFile("style.css");

const currencyFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
});

function getNextSunday23h59(): string {
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7; // Days to next Sunday (0 = Sunday)
  const nextSunday = new Date(now);

  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(23, 59, 59, 999); // Set time to 23:59:59

  return nextSunday.toUTCString();
}

const getRandomInteger = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min)) + min;
};

const randomUnicodes = [
  "𜵐",
  "𜵑",
  "𜵒",
  "𜵓",
  "𜵔",
  "𜵕",
  "𜵖",
  "𜵗",
  "𜵘",
  "𜵙",
  "𜵚",
  "𜵛",
  "𜵜",
  "𜵝",
  "𜵞",
  "𜵟",
];
const getRadomUnicodeLetter = () =>
  randomUnicodes[getRandomInteger(0, randomUnicodes.length - 1)];
const censor = () =>
  new Array(getRandomInteger(6, 12)).fill(0).map(() => getRadomUnicodeLetter())
    .join("");

async function getItems(query: string): Promise<Item[]> {
  const resource = await supabase
    .from("items")
    .select()
    .eq("q", query);

  return resource.data
    ? resource.data.sort((
      { unit_price: unitPriceA },
      { unit_price: unitPriceB },
    ) => unitPriceA - unitPriceB)
    : [];
}

async function getStores(): Promise<Store[]> {
  const resource = await supabase
    .from("stores")
    .select();

  return resource.data ?? [];
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "smör";
  const admin = Boolean(url.searchParams.get("admin") === adminKey) ?? false;

  let items = await getItems(query);
  const stores = await getStores();

  if (items.length === 0 || !stores || stores.length === 0) {
    return new Response("Not found", {
      status: 404,
    });
  }

  // Smarter filtering
  if (query === "mjölk") {
    items = items.filter(({ title }) => !title.includes("kaffe"));
  }

  if (query === "kaffe") {
    items = items.filter(({ unit }) => unit === "kg");
  }

  const unit = items[0].unit;
  const savingsPercent =
    ((items[0].unit_price / items[items.length - 1].unit_price) * 100).toFixed(
      0,
    );
  const savingsAmount = currencyFormatter.format(
    Math.abs(items[items.length - 1].unit_price - items[0].unit_price),
  );

  const censoredCount = !admin ? Math.floor(items.length / 2) : 0;

  const cleanedItems = items
    .filter((_, i, arr) => admin ? true : i / arr.length >= 0.5)
    .map((item: Item): CleanedItem => {
      const storeName = stores.find((x) => x.uuid === item.store_uuid)?.name ??
        String(item.store_uuid);
      const itemPrice = currencyFormatter.format(item.item_price);
      const unitPrice = currencyFormatter.format(item.unit_price);

      return {
        storeName,
        itemPrice,
        unitPrice,
        title: item.title,
      };
    });

  const listItems = cleanedItems
    .map((
      item,
    ) => [item.title, item.storeName, item.itemPrice, item.unitPrice]);

  if (censoredCount > 0) {
    listItems.unshift([censor(), censor(), censor(), censor()]);
  }

  const body = `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
            <style>${stylesheet}</style>
        </head>
        <body>
            <header>
                ${svgLogo}
                <h1>Spendera <strong>mindre cash</strong> på <strong>${query}</strong> i Arvika</h1>
                <p>Det billigaste priset på dina favoritvaror!</p>
            </header>
            <nav>
              <a href="?q=smör">Smör</a>
              <a href="?q=mjölk">Mjölk</a>
              <a href="?q=kaffe">Kaffe</a>
              <a href="?q=fläskfilé">Fläskfilé</a>
            </nav>
            <p>${renderSavings(query, unit, savingsAmount, savingsPercent)}</p>
            <p>${renderMemberPrompt(admin, censoredCount)}</p>
            ${renderTable(listItems)}
            <footer>
              <small>Ett projekt från <a href="https://glatek.se">Glatek</a></small>
            </footer>
          </body>
        </html>
    `;

  const etag = await eTag(JSON.stringify(items));

  const ifNoneMatchValue = req.headers.get("if-none-match");

  if (!ifNoneMatch(ifNoneMatchValue, etag)) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  return new Response(body, {
    headers: new Headers({
      "content-type": "text/html",
      "cache-control": "public, max-age=604800, immutable",
      "expires": getNextSunday23h59(),
      "etag": etag,
    }),
  });
});
