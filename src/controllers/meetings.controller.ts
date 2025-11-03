import { Request, Response } from 'express';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getMeetings,
  getMeetingsByColor,
  GetMeetingsQuery,
  updateGoogleCalendarEvent 
} from '../services/calendarService';
import { formatMeetingsWithGemini } from '../ai/messageFormatter';
import { confirmarReuniaoWhatsApp } from '../services/whatsappService';

// POST /api/meetings
export const createMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      clienteNome,
      clienteNumero,
      dataHora,
      chefeNome,
      cidadeOpcional,
      empresaNome,
      endereco,
      referidoPor,
      funcionarios,
      faturamento,
      observacoes,
      instagram
    } = req.body as {
      clienteNome?: string;
      clienteNumero?: string;
      dataHora?: string;
      chefeNome?: string;
      cidadeOpcional?: string;
      empresaNome?: string;
      endereco?: string;
      referidoPor?: string;
      funcionarios?: number;
      faturamento?: string;
      observacoes?: string;
      instagram?: string;
    };

    

    // ✅ campos obrigatórios corretos
    if (!clienteNome || !clienteNumero || !dataHora || !chefeNome) {
      res.status(400).json({
        success: false,
        error: "Campos obrigatórios: clienteNome, clienteNumero, dataHora, chefeNome.",
      });
      return;
    }

    // Tenta criar o evento no Google Calendar (lança em caso de falha)
    await createGoogleCalendarEvent(
      clienteNome,
      clienteNumero,
      dataHora,
      chefeNome,
      cidadeOpcional,
      empresaNome,
      endereco,
      referidoPor,
      funcionarios,
      faturamento,
      observacoes,
      instagram
    );

    // Envia WhatsApp (não bloqueante para confirmação — mas aguardamos para saber o resultado)
    // Se preferir que falha no WhatsApp não impeça confirmação do evento, trate erro dentro da função confirmarReuniaoWhatsApp.
    try {
      await confirmarReuniaoWhatsApp({
        clienteNome,
        clienteNumero,
        chefeNome,
        dataHoraISO: dataHora,
        cidadeOpcional,       
        
      });
    } catch (waErr) {
      // Logamos, mas não interrompemos o fluxo de confirmação do evento
      console.warn("⚠️ Falha ao enviar WhatsApp (não impede confirmação do evento):", waErr);
    }

    // ==== READ-AFTER-WRITE: confirmar que o evento foi criado no calendário ====
    // Buscamos pelo dia do dataHora. getMeetings aceita "day" em YYYY-MM-DD
    const dataDate = new Date(dataHora);
    if (isNaN(dataDate.getTime())) {
      // caso a data enviada pelo cliente seja inválida (já deveria ter sido validada anteriormente)
      res.status(400).json({ success: false, error: "dataHora inválida." });
      return;
    }
    const dayStr = dataHora.slice(0, 10); // "YYYY-MM-DD"

    // pega todas as reuniões do dia
    const meetings = await getMeetings({ day: dayStr });

    // normaliza start ISO esperado (o create usa new Date(dataHora).toISOString())
    const expectedStartISO = new Date(dataHora).toISOString();

    // tenta achar o evento criado: checa start exato ou clienteNome/numero combinando
    const found = meetings.find(m =>
      (m.start === expectedStartISO) ||
      (m.clienteNumero && clienteNumero && m.clienteNumero.includes(clienteNumero.replace(/\D/g, ""))) ||
      (m.clienteNome && clienteNome && m.clienteNome.toLowerCase() === clienteNome.toLowerCase())
    );

    if (!found) {
      // não encontrou — informa falha de confirmação
      console.error("⚠️ Evento não encontrado após criação. Day:", dayStr, "expectedStart:", expectedStartISO, "meetingsCount:", meetings.length);
      res.status(200).json({
        success: false,
        message: "Evento criado, mas não foi possível confirmar sua presença no calendário. Verifique os logs/Google Calendar.",
        requested: { clienteNome, clienteNumero, dataHora, chefeNome, cidadeOpcional, empresaNome, endereco, referidoPor, funcionarios, faturamento, observacoes },
        confirmList: meetings,
      });
      return;
    }

    // Sucesso confirmado
    res.status(201).json({
      success: true,
      message: "Evento criado e confirmado no calendário. WhatsApp enviado (se aplicável).",
      created: found,
      confirmList: meetings,
    });
  } catch (error: any) {
    console.error("Erro ao criar reunião:", error);
    // Se o erro vier de validação conhecida do calendarService, repasse a mensagem
    res.status(500).json({ success: false, error: error?.message ?? String(error) });
  }
};

// GET /api/meetings?day=YYYY-MM-DD   OU   /api/meetings?start=ISO&end=ISO
export const listMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: GetMeetingsQuery = {
      day: (req.query.day as string) || undefined,
      start: (req.query.start as string) || undefined,
      end: (req.query.end as string) || undefined,
    };

    const data = await getMeetings(query);
    //const mensagem = await formatMeetingsWithGemini(data);

    res.status(200).json({
      success: true,
      count: data.length,
      data,
      //mensagem,
    });
  } catch (error: any) {
    const mensagemErro = error?.message || 'Erro desconhecido ao listar reuniões.';
    if (mensagemErro.includes('Informe apenas "day"')) {
      res.status(400).json({ success: false, error: mensagemErro });
      return;
    }
    console.error('Erro ao listar reuniões:', error);
    res.status(500).json({ success: false, error: mensagemErro });
  }
};

// PATCH /api/meetings/:id
export const updateMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    const { novaDataHora } = req.body;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Parâmetro "id" é obrigatório na URL.',
      });
      return;
    }

    if (!novaDataHora) {
      res.status(400).json({
        success: false,
        error: 'Campo "novaDataHora" é obrigatório (formato ISO).',
      });
      return;
    }

    await updateGoogleCalendarEvent(id, novaDataHora);

    res.status(200).json({
      success: true,
      message: `Evento atualizado para ${novaDataHora}`,
    });
  } catch (error: any) {
    const mensagemErro = error?.message || 'Erro desconhecido ao atualizar reunião.';
    console.error('Erro ao atualizar reunião:', error);
    res.status(500).json({ success: false, error: mensagemErro });
  }
};

// DELETE /api/meetings/:id
export const deleteMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;

    if (!id) {
      res.status(400).json({ success: false, error: 'Parâmetro "id" é obrigatório na URL.' });
      return;
    }

    await deleteGoogleCalendarEvent(id);

    res.status(200).json({
      success: true,
      message: `Evento ${id} deletado com sucesso.`,
    });
  } catch (error: any) {
    const mensagemErro = error?.message || 'Erro desconhecido ao deletar reunião.';

    if (error?.response?.status === 404) {
      res.status(404).json({ success: false, error: 'Evento não encontrado para deletar.' });
      return;
    }

    console.error('Erro ao deletar reunião:', error);
    res.status(500).json({ success: false, error: mensagemErro });
  }
};


export async function listMeetingsByColor(req: Request, res: Response) {
  try {
    const { day, start, end } = req.query as any;

    // /api/meetings/green ou /api/meetings/red
    const last = req.path.split('/').filter(Boolean).pop();
    const color = (last === 'green' || last === 'red' || last === 'yellow') ? last : undefined;

    const data = await getMeetingsByColor({ day, start, end, color });
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || "Erro" });
  }
}