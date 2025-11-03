// src/jobs/reminder30minutes.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';

import { enviarMensagemInstancia } from '../services/whatasappMensageGeneric'; // ajuste para whatsappService se for o seu caminho real
import { initDb } from '../db/registro';
import { getMeetings } from '../services/calendarService'; // caminho que você indicou

dayjs.extend(utc);
dayjs.extend(tz);

const DEFAULT_TZ = process.env.TIMEZONE || 'America/Sao_Paulo';
const KIND_30M = 'reminder_30m';

type E164Digits = string; // "5538999..."

const FIXED_INSTANCIA = 'AgenteIA';
const FIXED_NUMERO: E164Digits = '553399501851'; // sem @c.us

export interface Reminder30mOptions {
  instancia?: string;
  numeroDestino?: E164Digits;
  tz?: string;
  janelaMinutos?: { min: number; max: number }; // padrão 29..31
}

// ============ DEDUPE (SQLite) ============
const ensureTable = async () => {
  const db = await initDb();
  await db.run(
    `CREATE TABLE IF NOT EXISTS reminders_sent (
      event_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY (event_id, kind)
    )`
  );
};

const jaEnviado = async (eventId: string, kind: string) => {
  const db = await initDb();
  const row = await db.get(
    `SELECT 1 as ok FROM reminders_sent WHERE event_id = ? AND kind = ? LIMIT 1`,
    [eventId, kind]
  );
  return !!row?.ok;
};

const registrarEnvio = async (eventId: string, kind: string) => {
  const db = await initDb();
  await db.run(
    `INSERT OR IGNORE INTO reminders_sent (event_id, kind, sent_at) VALUES (?, ?, ?)`,
    [eventId, kind, new Date().toISOString()]
  );
};

// ============ UTIL ============
const formatarHoraCurta = (iso: string, tzIana: string) => {
  const d = dayjs(iso).tz(tzIana);
  const m = d.minute();
  return m === 0 ? `${d.hour()}h` : `${d.hour()}h${String(m).padStart(2, '0')}`;
};

// monta texto fixo (sem IA), omitindo linhas vazias
const montarBriefing = (dados: {
  minutos: number;
  horaLocal: string;
  cliente?: string;
  empresa?: string;
  cidade?: string;
  telefone?: string;
  endereco?: string;
  referido?: string;
  funcionarios?: string | number;
  faturamento?: string;
  observacoes?: string;
  instagram?: string;
}) => {
  const topLine =
    `Dentro de ${dados.minutos} minutos reuniao com ${dados.cliente || 'Cliente'}` +
    (dados.empresa ? ` (${dados.empresa}${dados.cidade ? ` – ${dados.cidade}` : ''})` : '');

  const linhas = [
    topLine,
    `⏰ ${dados.horaLocal}`,
    dados.telefone ? `📞 ${dados.telefone}` : '',
    dados.endereco ? `📍 ${dados.endereco}` : '',
    dados.referido ? `🔗 Referido por: ${dados.referido}` : '',
    dados.funcionarios ? `👥 ${dados.funcionarios}` : '',
    dados.faturamento ? `💰 Faturamento: ${dados.faturamento}` : '',
    dados.observacoes ? `💬 ${dados.observacoes}` : '',
    dados.instagram ? `🔗 Instagram: ${dados.instagram}` : '',
  ].filter(Boolean);

  return linhas.join('\n');
};

// ============ EXECUÇÃO ============
export const enviarReminders30mAgora = async (opts?: Reminder30mOptions) => {
  const tzIana = opts?.tz || DEFAULT_TZ;
  const janela = opts?.janelaMinutos || { min: 29, max: 31 };
  const instancia = (opts?.instancia || FIXED_INSTANCIA).trim();
  const numeroDestino = (opts?.numeroDestino || FIXED_NUMERO).trim();

  await ensureTable();

  // janela [agora+29min, agora+31min]
  const now = dayjs().tz(tzIana);
  const startISO = now.add(janela.min, 'minute').toDate().toISOString();
  const endISO = now.add(janela.max, 'minute').toDate().toISOString();

  // usa seu getMeetings (já com TZ e extendedProperties privatais)
  const meetings = await getMeetings({ start: startISO, end: endISO });

  for (const ev of meetings) {
    const eventId = ev.id || '';
    if (!eventId) continue;

    if (await jaEnviado(eventId, KIND_30M)) continue;

    const start = ev.start; // ISO
    if (!start) continue;

    const horaLocal = formatarHoraCurta(start, tzIana);

    // Campos vindos do seu DTO
    const cliente = ev.clienteNome;
    const telefone = ev.clienteNumero;           // entra só no texto; envio vai para FIXED_NUMERO
    const empresa = ev.empresaNome;
    const cidade = ev.cidadeOpcional;
    const endereco = ev.endereco || ev.location;
    const referido = ev.referidoPor;
    const funcionarios = ev.funcionarios;
    const faturamento = ev.faturamento;
    const observacoes = ev.observacoes;
    const instagram = ev.instagram;

    const mensagem = montarBriefing({
      minutos: 30,
      horaLocal,
      cliente,
      empresa,
      cidade,
      telefone,
      endereco,
      referido,
      funcionarios,
      faturamento,
      observacoes,
      instagram,
    });

    if (!mensagem) continue;

    // Envia para o número FIXO (ou sobrescrito via opts)
    await enviarMensagemInstancia(instancia, numeroDestino, mensagem);

    await registrarEnvio(eventId, KIND_30M);
  }

  return { ok: true, total: meetings.length };
};

// Estilo mensagemMotivacionalDiaria: função default que dispara imediatamente
export default function startReminder30Minutes(options?: Reminder30mOptions) {
  enviarReminders30mAgora(options).catch((e) =>
    console.error('Erro no reminder30minutes:', e?.message || e)
  );
  console.log(
    `🔔 Reminder 30m iniciado | Instância: ${options?.instancia || FIXED_INSTANCIA} | Destino: ${options?.numeroDestino || FIXED_NUMERO}`
  );
}
