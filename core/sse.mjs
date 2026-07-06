// Минимальный SSE-ридер (text/event-stream) без зависимостей.
// Формат кадра — стандарт WHATWG: строки "field: value", пустая строка = конец сообщения.
// Использование:
//   const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`,
//     'X-Api-Token': apiToken, Accept: 'text/event-stream', 'Cache-Control': 'no-cache' } });
//   for await (const msg of readSseMessages(res)) { ... }

export async function* readSseMessages(response) {
  if (!response.ok) throw new Error(`SSE HTTP ${response.status}`);
  const decoder = new TextDecoder();
  let buf = '';
  let msg = emptyMessage();

  for await (const chunk of response.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);

      if (line === '') { // конец сообщения
        if (msg.data !== '') {
          msg.data = msg.data.replace(/\n$/, '');
          yield msg;
        }
        msg = emptyMessage();
        continue;
      }
      if (line.startsWith(':')) continue; // комментарий/keep-alive

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      switch (field) {
        case 'data': msg.data += value + '\n'; break;
        case 'event': msg.event = value; break;
        case 'id': msg.id = value; break;
        case 'retry': { const n = Number(value); if (Number.isFinite(n)) msg.retry = n; break; }
      }
    }
  }
  if (msg.data !== '') { msg.data = msg.data.replace(/\n$/, ''); yield msg; }
}

function emptyMessage() {
  return { id: undefined, event: undefined, data: '', retry: undefined };
}

export function parseSseData(data) {
  try { return JSON.parse(data); } catch { return data; }
}
