import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { enviarMensagemContato } from '../services/whatsappService';
import { initDb } from '../db/registro';

// 🔎 extrai o NOME DO CLIENTE do summary: "Reunião com <nome>"
const extrairClienteDoSummary = (summary?: string) => {
  if (!summary) return undefined;
  const m = summary.match(/Reuni[aã]o\s+com\s+(.+)/i);
  if (!m) return summary.trim();

  const bruto = m[1].trim();
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

export async function checkMeetingsMissing24Hours() {
  console.log(`[24h] Início do job às ${new Date().toLocaleString('pt-BR')}`);

  const db = await initDb();
  const tz = process.env.TIMEZONE || 'America/Sao_Paulo';
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const now = new Date();

  // inclui eventos até o final de amanhã (pra garantir que o 24h consiga ver)
  const timeMax = new Date(Date.now() + 26 * 60 * 60 * 1000);

  console.log(`[24h] Buscando eventos...`);
  console.log(`[24h] timeMin=${now.toISOString()} | timeMax=${timeMax.toISOString()}`);

  let events: any[] = [];
  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    events = res.data.items || [];
    console.log(`[24h] Eventos encontrados: ${events.length}`);
  } catch (err) {
    console.error('[24h] ERRO ao buscar eventos no Google Calendar:', err);
  }

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

  try {
    for (const event of events) {
      const startISO = event.start?.dateTime;
      if (!startISO || !event.id) {
        console.log(`[24h] Evento sem startISO ou id — pulando. id=${event.id} start=${startISO}`);
        continue;
      }

      console.log(`\n[24h] Analisando evento: "${event.summary}" (${event.id})`);
      console.log(`[24h] Início: ${startISO}`);

      const startDate = new Date(startISO);
      const diffMin = Math.round((startDate.getTime() - Date.now()) / 60_000);
      console.log(`[24h] diffMin=${diffMin} (esperado entre 1425 e 1455)`);

      if (diffMin >= 1425 && diffMin <= 1455) {
        console.log(`[24h] ✅ Evento dentro da janela de 24h`);

        const alreadySent = await db.get(
          'SELECT 1 FROM sent_reminders_kinds WHERE event_id = ? AND start_time = ? AND kind = ?',
          event.id,
          startISO,
          '24h'
        );
        if (alreadySent) {
          console.log(`[24h] ⚠️ Já enviado anteriormente — pulando.`);
          continue;
        }

        const descricao = event.description || '';
        const clienteNome = extrairClienteDoSummary(event.summary || '') || 'Cliente';
        const chefeNome = extrairChefe(descricao) || 'Responsável';
        const numero = extrairNumero(descricao);

        if (!numero) {
          console.warn(`[24h] 🚫 Nenhum número válido encontrado na descrição — pulando envio.`);
          continue;
        }

        const dataFmt = formatDataLocal(startISO);
        const horaFmt = formatHoraLocal(startISO);

        const mensagem = `👋 Oi, ${clienteNome}! Passando só pra te lembrar que amanhã você tem sua reunião do *Desafio Empreendedor* com o *${chefeNome}*.
📅 ${dataFmt} às ${horaFmt}`;

        console.log(`[24h] Enviando mensagem para ${numero} | cliente="${clienteNome}" | chefe="${chefeNome}"`);
        console.log(`[24h] Conteúdo da mensagem: ${mensagem.replace(/\n/g, ' ')}`);

        try {
          await enviarMensagemContato(numero, mensagem);
          console.log(`[24h] ✅ Mensagem enviada com sucesso.`);
        } catch (sendErr) {
          console.error(`[24h] ❌ Erro ao enviar mensagem para ${numero}:`, sendErr);
        }

        try {
          await db.run(
            'INSERT INTO sent_reminders_kinds (event_id, start_time, kind) VALUES (?, ?, ?)',
            event.id,
            startISO,
            '24h'
          );
          console.log(`[24h] 📦 Registro gravado no DB com sucesso.`);
        } catch (dbErr) {
          console.error(`[24h] ❌ Erro ao registrar no DB:`, dbErr);
        }
      } else {
        console.log(`[24h] ⏳ Fora da janela (1425–1455). diffMin=${diffMin} — não envia.`);
      }
    }
  } catch (err) {
    console.error('[24h] ERRO dentro do loop de eventos:', err);
  }

  await db.close();
  console.log('\n[24h] 🔚 Fim do job.\n');
}
