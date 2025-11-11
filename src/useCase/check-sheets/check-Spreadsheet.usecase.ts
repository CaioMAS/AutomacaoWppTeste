import { parse } from 'csv-parse/sync';
import {
  startOfWeek,
  addDays,
  format,
  parse as parseDate,
  isWithinInterval,
  isValid,
  differenceInBusinessDays,
} from 'date-fns';
import fetch from 'node-fetch';
import { enviarMensagemInstancia } from '../../services/whatasappMensageGeneric'; // ajuste o caminho se necessário

const DEBUG = true;

export class CheckSpreadsheetUseCase {
  private SHEET_CSV_URL =
    'https://docs.google.com/spreadsheets/d/1M0WB8YAcGgyxv4O1zqnsxVqlGgDrEfXlsj7edjAjH9o/export?format=csv';

  private normalizeHeader(h: string): string {
    return (h || '')
      .toString()
      .normalize('NFKD')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  async execute() {
    const hoje = new Date();

    // === 1. Buscar CSV ===
    const response = await fetch(this.SHEET_CSV_URL);
    if (!response.ok) throw new Error(`Erro ao buscar planilha: ${response.status} ${response.statusText}`);
    const csvText = await response.text();
    const rows = parse(csvText, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    if (!rows.length) throw new Error('Planilha vazia ou inacessível.');

    const headers = Object.keys(rows[0]);
    const normalizedMap: Record<string, string> = {};
    for (const h of headers) normalizedMap[this.normalizeHeader(h)] = h;

    // === 2. Detectar colunas ===
    const keyData = normalizedMap['data'] || 'DATA';
    const keyName = normalizedMap['nome'] || 'NOME';
    const keyFonte = normalizedMap['fonte (indicação ou tráfego)'] || 'FONTE (indicação ou tráfego)';
    const keyLeadCad = Object.keys(normalizedMap).find((k) => k.includes('lead')) ? normalizedMap[Object.keys(normalizedMap).find((k) => k.includes('lead'))!] : 'LEAD CADÊNCIA';
    const keyObs = normalizedMap['observação'] || 'OBSERVAÇÃO';
    const keyStatus = normalizedMap['status'] || 'STATUS';
    const keyMeta = normalizedMap['meta'] || 'META';
    const keyInicio = normalizedMap['início'] || normalizedMap['inicio'] || 'Início';
    const keyTurma = normalizedMap['turma'] || 'TURMA';
    const keyConsultor = normalizedMap['consultor'] || 'CONSULTOR';

    // === 3. Parsear linhas ===
    const parsedRows = rows
      .map((r) => {
        const dataStr = (r[keyData] || '').toString().trim();
        const dt = parseDate(dataStr, 'dd/MM/yyyy', new Date());
        if (!isValid(dt)) return null;
        return {
          date: dt,
          dateStr: dataStr,
          name: (r[keyName] || '').toString().trim(),
          fonte: (r[keyFonte] || '').toString().trim(),
          reuniao: (r[keyLeadCad] || '').toString().trim(),
          status: (r[keyStatus] || '').toString().trim(),
          obs: (r[keyObs] || '').toString().trim(),
        };
      })
      .filter(Boolean) as {
      date: Date;
      dateStr: string;
      name: string;
      fonte: string;
      reuniao: string;
      status: string;
      obs: string;
    }[];

    // === 4. Dados fixos da linha 2 ===
    const meta = Number(rows[0]?.[keyMeta] ?? 0) || 0;
    const inicioTurmaRaw = (rows[0]?.[keyInicio] ?? '').toString().trim();
    const turma = (rows[0]?.[keyTurma] ?? '').toString().trim();
    const consultor = (rows[0]?.[keyConsultor] ?? '').toString().trim();

    // === 5. Determinar semana ===
    let referencia = hoje;
    let inicioSemana = startOfWeek(referencia, { weekStartsOn: 1 });
    let fimSemana = addDays(inicioSemana, 4);

    const hasRowsThisWeek = parsedRows.some((r) => isWithinInterval(r.date, { start: inicioSemana, end: fimSemana }));
    if (!hasRowsThisWeek) {
      const latest = parsedRows.reduce(
        (acc, r) => (acc === null || r.date.getTime() > acc.getTime() ? r.date : acc),
        null as Date | null
      );
      if (latest) {
        referencia = latest;
        inicioSemana = startOfWeek(referencia, { weekStartsOn: 1 });
        fimSemana = addDays(inicioSemana, 4);
      }
    }

    const semanaRows = parsedRows.filter((r) => isWithinInterval(r.date, { start: inicioSemana, end: fimSemana }));

    // === 6. Contadores semanais ===
    let leadsIniciados = 0;
    let mktPublic = 0;
    let mktTerceiros = 0;
    let indicacoes = 0;
    let falados = 0;
    let agendados = 0;
    let noShow = 0;
    let vendas = 0;
    let perdas = 0;

    const reMktPublic = /mkt public/i;
    const reMktTerceiros = /terceiros/i;
    const reFalado = /whatsapp|ligação|ligou|ligacao|💬|📞|falando|falado/i;
    const reAgendado = /agendad/i;
    const reNoShow = /no[- ]?show|no-s/i;
    const reVenda = /venda/i;
    const rePerda = /perda/i;

    for (const r of semanaRows) {
      if (r.name) leadsIniciados++;
      if (reMktPublic.test(r.fonte)) mktPublic++;
      else if (reMktTerceiros.test(r.fonte)) mktTerceiros++;
      else if (r.fonte.trim() !== '') indicacoes++;

      if (reFalado.test(r.reuniao) || reFalado.test(r.obs)) falados++;
      if (reAgendado.test(r.reuniao) || reAgendado.test(r.obs)) agendados++;

      if (reVenda.test(r.status)) vendas++;
      if (rePerda.test(r.status)) perdas++;
      if (reNoShow.test(r.status)) noShow++;
    }

    // === 7. Totais gerais ===
    let totalAgendamentosGeral = 0;
    let totalVendasGeral = 0;

    for (const r of parsedRows) {
      if (reAgendado.test(r.reuniao) || reAgendado.test(r.obs)) totalAgendamentosGeral++;
      if (reVenda.test(r.status)) totalVendasGeral++;
    }

    const diasRestantes = inicioTurmaRaw
      ? Math.max(differenceInBusinessDays(parseDate(inicioTurmaRaw, 'dd/MM/yyyy', new Date()), hoje), 1)
      : null;

    const faltamVender = Math.max(meta - totalVendasGeral, 0);

    // === 8. Métrica preditiva ===
    const taxaConversao = totalAgendamentosGeral > 0 ? totalVendasGeral / totalAgendamentosGeral : 0;
    const agendamentosNecessarios = taxaConversao > 0 ? Math.ceil(meta / taxaConversao) : meta;
    const faltamAgendarPrevisto = Math.max(agendamentosNecessarios - totalAgendamentosGeral, 0);

    const metaDiariaVendas = diasRestantes ? (faltamVender / diasRestantes).toFixed(2) : '0';
    const metaDiariaAgendamentosPrevista = diasRestantes ? (faltamAgendarPrevisto / diasRestantes).toFixed(2) : '0';

    // === 9. Montar mensagem ===
    const msg = `
📊 *CONTROLE SEMANAL | TRABALHO SDR*
*TURMA:* ${turma || 'Não informado'}
*Consultor:* ${consultor || 'Não informado'}
*Período:* ${format(inicioSemana, 'dd/MM')} a ${format(fimSemana, 'dd/MM')}

📝 *Leads iniciados (total):* ${leadsIniciados}
Tráfego pago | MKT PUBLIC: ${mktPublic.toString().padStart(2, '0')}
Tráfego pago | MKT TERCEIROS: ${mktTerceiros.toString().padStart(2, '0')}
INDICAÇÃO: ${indicacoes.toString().padStart(2, '0')}

📲 *Leads falado:* ${falados}
🟢 *Reuniões agendadas:* ${agendados}
⛔ *No show:* ${noShow}
🎉 *Contratos fechados:* ${vendas}
❌ *Perdas:* ${perdas}

📈 *Progresso Geral:*
- Agendamentos totais: ${totalAgendamentosGeral}
- Vendas totais: ${totalVendasGeral}
- Meta de vendas: ${meta}
- Taxa de conversão: ${(taxaConversao * 100).toFixed(1)}%

🧮 *Projeção até ${inicioTurmaRaw || 'data indefinida'}:*
- Faltam vender: ${faltamVender}
- Faltam agendar (previsto): ${faltamAgendarPrevisto}
- Meta diária de agendamentos: ${metaDiariaAgendamentosPrevista}
- Meta diária de vendas: ${metaDiariaVendas}
`.trim();

    // === 10. Enviar mensagem ===
    const instancia = process.env.INSTANCIA_IA!;
    const numeroDestino = process.env.NUMERO_FIXO_GRUPO!;

    await enviarMensagemInstancia(instancia, numeroDestino, msg);

    if (DEBUG) console.log('📤 Mensagem enviada com sucesso:\n', msg);

    return {
      ...{
        turma,
        consultor,
        periodo: `${format(inicioSemana, 'dd/MM')} a ${format(fimSemana, 'dd/MM')}`,
        leadsIniciados,
        mktPublic,
        mktTerceiros,
        indicacoes,
        falados,
        agendados,
        noShow,
        vendas,
        perdas,
        meta,
        inicioTurma: inicioTurmaRaw,
        diasRestantes,
        totalAgendamentosGeral,
        totalVendasGeral,
        taxaConversao: (taxaConversao * 100).toFixed(1) + '%',
        agendamentosNecessarios,
        faltamAgendarPrevisto,
        faltamVender,
        metaDiariaAgendamentosPrevista,
        metaDiariaVendas,
      },
      mensagem: msg,
      enviadoPara: numeroDestino,
    };
  }
}
