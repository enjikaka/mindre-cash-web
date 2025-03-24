import { createClient } from "jsr:@supabase/supabase-js";
import { eTag, ifNoneMatch } from "jsr:@std/http/etag";
import type { CleanedItem, Item, Store } from "./types.ts";
import { renderMemberPrompt, renderSavings, renderTable } from "./render.ts";

// Add error handling for Supabase initialization
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
const censor = (seed: number) =>
  new Array(getRandomInteger(seed / 2, seed)).fill(0).map(() =>
    getRadomUnicodeLetter()
  )
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

// Add input sanitization and move filtering logic to a separate function
function filterItems(items: Item[], query: string): Item[] {
  if (items.length === 0) return items;

  const filters: Record<string, (item: Item) => boolean> = {
    "smör": ({ title }) => !title.toLocaleLowerCase().includes("redbart"),
    "mjölk": ({ title }) => !title.toLocaleLowerCase().includes("kaffe"),
    "kaffe": ({ unit }) => unit === "kg",
  };

  return filters[query] ? items.filter(filters[query]) : items;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // Add input sanitization
  const query = url.searchParams.get("q")?.toLowerCase().trim() ?? "smör";
  const admin = Boolean(url.searchParams.get("admin") === adminKey) ?? false;

  let items = await getItems(query);
  const stores = await getStores();

  if (items.length === 0 || !stores || stores.length === 0) {
    return new Response("Not found", {
      status: 404,
    });
  }

  // Replace the if-conditions with the new filtering function
  items = filterItems(items, query);

  const unit = items[0].unit;
  const savingsPercent =
    ((1 - (items[0].unit_price / items[items.length - 1].unit_price)) * 100)
      .toFixed(0);
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
      const marks = [];

      if (item.organic) {
        marks.push('<span title="ekologisk">🌱</span>');
      }

      if (
        item.country_of_origin?.toLocaleLowerCase().includes("sweden") ||
        item.country_of_origin?.toLocaleLowerCase().includes("sverige") ||
        item.title.toLocaleLowerCase().includes("svenskt")
      ) {
        marks.push('<span title="från Sverige">🇸🇪</span>');
      }

      return {
        marks: marks.join(" "),
        storeName,
        itemPrice,
        unitPrice,
        title: item.title,
      };
    });

  const listItems = cleanedItems
    .map((
      item,
    ) => [
      item.marks,
      item.title,
      item.storeName,
      item.itemPrice,
      item.unitPrice,
    ]);

  if (censoredCount > 0) {
    listItems.unshift([censor(2), censor(12), censor(8), censor(6), censor(6)]);
  }

  const storeName = admin
    ? stores.find((x) => x.uuid === items[0].store_uuid)?.name ??
      String(items[0].store_uuid)
    : censor(12);

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
              <strong>Mejeri</strong>
              <section>
                <a href="?q=smör">Smör</a>
                <a href="?q=mjölk">Mjölk</a>
                <a href="?q=gouda">Gouda</a>
                <a href="?q=yoghurt%20naturell">Yoghurt</a>
              </section>
              <strong>Lyx</strong>
              <section>
                <a href="?q=kaffe">Kaffe</a>
                <a href="?q=löjrom">Löjrom</a>
              </section>
              <strong>Kött</strong>
              <section>
                <a href="?q=fläskfilé">Fläskfilé</a>
                <a href="?q=kycklingfilé">Kycklingfilé</a>
                <a href="?q=blandfärs">Blandfärs</a>
                <a href="?q=nötfärs">Nötfärs</a>
              </section>
              <strong>Frukt & grönt</strong>
              <section>
                <a href="?q=banan">Banan</a>
                <a href="?q=äpple%20royal%20gala">Äpple</a>
                <a href="?q=vitkål">Vitkål</a>
                <a href="?q=isbergssallat">Isbergssallat</a>
              </section>
            </nav>
            <p>${
    renderSavings(query, unit, savingsAmount, savingsPercent, storeName)
  }</p>
            <p>${renderMemberPrompt(admin, censoredCount)}</p>
            ${renderTable(listItems)}
            <footer>
              <small>Ett projekt från <a href="https://glatek.se">Glatek</a></small>
            </footer>
            <script defer data-domain="mindre.cash" src="https://plausible.glate.ch/js/script.js"></script>
          </body>
        </html>
    `;

  const etag = await eTag(body);

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
