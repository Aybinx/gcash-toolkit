export type TransactionType = 'in' | 'out' | 'misc';

export interface Transaction {
  id: string;
  type: TransactionType;
  miscSubtype?: 'add' | 'deduct';
  amount: number;
  fee: number;
  timestamp: number;
  note?: string;
  uid: string;
  walletId: string;
  personId: string;
  isDebt?: boolean;
  debtStatus?: 'unpaid' | 'paid';
  debtorName?: string;
  paidAmount?: number;
  isPayout?: boolean;
  payoutStatus?: 'unclaimed' | 'claimed';
  recipientName?: string;
  claimedAmount?: number;
  refNumber?: string;
}

export interface Wallet {
  id: string;
  name: string;
  balance: number;
  uid: string;
  personId: string;
  updatedAt: number;
}

export interface ManagedPerson {
  id: string;
  name: string;
  uid: string;
  createdAt: number;
}

export interface SummaryData {
  totalIn: number;
  totalOut: number;
  totalFees: number;
  transactionCount: number;
}

export interface UserSettings {
  uid: string;
  reportingEmail: string;
  autoSendEnabled: boolean;
  resendApiKey?: string;
  feeConfig?: {
    baseIncrement: number;
    midThreshold: number;
    midFee: number;
    fullFee: number;
  };
  serviceRateNotes?: string[];
  gcashNumber?: string;
  gcashQrUrl?: string;
  terminalPassword?: string;
}
