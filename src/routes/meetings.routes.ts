import { Router } from 'express';
import {
  createMeeting,
  listMeetings,
  updateMeeting,
  deleteMeeting,  
  updateAgendamentoStatusController
} from '../controllers/meetings.controller';
import { checkSpreadsheetController } from '../controllers/checkSpreadsheetController';

const router = Router();

/**
 * @route   POST /api/meetings
 * @desc    Cria um novo evento no Google Agenda + WhatsApp
 * @body    {
 *   clienteNome: string,
 *   clienteNumero: string,
 *   dataHora: string (ISO),
 *   chefeNome: string,
 *   cidadeOpcional: string
 * }
 */
router.post('/', createMeeting);

/**
 * @route   GET /api/meetings
 * @desc    Lista eventos por dia ou por intervalo
 * @query   ?day=YYYY-MM-DD   ou   ?start=ISO&end=ISO
 */
router.get('/', listMeetings);

/**
 * @route   PATCH /api/meetings/:id
 * @desc    Atualiza a data/hora de um evento existente
 * @body    { novaDataHora }
 */
router.patch('/:id', updateMeeting);

/**
 * @route   DELETE /api/meetings/:id
 * @desc    Remove um evento do Google Agenda
 */
router.patch('/:id/soft-delete', deleteMeeting);

/**
 * @route   PATCH /api/agendamentos/:id/status
 * @desc    Atualiza o status de um agendamento existente
 * @body    { status: "PENSANDO" | "PARADO" | "PERDA" | "FECHADO" | "NO_SHOW" }
 */
router.patch('/:id/status', updateAgendamentoStatusController);

/**
 * @route   GET /api/spreadsheet/check
 * @desc    Gera relatório semanal e métricas da planilha Google Sheets
 */
router.get('/check', checkSpreadsheetController);


export default router;
