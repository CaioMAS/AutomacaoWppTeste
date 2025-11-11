import { Request, Response } from 'express';
import { CheckSpreadsheetUseCase } from '../useCase/check-sheets/check-Spreadsheet.usecase';

export const checkSpreadsheetController = async (req: Request, res: Response): Promise<void> => {
  try {
    const useCase = new CheckSpreadsheetUseCase();
    const result = await useCase.execute();

    res.status(200).json({
      success: true,
      message: 'Relatório semanal gerado com sucesso.',
      data: result,
    });
  } catch (error: any) {
    console.error('Erro ao gerar relatório da planilha:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro desconhecido ao processar planilha.',
    });
  }
};
