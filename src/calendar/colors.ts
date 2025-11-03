export const COLOR_MAP: Record<'yellow' | 'green' | 'red', string[]> = {
  yellow: ['5'],        // #fbd75b
  green: ['10', '2'],   // #51b749 (basil) + #7ae7bf (sage) -> deixe só '10' se quiser padronizar
  red: ['11'],          // #dc2127
};
export const STATUS_TO_COLORS: Record<'sale' | 'no-show', string[]> = {
  sale: COLOR_MAP.green,
  'no-show': COLOR_MAP.red,
};