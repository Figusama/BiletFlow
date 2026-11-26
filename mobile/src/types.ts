export type EventItem = {
  id: string;
  title: string;
  subtitle: string;
  gate?: string;
  checkedIn: number;
  total: number;
  status?: string;
  suspended?: boolean;
};

export type ScanStatus =
  | 'valid'
  | 'already_used'
  | 'refunded'
  | 'cancelled'
  | 'invalid'
  | 'campaign_qr'
  | 'wrong_event'
  | 'event_cancelled'
  | 'event_not_active'
  | 'event_suspended';

export type ScanResult = {
  status: ScanStatus;
  message?: string;
  ticketId?: string;
  publicId?: string;
  attendee?: string;
  seat?: string;
  usedAt?: string;
};

export type Attendee = {
  ticketId: string;
  publicId?: string;
  name: string;
  seat: string;
  status: 'valid' | 'checked_in' | 'refunded' | 'cancelled';
};

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  description: string;
  venueName?: string;
  address?: string;
  city?: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  isSuspended: boolean;
  seatingMode: string;
};

export type TicketTypeItem = {
  id: string;
  name: string;
  kind: string;
  priceMinor: number;
  saleState: string;
  available: number | null;
  maxPerOrder: number;
};

export type MyTicketStatus = 'VALID' | 'CHECKED_IN' | 'CANCELLED' | 'REFUNDED';

export type MyTicket = {
  id: string;
  publicId: string;
  eventId: string;
  eventTitle: string;
  startsAt: string;
  timezone: string;
  venueName: string;
  orderNumber: string;
  ticketTypeName: string;
  attendeeName: string;
  seatLabel?: string;
  status: MyTicketStatus;
  checkedInAt?: string;
  qrPayload: string;
};
