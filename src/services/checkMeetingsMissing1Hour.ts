import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { enviarMensagemContato } from '../services/whatsappService';
import { initDb } from '../db/registro';

// 🔎 extrai o NOME DO CLIENTE do summary: "Reunião com <nome>"
const extrairClienteDoSummary = (summary?: string) => {
  if (!summary) return undefined;
  const m = summary.match(/Reuni[aã]o\s+com\s+(.+)/i);
  if (!m) return summary.trim();

  // Pega tudo depois do "com " e corta possíveis complementos após separadores
  const bruto = m[1].trim();
  // Se houver sufixos como " - ", " | ", " – ", " — ", pega só o primeiro trecho
  const nome = bruto.split(/\s[-–—|]\s|[-–—|]/)[0]?.trim();
  return nome || bruto;
};

// 🔎 extrai o NOME DO CHEFE da descrição (aceita "Chefe:", "Coordenador:", "Consultor:")
const extrairChefe = (descricao: string) => {
  const m = descricao.match(/(?:chefe|coordenador|consultor)\s*[:\-]\s*([^\n]+)/i);
  if (!m) return undefined;
  const bruto = m[1].trim();
  const nome = bruto.split(/\s[-–—|]\s|[-–—|]/)[0]?.trim();
  return nome || bruto;
};

// 🔎 extrai número (12 a 13 dígitos, com DDI+DDD) da descrição
const extrairNumero = (descricao: string) => descricao.match(/\d{12,13}/)?.[0];

const auth = new JWT({
  email: process.env.GOOGLE_CALENDAR_EMAIL,
  key:
    process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.split(String.raw`\n`).join('\n') ||
    '',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

export async function checkMeetingsMissing1Hour() {
  const db = await initDb();
  const tz = process.env.TIMEZONE || 'America/Sao_Paulo';
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  // Instantes UTC para cálculo (sem tocar em TZ)
  const now = new Date();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];

  // Apenas para exibir hora local quando montar a mensagem
  const formatHoraLocal = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  const formatDataLocal = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));

  for (const event of events) {
    const startISO = event.start?.dateTime; // ex.: "2025-09-23T19:20:00-03:00"
    if (!startISO || !event.id) continue;

    // ✅ Cálculo em UTC puro (sem reaplicar fuso)
    const startDate = new Date(startISO);
    const diffMin = Math.round((startDate.getTime() - Date.now()) / 60_000);

    // Janela ~1h (ajuste conforme o polling)
    if (diffMin >= 59 && diffMin <= 66) {
      // Evita duplicidade (ID + horário de início ISO)
      const alreadySent = await db.get(
        'SELECT 1 FROM sent_reminders WHERE event_id = ? AND start_time = ?',
        event.id,
        startISO
      );
      if (alreadySent) continue;

      const descricao = event.description || '';

      // ✅ cliente certo: extrai do summary após "Reunião com"
      const clienteNome =
        extrairClienteDoSummary(event.summary || '') || 'Cliente';

      // ✅ chefe certo: extrai de "Chefe:" na descrição
      const chefeNome = extrairChefe(descricao) || 'Responsável';

      const numero = extrairNumero(descricao);
      if (!numero) continue;

      // 📅 Exibição em TZ local APENAS para o texto (sem afetar cálculo)
      const dataFmt = formatDataLocal(startISO); // "23/09/2025"
      const horaFmt = formatHoraLocal(startISO); // "19:20"

      const mensagem = `⏰ Oi, ${clienteNome}! Sua reunião do *Desafio Empreendedor* com o *${chefeNome}* começa daqui a 1 hora.
📅 ${dataFmt} às ${horaFmt}`;

      await enviarMensagemContato(numero, mensagem);

      await db.run(
        'INSERT INTO sent_reminders (event_id, start_time) VALUES (?, ?)',
        event.id,
        startISO
      );
    }
  }

  await db.close();
}
