import { createClient } from "jsr:@supabase/supabase-js@2";
import { eTag, ifNoneMatch } from "jsr:@std/http/etag";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_KEY")!,
);

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

const getRandomInteger = (min, max) => {
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
const censor = (str) =>
  new Array(getRandomInteger(6, 12)).fill(0).map(() => getRadomUnicodeLetter())
    .join("");

async function getItems(query: string) {
  let resource = await supabase
    .from("items")
    .select()
    .eq("q", query);

  return resource.data.sort((
    { unit_price: unitPriceA },
    { unit_price: unitPriceB },
  ) => unitPriceA - unitPriceB);
}

async function getStores() {
  let resource = await supabase
    .from("stores")
    .select();

  return resource.data;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "smör";
  const admin = Boolean(url.searchParams.get("admin") === "true") ?? false;

  let items = await getItems(query);
  const stores = await getStores();

  if (items.length === 0) {
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

  const cleanedItems = items
    .map((item, i) => {
      const storeName = stores.find((x) => x.uuid === item.store_uuid).name;
      const itemPrice = currencyFormatter.format(item.item_price);
      const unitPrice = currencyFormatter.format(item.unit_price);

      if (!admin && i / items.length < 0.5) {
        item.title = censor(item.title);
        item.storeName = censor(storeName);
        item.itemPrice = censor(itemPrice);
        item.unitPrice = censor(unitPrice);
        item.censored = true;
      } else {
        item.storeName = storeName;
        item.itemPrice = itemPrice;
        item.unitPrice = unitPrice;
        item.censored = false;
      }

      return item;
    });

  // If censored items exists, only render one of them.
  const itemsToRender = cleanedItems[0].censored
    ? [
      cleanedItems[0],
      ...cleanedItems.filter((item) => !item.censored),
    ]
    : cleanedItems;

  const savings =
    `Kolla där! Du kan spara hela ${savingsAmount}/${unit} på ${query}.<br>Skillnaden mellan den billigaste och dyraste varan är <span class="savings">${savingsPercent} %</span>!`;
  const memberPrompt = !admin
    ? `<div class="feedback-danger">De ${
      itemsToRender.filter((x) => x.censored).length
    } billigaste varorna syns när du blir medlem.</div>`
    : "";

  const listItems = itemsToRender
    .map((item) => `
        <tr${item.censored ? ' class="censored"' : ""}>
            <td data-label="Namn">${item.title}</td>
            <td data-label="Kedja">${item.storeName}</td>
            <td data-label="Styckpris">${item.itemPrice}</td>
            <td data-label="Jämförelsepris">${item.unitPrice}</td>
        </tr>
    `).join("");

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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="shopping-basket"><path d="M14,18a1,1,0,0,0,1-1V15a1,1,0,0,0-2,0v2A1,1,0,0,0,14,18Zm-4,0a1,1,0,0,0,1-1V15a1,1,0,0,0-2,0v2A1,1,0,0,0,10,18ZM19,6H17.62L15.89,2.55a1,1,0,1,0-1.78.9L15.38,6H8.62L9.89,3.45a1,1,0,0,0-1.78-.9L6.38,6H5a3,3,0,0,0-.92,5.84l.74,7.46a3,3,0,0,0,3,2.7h8.38a3,3,0,0,0,3-2.7l.74-7.46A3,3,0,0,0,19,6ZM17.19,19.1a1,1,0,0,1-1,.9H7.81a1,1,0,0,1-1-.9L6.1,12H17.9ZM19,10H5A1,1,0,0,1,5,8H19a1,1,0,0,1,0,2Z"></path></svg>
                <h1>Spendera <strong>mindre cash</strong> på <strong>${query}</strong> i Arvika</h1>
                <p>Det billigaste priset på dina favoritvaror!</p>
            </header>
            <nav>
            <a href="?q=smör">Smör</a>
            <a href="?q=mjölk">Mjölk</a>
            <a href="?q=kaffe">Kaffe</a>
            <a href="?q=fläskfilé">Fläskfilé</a>
            </nav>
            <p>${savings}</p>
            <p>${memberPrompt}</p>
            <table>
                <thead>
                    <tr>
                        <th>Namn</th>
                        <th>Kedja</th>
                        <th>Styckpris</th>
                        <th>Jämförelsepris</th>
                    </tr>
                </thead>
                <tbody>
                    ${listItems}
                </tbody>
            </table>
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
