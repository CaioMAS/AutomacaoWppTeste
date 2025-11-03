// src/services/checkMeetingsMissingDay.ts
import cron from 'node-cron';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { enviarMensagemContato } from './whatsappService';
import { initDb } from '../db/registro';

// =========================
// AUTH & CALENDAR CLIENT
// =========================
const auth = new JWT({
  email: process.env.GOOGLE_CALENDAR_EMAIL,
  key: process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.split(String.raw`\n`).join('\n') || '',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

// =========================
// CONFIG
// =========================
const tz = process.env.TIMEZONE || 'America/Sao_Paulo';
const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

// =========================
// HELPERS DE EXTRAÇÃO
// =========================
const extrairClienteDoSummary = (summary?: string) => {
  if (!summary) return undefined;
  const m = summary.match(/Reuni[aã]o\s+com\s+(.+)/i);
  if (!m) return summary.trim();
  const bruto = m[1].trim();
  // corta qualquer sufixo depois de separadores comuns
  const nome = bruto.split(/\s[-–—|]\s|[-–—|]/)[0]?.trim();
  return nome || bruto;
};

const extrairChefe = (descricao: string) => {
  const m = descricao.match(/(?:chefe|coordenador|consultor)\s*[:\-]\s*([^\n]+)/i);
  if (!m) return undefined;
  const bruto = m[1].trim();
  const nome = bruto.split(/\s[-–—|]\s|[-–—|]/)[0]?.trim();
  return nome || bruto;
};

const extrairNumero = (descricao: string) => descricao.match(/\d{12,13}/)?.[0];

// =========================
// TZ HELPERS (MESMO PADRÃO DO getMeetings)
// =========================
const parseYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
};

// Pega o offset do fuso no instante informado (em minutos)
function tzOffsetMinutes(timeZone: string, instantUTC: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(instantUTC);
  const name = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2]);
  const mm = m[3] ? Number(m[3]) : 0;
  return sign * (hh * 60 + mm);
}

// Retorna [00:00 do dia, 00:00 do dia seguinte) em UTC, respeitando o TZ
function dayWindowToUTC(day: string, timeZone: string): { timeMin: string; timeMax: string } {
  const { y, m, d } = parseYMD(day);
  // meio-dia como “instante seguro” pra capturar o offset do dia
  const guess = new Date(Date.UTC(y, m, d, 12, 0, 0));
  const off = tzOffsetMinutes(timeZone, guess); // ex.: -180 para GMT-3

  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - off * 60_000;
  const endUtcMs   = Date.UTC(y, m, d + 1, 0, 0, 0, 0) - off * 60_000; // EXCLUSIVO

  return { timeMin: new Date(startUtcMs).toISOString(), timeMax: new Date(endUtcMs).toISOString() };
}

// Hoje (YYYY-MM-DD) no TZ alvo
function hojeYMD(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { // yyyy-mm-dd
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// =========================
// FORMATAÇÃO LOCAL (APENAS PARA TEXTO)
// =========================
const formatHoraLocal = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso));

// =========================
// ENVIO DIÁRIO (8h) PARA TODOS DO DIA
// =========================
export async function checkMeetingsMissingDay(): Promise<void> {
  const db = await initDb();

  // Janela do DIA de hoje respeitando o TZ
  const ymd = hojeYMD();
  const { timeMin, timeMax } = dayWindowToUTC(ymd, tz);

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

  const events = res.data.items || [];

  for (const event of events) {
    const startISO = event.start?.dateTime;
    if (!startISO || !event.id) continue; // ignora dia inteiro ou sem id

    const descricao = event.description || '';
    const clienteNome = extrairClienteDoSummary(event.summary || '') || 'Cliente';
    const chefeNome = extrairChefe(descricao) || 'Responsável';
    const numero = extrairNumero(descricao);
    if (!numero) continue;

    const horaFmt = formatHoraLocal(startISO);

    const mensagem =
`📌 Oi, ${clienteNome}! Passando para lembrar que sua reunião sobre o *Desafio Empreendedor* com *${chefeNome}* está agendada para hoje às ${horaFmt}.`;

    // Deduplicação específica deste envio diário (sem mudar schema):
    const key = `${startISO}|daily08h`;
    const alreadySent = await db.get(
      'SELECT 1 FROM sent_reminders WHERE event_id = ? AND start_time = ?',
      event.id,
      key
    );
    if (alreadySent) continue;

    await enviarMensagemContato(numero, mensagem);

    await db.run(
      'INSERT INTO sent_reminders (event_id, start_time) VALUES (?, ?)',
      event.id,
      key
    );
  }

  await db.close();
}

// =========================
// AGENDADOR: roda todo dia às 08:00 no TZ configurado
// =========================
export function iniciarCheckMeetingsMissingDay8h(): void {
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('⏰ Executando lembretes do dia (08:00)...');
      await checkMeetingsMissingDay();
      console.log('✅ Lembretes do dia enviados.');
    } catch (err) {
      console.error('❌ Erro ao enviar lembretes do dia:', (err as any)?.message || err);
    }
  }, { timezone: tz });
}
