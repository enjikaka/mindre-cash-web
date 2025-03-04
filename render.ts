const html = String.raw;

export function renderSavings(
  query: string,
  unit: string,
  savingsAmount: string,
  savingsPercent: string,
) {
  return html`Kolla där! Du kan spara hela ${savingsAmount}/${unit} på ${query}.<br>Skillnaden mellan den billigaste och dyraste varan är <span class="savings">${savingsPercent} %</span>!`;
}

export function renderMemberPrompt(isAdmin: boolean, count: number) {
  return isAdmin
    ? ""
    : html`<div class="feedback-danger">De ${count} billigaste varorna är gömda, men syns när du blir medlem.</div>`;
}

export function renderTable(rows: string[][]) {
  const headers = [
    "Märkning",
    "Namn",
    "Kedja",
    "Styckpris",
    "Jämförelsepris",
  ];
  const tableHeaders = headers.map((h) => html`<th>${h}</th>`).join("");
  const tableRows = rows.map((cells) =>
    html`<tr>${
      cells.map((cell, i) => html`<td data-label="${headers[i]}">${cell}</td>`)
        .join("")
    }</tr>`
  ).join("");

  return html`
        <table>
            <thead>
                <tr>
                    ${tableHeaders}
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}
