import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_KEY")!,
);

const currencyFormatter = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' });

function generateETag(content: string): string {
  // Simple ETag based on content hash (better to use crypto in real-world apps)
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  let hash = 0;
  
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 31 + data[i]) >>> 0;
  }

  return `"${hash.toString(16)}"`;
}

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

const randomUnicodes = ['𜵐', '𜵑', '𜵒', '𜵓', '𜵔', '𜵕', '𜵖', '𜵗', '𜵘', '𜵙', '𜵚', '𜵛', '𜵜', '𜵝', '𜵞', '𜵟'];
const getRadomUnicodeLetter = () => randomUnicodes[getRandomInteger(0, randomUnicodes.length - 1)];
const censor = str => new Array(getRandomInteger(6, 12)).fill(0).map(() => getRadomUnicodeLetter()).join('');

async function getItems(query: string) {
  let resource = await supabase
    .from("items")
    .select()
    .eq('q', query);

  return resource.data.sort(({ unit_price: unitPriceA }, { unit_price: unitPriceB }) => unitPriceA - unitPriceB);
}

async function getStores() {
  let resource = await supabase
    .from("stores")
    .select();

  return resource.data;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q') ?? 'smör';
  const admin = Boolean(url.searchParams.get('admin') === 'true') ?? false;

  let items = await getItems(query);
  const stores = await getStores();

  if (items.length === 0) {
    return new Response('Not found', {
      status: 404
    });
  }

  // Smarter filtering
  if (query === 'mjölk') {
    items = items.filter(({ title }) => !title.includes('kaffe'));
  }

  if (query === 'kaffe') {
    items = items.filter(({ unit }) => unit === 'kg');
  }

  const unit = items[0].unit;
  const savingsPercent = ((items[0].unit_price / items[items.length - 1].unit_price) * 100).toFixed(0);
  const savingsAmount = currencyFormatter.format(Math.abs(items[items.length - 1].unit_price - items[0].unit_price));
  
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

  const savings = `Kolla där! Du kan spara hela ${savingsAmount}/${unit} på ${query}.<br>Skillnaden mellan den billigaste och dyraste varan är <span class="savings">${savingsPercent} %</span>!`;
  const memberPrompt = !admin ? `<div class="feedback-danger">De ${cleanedItems.filter(x => x.censored).length} billigaste varorna syns när du blir medlem.</div>` : '';

  const listItems = cleanedItems
    .map((item) => `
        <tr${item.censored ? ' class="censored"' : ''}>
            <td data-label="Namn">${item.title}</td>
            <td data-label="Kedja">${item.storeName}</td>
            <td data-label="Styckpris">${item.itemPrice}</td>
            <td data-label="Jämförelsepris">${item.unitPrice}</td>
        </tr>
    `).join('');

  const body = `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
            <style>
            body {
              background-color: #FFFBEE;
              font-family: "Public Sans", serif;
              font-optical-sizing: auto;
              font-weight: 400;
              font-style: normal;  
              margin: 4em;
            }
            nav { display: flex; gap: 1rem; }
            nav a { flex: 1; color: currentcolor; text-align: center; transition: all 200ms ease; background-color: #d9beff; padding: .5em; &:hover { background-color:#f0e5ff } &:active { box-shadow: -2px 2px 0 black; background-color:#b37dff;  } }
            header strong { color: #FF8ACD; font-weight: 800; letter-spacing: -.5px }
            header svg { width: 128px; height: 128px; fill: #FF8ACD }
            th { border-bottom: 2px solid black }
            thead { position: sticky; top: 0 }
            table {
              background-color: white;
              width: 100%;
              text-rendering: optimizeLegibility;
              table-layout: fixed;
            }
            .savings {
              display: inline-block;
              padding: .5em 1em;
              margin: 0 .5em;
              background-color: #3cd39d;
              color: white;
              font-weight: 700;
              text-rendering: geometricPrecision;
            }
            .feedback-danger {
              background-color: #ff5454;
              padding: 1em;
            }
            .feedback-danger,
            nav a,
            table,
            .savings {
              border: 2px solid black;
              box-shadow: -4px 4px 0 black;
            }
            thead {
              background-color: #ffe959;
            }
            td:nth-child(2) { text-transform: capitalize; text-align: center }
            td:nth-child(3),
            td:nth-child(4) {
              text-rendering: geometricPrecision;
              text-align: right;
            }
            tbody tr:nth-child(even) {
              background-color: #e2e2e2;
            }
            th, td {
              padding: .4em;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            footer {
              text-align: center;
              margin: 1em 0;

              a {
                color: currentColor;
                text-decoration: none;

                &:hover { text-decoration: underline }
              }
            }
            @media screen and (max-width: 600px) {
              body {
                margin: 1em;
              }

              table thead {
                border: none;
                clip: rect(0 0 0 0);
                height: 1px;
                margin: -1px;
                overflow: hidden;
                padding: 0;
                position: absolute;
                width: 1px;
              }
              
              table tr {
                display: block;
                border-bottom: 2px solid black;
              }
              
              table td {
                border-bottom: 1px solid #e2e2e2;
                display: block;
              }
              
              table td::before {
                content: attr(data-label);
                float: left;
                font-weight: bold;
                text-transform: uppercase;
              }
              
              table td:last-child {
                border-bottom: 0;
              }

              td:nth-child(1),
              td:nth-child(2),
              td:nth-child(3),
              td:nth-child(4) {
                text-align: right;
              }
            }
            </style>
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

  const etag = generateETag(JSON.stringify(items));

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers }); // Not Modified
  }

  return new Response(body, {
      headers: new Headers({
          'content-type': 'text/html',
          'cache-control': "public, max-age=604800, immutable",
          'expires': getNextSunday23h59(),
          'etag': etag
      })
  });
});
