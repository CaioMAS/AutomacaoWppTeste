// src/calendar/dto.ts
export type GetMeetingsByColorQuery = {
  day?: string;                 // YYYY-MM-DD
  start?: string;               // ISO
  end?: string;                 // ISO
  color?: "red" | "green" | "yellow";
  status?: "sale" | "no-show";
};

export type MeetingDTO = {
  id: string;
  summary: string;
  description?: string;
  start: string;   // ISO
  end: string;     // ISO
  attendees?: { email: string; displayName?: string }[];
  colorId?: string;
};
