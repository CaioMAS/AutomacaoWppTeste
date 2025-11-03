// src/jobs/mensagemMotivacionalDiaria.ts
import cron, { ScheduledTask } from "node-cron";
import { gerarMensagemGemini } from "../ai/IAservice";
import { enviarMensagemInstancia } from "../services/whatasappMensageGeneric";

const DEFAULT_TZ = "America/Sao_Paulo";
const DEFAULT_CRON = "0 8 * * *"; // 08:00 todos os dias

// ✅ FIXOS no arquivo (como você pediu)
const FIXED_INSTANCIA = "AgenteIA";
const FIXED_NUMERO: E164Digits = "553898001014"; // sem @c.us
const FIXED_NOME = "caio";

type E164Digits = string; // "5531999999999"

export interface MensagemMotivacionalOptions {
  instancia?: string;         // default FIXED_INSTANCIA
  numeroDestino?: E164Digits; // default FIXED_NUMERO
  nomePessoa?: string;        // default FIXED_NOME
  cronExpr?: string;          // default: 0 8 * * *
  timezone?: string;          // default: America/Sao_Paulo
  autostart?: boolean;        // se true, agenda ao importar (ou via env)
}

function normalizarNumero(bruto: string | undefined): E164Digits {
  const digits = (bruto || "").replace(/\D/g, "");
  if (!digits) throw new Error("Número de destino inválido/vazio");
  return digits;
}

function capitalizarNome(n: string) {
  return n.trim().replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// 🔥 Prompt EXATO (IA sempre ativa)
function montarPrompt(nome?: string, tz: string = DEFAULT_TZ) {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: tz });
  const alvo = capitalizarNome(nome || FIXED_NOME);
  return [
    `Escreva em português-BR uma mensagem curta (2 a 3 frases) de liderança e encorajamento para iniciar o dia de ${alvo} em ${hoje}.`,
    `Use referências sutis a John Maxwell, Winston Churchill e Salomão (Provérbios), sem citações literais longas.`,
    `Conecte a mensagem a foco, coragem e sabedoria aplicadas ao trabalho. Seja humano e prático. Sem hashtags. No máximo 1 emoji.`,
    `Responda APENAS com a mensagem final, sem títulos ou explicações.`
  ].join("\n");
}

function mensagemFallback(nome?: string) {
  const alvo = capitalizarNome(nome || FIXED_NOME);
  return `Bom dia, ${alvo}! 💡 Coragem para decidir, foco para executar e sabedoria para aprender no caminho. Influencie com propósito (Maxwell), avance apesar das dúvidas (Churchill) e aplique a prudência dos Provérbios hoje.`;
}

/** Envia a mensagem AGORA (IA sempre ON) */
export async function enviarMensagemMotivacionalAgora(
  opts: Omit<MensagemMotivacionalOptions, "cronExpr" | "timezone" | "autostart"> = {}
) {
  const instancia = (opts.instancia ?? FIXED_INSTANCIA).trim();
  const numero = normalizarNumero(opts.numeroDestino ?? FIXED_NUMERO);
  const nome = opts.nomePessoa ?? FIXED_NOME;

  const prompt = montarPrompt(nome, DEFAULT_TZ);

  // 2 tentativas com backoff simples
  let mensagem: string | null = null;
  let tentativa = 0;
  let ultimoErro: unknown;

  while (tentativa < 2 && !mensagem) {
    tentativa++;
    try {
      const txt = await gerarMensagemGemini(prompt);
      mensagem = (txt || "").trim();
      if (!mensagem) throw new Error("Resposta vazia da IA");
    } catch (e) {
      ultimoErro = e;
      await new Promise(r => setTimeout(r, 500 * tentativa));
    }
  }

  if (!mensagem) {
    console.error("⚠️ IA falhou, usando fallback:", (ultimoErro as any)?.message || ultimoErro);
    mensagem = mensagemFallback(nome);
  }

  return enviarMensagemInstancia(instancia, numero, mensagem);
}

/** Agenda diária. Retorna a task para controle (stop/start) */
export function startMensagemMotivacionalDiaria(options: MensagemMotivacionalOptions = {}): ScheduledTask {
  const cronExpr = options.cronExpr ?? DEFAULT_CRON;
  const timezone = options.timezone ?? DEFAULT_TZ;

  const task = cron.schedule(cronExpr, async () => {
    try {
      await enviarMensagemMotivacionalAgora({
        instancia: options.instancia ?? FIXED_INSTANCIA,
        numeroDestino: options.numeroDestino ?? FIXED_NUMERO,
        nomePessoa: options.nomePessoa ?? FIXED_NOME,
      });
      console.log(`✅ Mensagem motivacional diária enviada (${timezone})`);
    } catch (e: any) {
      console.error("❌ Falha ao enviar mensagem motivacional diária:", e?.message || e);
    }
  }, { timezone });

  if (options.autostart) {
    task.start();
    console.log(`⏰ Job 'mensagemMotivacionalDiaria' agendado (${cronExpr}, ${timezone})`);
  } else {
    task.stop();
  }

  return task;
}

export default startMensagemMotivacionalDiaria;

/** Autostart opcional via ENV (sem poluir server.ts) */
const auto = String(process.env.MOTIVATION_AUTOSTART || "").toLowerCase();
if (auto === "true" || auto === "1") {
  startMensagemMotivacionalDiaria({ autostart: true });
}
