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
import {
  CreateAgendamentoUseCase,
  ICreateAgendamentoDTO,
} from '../useCase/create-agendamento/create-agendamento.usecase';

// POST /api/meetings
// POST /api/meetings
export const createMeeting = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // 1. O body agora é um DTO (Data Transfer Object)
    // Note que o n8n precisa enviar o 'turma_nome' agora!
    const body: ICreateAgendamentoDTO = req.body;

    // 2. Instancia e executa o UseCase
    // O UseCase agora é o responsável por TODA a lógica de negócio
    const useCase = new CreateAgendamentoUseCase();
    const result = await useCase.execute(body);

    // 3. Sucesso!
    // O UseCase retorna os mesmos dados que seu controller antigo retornava
    res.status(201).json({
      success: true,
      message:
        'Evento criado, confirmado no DB e no calendário. WhatsApp enviado.',
      created: result.created,
      confirmList: result.confirmList,
      databaseRecord: result.agendamentoDB, // Bônus: o registro do DB
    });
    
  } catch (error: any) {
    // 4. Trata qualquer erro vindo do UseCase
    // (Ex: "Turma não encontrada", "dataHora inválida", etc.)
    console.error('Erro ao criar reunião (via UseCase):', error);
    res.status(400).json({
      // 400 (Bad Request) é melhor para erros de negócio
      success: false,
      error: error?.message ?? String(error),
    });
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