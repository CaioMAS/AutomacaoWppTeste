// src/jobs/mensagemMotivacionalDiaria.ts
import { gerarMensagemGemini } from "../ai/IAservice";
import { enviarMensagemInstancia } from "../services/whatasappMensageGeneric";

const DEFAULT_TZ = "America/Sao_Paulo";

// ✅ FIXOS no arquivo
const FIXED_INSTANCIA = "AgenteIA";
const FIXED_NUMERO: E164Digits = "553399501851"; // sem @c.us
const FIXED_NOME = "Ezequias";

type E164Digits = string; // ex: "5531999999999"

export interface MensagemMotivacionalOptions {
  instancia?: string;         
  numeroDestino?: E164Digits; 
  nomePessoa?: string;        
}

function normalizarNumero(bruto: string | undefined): E164Digits {
  const digits = (bruto || "").replace(/\D/g, "");
  if (!digits) throw new Error("Número de destino inválido/vazio");
  return digits;
}

function capitalizarNome(n: string) {
  return n.trim().replace(/\b\p{L}+/gu, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// ✨ Prompt motivacional simples, sem data nem citações fixas
function montarPrompt(nome?: string) {
  const alvo = capitalizarNome(nome || FIXED_NOME);
  return `
Escreva em português-BR uma mensagem curta (2 a 3 frases) de liderança e encorajamento para iniciar o dia de ${alvo}. Use referências sutis a John Maxwell, Winston Churchill e Salomão (Provérbios), sem citações literais longas. Conecte a mensagem a foco, coragem e sabedoria aplicadas ao trabalho. Seja humano e prático. Sem hashtags. No máximo 1 emoji. Responda APENAS com a mensagem final, sem títulos ou explicações.;
`.trim();
}

/** Envia a mensagem AGORA (IA sempre ON, sem fallback fixo) */
export async function enviarMensagemMotivacionalAgora(
  opts: MensagemMotivacionalOptions = {}
) {
  const instancia = (opts.instancia ?? FIXED_INSTANCIA).trim();
  const numero = normalizarNumero(opts.numeroDestino ?? FIXED_NUMERO);
  const nome = opts.nomePessoa ?? FIXED_NOME;

  const prompt = montarPrompt(nome);

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
    console.error("⚠️ Falha ao gerar mensagem motivacional:", (ultimoErro as any)?.message || ultimoErro);
    return;
  }

  return enviarMensagemInstancia(instancia, numero, mensagem);
}

export default enviarMensagemMotivacionalAgora;
