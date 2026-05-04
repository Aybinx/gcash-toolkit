import * as React from 'react';
import { useState, useEffect, useMemo, ErrorInfo, ReactNode, useRef } from 'react';
import { 
  PlusCircle, 
  MinusCircle, 
  History, 
  Trash2, 
  TrendingUp, 
  Wallet as WalletIcon, 
  ArrowUpRight, 
  ArrowDownLeft,
  Calendar,
  ChevronRight,
  ChevronDown,
  Info,
  Download,
  Zap,
  Settings,
  UserPlus,
  ArrowRightLeft,
  BarChart3,
  LogIn,
  LogOut,
  User as UserIcon,
  Loader2,
  X,
  Share,
  Copy,
  Check,
  Mail,
  Link as LinkIcon,
  LayoutDashboard,
  ReceiptText,
  PieChart,
  Search,
  Hash,
  Monitor,
  Image as ImageIcon,
  Camera,
  ShieldCheck,
  AlertCircle,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  writeBatch, 
  getDocs,
  getDocFromServer,
  setDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { Transaction, TransactionType, Wallet, ManagedPerson, UserSettings } from './types';

// ===============================================================
// Main App Component
// ===============================================================

// ===============================================================
// Helper: Date Logic (Local Timezone Safe)
// ===============================================================

const getLocalDateISO = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateISO = (isoStr: string) => {
  const [year, month, day] = isoStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date;
};

// ===============================================================
// Helper: Firestore Error Handler
// ===============================================================

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [managedPeople, setManagedPeople] = useState<ManagedPerson[]>([]);
  const [activePersonId, setActivePersonId] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  
  const [transactionDate, setTransactionDate] = useState<string>(getLocalDateISO());
  const [viewedDate, setViewedDate] = useState<string>(getLocalDateISO());
  const [exportDate, setExportDate] = useState<string>(getLocalDateISO());
  const [exportRange, setExportRange] = useState<'day' | 'month'>('day');
  const [clearDate, setClearDate] = useState<string>(getLocalDateISO());
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>(
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDateManuallySet, setIsDateManuallySet] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletNameInput, setWalletNameInput] = useState<string>('');
  const [walletBalanceInput, setWalletBalanceInput] = useState<string>('');
  const [isEditingWallet, setIsEditingWallet] = useState(false);

  const [showPersonModal, setShowPersonModal] = useState(false);
  const [personNameInput, setPersonNameInput] = useState<string>('');
  const [isEditingPerson, setIsEditingPerson] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [showGlobalStats, setShowGlobalStats] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [manualFee, setManualFee] = useState<string>('');
  const [type, setType] = useState<TransactionType>('in');
  const [miscSubtype, setMiscSubtype] = useState<'add' | 'deduct'>('add');
  const [note, setNote] = useState<string>('');
  const [refNumber, setRefNumber] = useState<string>('');
  const [isDebt, setIsDebt] = useState(false);
  const [debtorNameInput, setDebtorNameInput] = useState<string>('');
  const [showDebtsView, setShowDebtsView] = useState(false);
  const [isPayout, setIsPayout] = useState(false);
  const [recipientNameInput, setRecipientNameInput] = useState<string>('');
  const [showPayoutsView, setShowPayoutsView] = useState(false);
  const [activeDebtIdForPartial, setActiveDebtIdForPartial] = useState<string | null>(null);
  const [partialPayAmount, setPartialPayAmount] = useState<string>('');
  const [expandedDebtors, setExpandedDebtors] = useState<Record<string, boolean>>({});
  const [expandedRecipients, setExpandedRecipients] = useState<Record<string, boolean>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [shareSuccessType, setShareSuccessType] = useState<'link' | 'email' | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [resendApiKeyInput, setResendApiKeyInput] = useState('');
  const [autoSendInput, setAutoSendInput] = useState(false);
  const [gcashNumberInput, setGcashNumberInput] = useState('');
  const [gcashQrUrlInput, setGcashQrUrlInput] = useState('');

  // Custom Fee States
  const [feeBaseIncrement, setFeeBaseIncrement] = useState<string>('10');
  const [feeMidThreshold, setFeeMidThreshold] = useState<string>('500');
  const [feeMidAmount, setFeeMidAmount] = useState<string>('5');
  const [feeFullAmount, setFeeFullAmount] = useState<string>('10');
  const [serviceNotesInput, setServiceNotesInput] = useState<string>('');
  
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>('All Time');
  const [isSharing, setIsSharing] = useState(false);
  const [sharedReportUrl, setSharedReportUrl] = useState<string | null>(null);

  // Investor View State
  const [viewingSharedReport, setViewingSharedReport] = useState<any | null>(null);
  const [isViewingShared, setIsViewingShared] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'form' | 'ledger' | 'summary'>('form');
  const [showPaymentPortal, setShowPaymentPortal] = useState(false);
  const [showCustomerTerminal, setShowCustomerTerminal] = useState(false);
  const [portalTransaction, setPortalTransaction] = useState<Transaction | null>(null);

  // Effect to reset payout state if type changes from 'out'
  useEffect(() => {
    if (type !== 'out') {
      setIsPayout(false);
      setRecipientNameInput('');
    }
  }, [type]);

  // Derived state for the active person
  const activeWallets = useMemo(() => {
    return wallets.filter(w => w.personId === activePersonId);
  }, [wallets, activePersonId]);

  const activeTransactions = useMemo(() => {
    return transactions.filter(t => t.personId === activePersonId);
  }, [transactions, activePersonId]);

  const groupedDebts = useMemo(() => {
    const debts = activeTransactions.filter(t => t.isDebt && t.debtStatus === 'unpaid');
    const grouped: Record<string, Transaction[]> = {};
    debts.forEach(t => {
      const key = t.debtorName || 'Unnamed Debtor';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeTransactions]);

  const groupedPayouts = useMemo(() => {
    const payouts = activeTransactions.filter(t => t.isPayout && t.payoutStatus !== 'claimed');
    const grouped: Record<string, Transaction[]> = {};
    payouts.forEach(t => {
      const key = t.recipientName || 'Unnamed Recipient';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeTransactions]);

  // Derived Calculations for Summaries
  const monthlySummary = useMemo(() => {
    const summary: Record<string, { in: number; out: number; profit: number }> = {};
    activeTransactions.forEach(t => {
      const monthKey = new Date(t.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!summary[monthKey]) summary[monthKey] = { in: 0, out: 0, profit: 0 };
      
      const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
      if (isAddition) summary[monthKey].in += t.amount;
      else summary[monthKey].out += t.amount;
      summary[monthKey].profit += t.fee;
    });
    return Object.entries(summary).sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      return dateB.getTime() - dateA.getTime();
    });
  }, [activeTransactions]);

  const accountSummary = useMemo(() => {
    return activeWallets.map(w => {
      const wTrans = activeTransactions.filter(t => t.walletId === w.id);
      const stats = wTrans.reduce((acc, t) => {
        const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
        if (isAddition) acc.in += t.amount;
        else acc.out += t.amount;
        acc.profit += t.fee;
        return acc;
      }, { in: 0, out: 0, profit: 0 });
      return { ...w, ...stats };
    });
  }, [activeWallets, activeTransactions]);

  const monthlyAccountSummary = useMemo(() => {
    // Structure: { [monthKey]: { [walletId]: { in, out, profit, walletName } } }
    const summary: Record<string, Record<string, { in: number; out: number; profit: number; walletName: string }>> = {};
    
    activeTransactions.forEach(t => {
      const monthKey = new Date(t.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!summary[monthKey]) summary[monthKey] = {};
      
      if (!summary[monthKey][t.walletId]) {
        const walletName = activeWallets.find(w => w.id === t.walletId)?.name || 'Unknown';
        summary[monthKey][t.walletId] = { in: 0, out: 0, profit: 0, walletName };
      }
      
      const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
      if (isAddition) summary[monthKey][t.walletId].in += t.amount;
      else summary[monthKey][t.walletId].out += t.amount;
      summary[monthKey][t.walletId].profit += t.fee;
    });

    return Object.entries(summary).sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      return dateB.getTime() - dateA.getTime();
    });
  }, [activeTransactions, activeWallets]);

  // Data Listener (Settings)
  useEffect(() => {
    if (!user || !isAuthReady) return;
    const unsub = onSnapshot(doc(db, 'user_settings', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserSettings;
        setUserSettings(data);
        setEmailInput(data.reportingEmail || '');
        setResendApiKeyInput(data.resendApiKey || '');
        setAutoSendInput(!!data.autoSendEnabled);

        if (data.feeConfig) {
          setFeeBaseIncrement(data.feeConfig.baseIncrement.toString());
          setFeeMidThreshold(data.feeConfig.midThreshold.toString());
          setFeeMidAmount(data.feeConfig.midFee.toString());
          setFeeFullAmount(data.feeConfig.fullFee.toString());
        }

        if (data.serviceRateNotes) {
          setServiceNotesInput(data.serviceRateNotes.join('\n'));
        }

        setGcashNumberInput(data.gcashNumber || '');
        setGcashQrUrlInput(data.gcashQrUrl || '');
        if (data.terminalPassword) setTerminalPassword(data.terminalPassword);
      }
    });
    return () => unsub();
  }, [user, isAuthReady]);

  // Data Listener (Management Level: People)
  useEffect(() => {
    if (!user || !isAuthReady) {
      setManagedPeople([]);
      return;
    }

    const peoplePath = 'people';
    const qPeople = query(
      collection(db, peoplePath),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePeople = onSnapshot(qPeople, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as ManagedPerson[];
      setManagedPeople(data);
      
      // Auto-select first person if none selected
      if (data.length > 0 && !activePersonId) {
        setActivePersonId(data[0].id);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, peoplePath);
    });

    return () => unsubscribePeople();
  }, [user, isAuthReady, activePersonId]);

  // Data Listener (Person Level: Wallets & Transactions) - Now Global for user to support Global summaries
  useEffect(() => {
    if (!user || !isAuthReady) {
      setTransactions([]);
      setWallets([]);
      return;
    }

    const transPath = 'transactions';
    const walletsPath = 'wallets';

    // Transactions subscription - Global for user
    const qTrans = query(
      collection(db, transPath), 
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeTrans = onSnapshot(qTrans, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Transaction[];
      setTransactions(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, transPath);
    });

    // Wallets subscription - Global for user
    const qWallets = query(
      collection(db, walletsPath),
      where('uid', '==', user.uid)
    );

    const unsubscribeWallets = onSnapshot(qWallets, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Wallet[];
      setWallets(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, walletsPath);
    });

    return () => {
      unsubscribeTrans();
      unsubscribeWallets();
    };
  }, [user, isAuthReady]);

  // Effect to handle wallet auto-selection when people or wallets change
  useEffect(() => {
    if (activeWallets.length > 0) {
      const isValidSelection = selectedWalletId === 'all' || activeWallets.some(w => w.id === selectedWalletId);
      if (!isValidSelection) {
        setSelectedWalletId(activeWallets[0].id);
      }
    } else {
      setSelectedWalletId('');
    }
  }, [activeWallets, activePersonId, selectedWalletId]);

  // Automatic Date Sync
  useEffect(() => {
    const checkDate = () => {
      const today = getLocalDateISO();
      if (!isDateManuallySet) {
        if (transactionDate !== today) setTransactionDate(today);
        if (viewedDate !== today) setViewedDate(today);
      }
    };

    const interval = setInterval(checkDate, 60000);
    window.addEventListener('focus', checkDate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkDate);
    };
  }, [isDateManuallySet, transactionDate, viewedDate]);

  // Check for shared report on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('viewReport');
    if (reportId) {
      const fetchSharedReport = async () => {
        try {
          const docRef = doc(db, 'shared_reports', reportId);
          // Using a simple getDoc
          const snap = await getDocs(query(collection(db, 'shared_reports'), where('id', '==', reportId)));
          if (!snap.empty) {
            setViewingSharedReport(snap.docs[0].data());
            setIsViewingShared(true);
          }
        } catch (error) {
          console.error("Shared report fetch failed", error);
        }
      };
      fetchSharedReport();
    }
  }, []);

  const handleShareReport = async () => {
    if (!activePersonId || monthlyAccountSummary.length === 0) return;
    
    setIsSharing(true);
    try {
      const reportId = Math.random().toString(36).substring(2, 15);
      const personName = managedPeople.find(p => p.id === activePersonId)?.name || 'Unknown';
      
      // We'll share the currently filtered month or "All Time"
      const reportData = selectedReportMonth === 'All Time' 
        ? monthlyAccountSummary 
        : monthlyAccountSummary.filter(m => m[0] === selectedReportMonth);

      // Firestore doesn't support nested arrays (like entries [string, any][])
      const formattedData = reportData.map(([month, walletsMap]) => ({
        month,
        wallets: walletsMap
      }));

      const payload = {
        id: reportId,
        uid: user?.uid,
        personName,
        month: selectedReportMonth,
        data: formattedData,
        createdAt: Date.now()
      };

      await setDoc(doc(db, 'shared_reports', reportId), payload);
      
      // Update metadata.json has the base URL usually, but we can't read it easily.
      // Use window.location.origin
      const shareUrl = `${window.location.origin}${window.location.pathname}?viewReport=${reportId}`;
      setSharedReportUrl(shareUrl);
    } catch (error) {
      console.error("Sharing failed", error);
    } finally {
      setIsSharing(false);
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const feeConfig = {
        baseIncrement: parseFloat(feeBaseIncrement) || 10,
        midThreshold: parseFloat(feeMidThreshold) || 500,
        midFee: parseFloat(feeMidAmount) || 5,
        fullFee: parseFloat(feeFullAmount) || 10
      };

      const notes = serviceNotesInput.split('\n').map(s => s.trim()).filter(Boolean);

      await setDoc(doc(db, 'user_settings', user.uid), {
        uid: user.uid,
        reportingEmail: emailInput,
        resendApiKey: resendApiKeyInput,
        autoSendEnabled: autoSendInput,
        feeConfig,
        serviceRateNotes: notes,
        gcashNumber: gcashNumberInput,
        gcashQrUrl: gcashQrUrlInput,
        terminalPassword: terminalPassword
      });
      setShowSettingsModal(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `user_settings/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualTestEmail = async () => {
    if (!userSettings?.reportingEmail) {
      alert("Please configure a reporting email first in Settings.");
      return;
    }
    
    setIsSendingEmail(true);
    try {
      // Calculate Global Totals
      const totalMonthData = { in: 0, out: 0, profit: 0 };
      
      // We want to report for EVERY profile
      const fullReportData = managedPeople.map(person => {
        const pTrans = transactions.filter(t => t.personId === person.id);
        const stats = pTrans.reduce((acc, t) => {
          const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
          if (isAddition) acc.in += t.amount;
          else acc.out += t.amount;
          acc.profit += t.fee;
          return acc;
        }, { in: 0, out: 0, profit: 0 });

        // Account level breakdown
        const personWallets = wallets.filter(w => w.personId === person.id);
        const walletStats = personWallets.map(w => {
          const wTrans = pTrans.filter(t => t.walletId === w.id);
          const wStats = wTrans.reduce((acc, t) => {
            const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
            if (isAddition) acc.in += t.amount;
            else acc.out += t.amount;
            acc.profit += t.fee;
            return acc;
          }, { in: 0, out: 0, profit: 0 });
          return { name: w.name, ...wStats };
        });
        
        totalMonthData.in += stats.in;
        totalMonthData.out += stats.out;
        totalMonthData.profit += stats.profit;
        
        return {
          name: person.name,
          stats,
          wallets: walletStats
        };
      });

      const profilesHTML = fullReportData.map(p => `
        <li style="margin-bottom: 24px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; list-style: none;">
          <div style="font-weight: 800; font-size: 16px; text-transform: uppercase; color: #1e293b; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">${p.name}</div>
          
          <!-- Summary Row -->
          <div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 16px;">
            <div style="flex: 1;">
              <span style="display: block; font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 800;">Profile Inflow</span>
              <span style="font-size: 14px; font-weight: 800; color: #059669;">₱${p.stats.in.toLocaleString()}</span>
            </div>
            <div style="flex: 1; border-left: 1px solid #cbd5e1; padding-left: 10px; text-align: right;">
              <span style="display: block; font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 800;">Profile Profit</span>
              <span style="font-size: 14px; font-weight: 900; color: #3b82f6;">₱${p.stats.profit.toLocaleString()}</span>
            </div>
          </div>

          <!-- Account Breakdowns -->
          <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 8px;">Account Level Breakdown</div>
          <div style="display: grid; gap: 6px;">
            ${p.wallets.map(w => `
              <div style="padding: 8px; background: #ffffff; border-radius: 6px; border: 1px solid #f1f5f9;">
                <div style="font-size: 10px; font-weight: 700; color: #475569; margin-bottom: 4px;">${w.name}</div>
                <div style="display: flex; justify-content: space-between; font-size: 10px;">
                  <span style="color: #059669; font-weight: 600;">In: ₱${w.in.toLocaleString()}</span>
                  <span style="color: #ea580c; font-weight: 600;">Out: ₱${w.out.toLocaleString()}</span>
                  <span style="color: #3b82f6; font-weight: 800;">P: ₱${w.profit.toLocaleString()}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </li>
      `).join('');

      const htmlBody = `
        <div style="font-family: 'Inter', system-ui, sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b; max-width: 600px; margin: 0 auto;">
          <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="color: #1e293b; margin: 0; font-size: 24px; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -0.05em;">Financial <span style="color: #3b82f6;">Report</span></h2>
            <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Generated on ${new Date().toLocaleDateString()}</p>
          </div>

          <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 24px; border-radius: 16px; margin-bottom: 24px; color: #ffffff; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.2);">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.9; margin-bottom: 8px;">Global Performance Summary</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div>
                <div style="font-size: 9px; text-transform: uppercase; opacity: 0.8; margin-bottom: 2px;">Total Inflow</div>
                <div style="font-size: 18px; font-weight: 800;">₱${totalMonthData.in.toLocaleString()}</div>
              </div>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; opacity: 0.8; margin-bottom: 2px;">Total Outflow</div>
                <div style="font-size: 18px; font-weight: 800;">₱${totalMonthData.out.toLocaleString()}</div>
              </div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Final Net Profit</span>
              <span style="font-size: 24px; font-weight: 900;">₱${totalMonthData.profit.toLocaleString()}</span>
            </div>
          </div>

          <h3 style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.15em; margin: 0 0 16px 4px;">Individual Profile Breakdowns</h3>
          <ul style="padding: 0; margin: 0;">${profilesHTML}</ul>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 10px; color: #94a3b8; text-align: center;">
            <p style="margin: 0;">This is an automated analytical report from your GCash Toolkit Manager.</p>
            <p style="margin: 4px 0 0 0;">Internal System V3.0 • Secure Transmission Active</p>
          </div>
        </div>
      `;

      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: userSettings.reportingEmail,
          subject: `Monthly Financial Breakdown - ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          html: htmlBody,
          resendApiKey: userSettings.resendApiKey
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        alert(`SUCCESS!\n\nA detailed financial report has been successfully delivered to ${userSettings.reportingEmail}.`);
      } else {
        throw new Error(result.error || 'Failed to dispatch email.');
      }
    } catch (error) {
      console.error("Email dispatch failed:", error);
      alert(`ERROR: ${error instanceof Error ? error.message : 'Unknown technical error occurred.'}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const [customerRefNum, setCustomerRefNum] = useState('');
  const [showTerminalSuccess, setShowTerminalSuccess] = useState(false);
  const [terminalStep, setTerminalStep] = useState<1 | 2>(1);
  const [terminalPassword, setTerminalPassword] = useState<string>('0000');
  const [showAdminLock, setShowAdminLock] = useState(false);
  const [adminLockInput, setAdminLockInput] = useState('');
  const [adminLockError, setAdminLockError] = useState(false);

  const [showCopiedToast, setShowCopiedToast] = useState(false);

  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [showUploadSource, setShowUploadSource] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [terminalFeeStrategy, setTerminalFeeStrategy] = useState<'add' | 'deduct'>('add');

  const handleVerifyReceipt = async () => {
    if (!receiptImage || !customerRefNum || !userSettings?.gcashNumber) {
      alert("Missing receipt image, reference number, or store configuration.");
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const numAmount = parseFloat(amount) + autoFee;
      
      // Get last digits of merchant number (usually last 4 are visible on receipts like +63 9*****9133)
      const lastDigits = userSettings.gcashNumber.slice(-4);

      const prompt = `
        Analyze this GCash receipt screenshot for authenticity and information extraction.
        
        Extraction Goals:
        1. Reference Number: Look for 'Ref No.' or 'Reference No.' (usually 13 digits).
        2. Amount: Look for 'Amount' or 'Total Amount Sent'.
        3. Recipient mobile number: Look for the hidden/masked number (e.g., 09*******9133). 

        Verification Context:
        - Expected Reference Number: "${customerRefNum}"
        - Expected Total Amount: ${terminalFeeStrategy === 'add' ? (parseFloat(amount) + autoFee) : parseFloat(amount)}
        - Merchant Number Last Digits: "${lastDigits}"

        Forgery/Integrity Check (BE VERY CAREFUL, DO NOT FALSE POSITIVE):
        - Check if the text matches the standard GCash brand fonts.
        - Check for suspicious blurring, misaligned text, or overlapping digits.
        - Important: If the image quality is just low or blurry, do NOT mark as "isEdited" unless there is clear evidence of manual tamper (like different colored backgrounds behind numbers).

        Return JSON format:
        {
          "isValid": boolean,
          "isEdited": boolean,
          "extractedRef": "string",
          "extractedAmount": number,
          "extractedRecipientDigits": "string",
          "message": "A helpful message describing the result."
        }

        Success Conditions:
        - extractedRef matches Expected Reference Number.
        - extractedAmount matches Expected Total Amount.
        - extractedRecipientDigits ends with Merchant Number Last Digits.
        - isEdited is false.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: receiptImage.split(',')[1] } }
          ]
        },
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      if (result.isEdited) {
        setVerificationResult({ 
          success: false, 
          message: "⚠️ SUSPICIOUS ACTIVITY: This receipt appears to be edited or forged. Transaction blocked." 
        });
        return;
      }

      if (result.isValid) {
        setVerificationResult({ success: true, message: "✅ Reference number verified! You can now complete the transaction." });
      } else {
        const mismatchReason = [];
        if (result.extractedRef !== customerRefNum) mismatchReason.push("Reference No. mismatch");
        if (Math.abs((result.extractedAmount || 0) - (terminalFeeStrategy === 'add' ? (parseFloat(amount) + autoFee) : parseFloat(amount))) > 1) mismatchReason.push("Amount mismatch");
        
        setVerificationResult({ 
          success: false, 
          message: result.message || `Verification failed: ${mismatchReason.join(', ') || 'Receipt details do not match your input.'}`
        });
      }
    } catch (error) {
      console.error("AI Verification Error:", error);
      setVerificationResult({ success: false, message: "OCR Verification failed. Please try again or contact support." });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitCustomerTransaction = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || !user || !selectedWalletId || !activePersonId) {
      alert("Please enter a valid amount and ensure terminal is configured.");
      return;
    }

    setIsSaving(true);
    try {
      const transPath = 'transactions';
      const walletsPath = 'wallets';
      const currentWallet = wallets.find(w => w.id === selectedWalletId);
      
      if (!currentWallet) throw new Error("No active wallet selected for terminal.");

      const now = new Date();
      const transactionData: any = {
        uid: user.uid,
        personId: activePersonId,
        walletId: selectedWalletId,
        type: 'out', // Customer pays via GCash, Merchant gives Cash
        amount: terminalFeeStrategy === 'add' ? numAmount : (numAmount - autoFee),
        fee: autoFee,
        timestamp: Date.now(),
        note: `TERMINAL PAYMENT (${terminalFeeStrategy === 'add' ? 'Add Fee' : 'Deduct Fee'}): ${customerRefNum}`.trim(),
        refNumber: customerRefNum,
        paidAmount: 0,
        claimedAmount: 0,
        isDebt: false,
        debtStatus: 'paid',
        isPayout: false,
        payoutStatus: 'claimed',
        updatedAt: Date.now()
      };

      const batch = writeBatch(db);
      const transRef = doc(collection(db, transPath));
      transactionData.id = transRef.id;
      batch.set(transRef, transactionData);

      // Update wallet balance (Inflow for 'out')
      // Wallet gets what the customer sent
      const walletRef = doc(db, walletsPath, selectedWalletId);
      batch.update(walletRef, {
        balance: currentWallet.balance + (terminalFeeStrategy === 'add' ? (numAmount + autoFee) : numAmount),
        updatedAt: Date.now()
      });

      await batch.commit();

      setShowTerminalSuccess(true);
      setAmount('');
      setCustomerRefNum('');
      setReceiptImage(null);
      setVerificationResult(null);
      setTerminalStep(1);
      
      setTimeout(() => setShowTerminalSuccess(false), 5000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateFee = (val: number): number => {
    if (val <= 0) return 0;
    
    // Use custom config if available
    const baseInc = userSettings?.feeConfig?.baseIncrement ?? 10;
    const midThresh = userSettings?.feeConfig?.midThreshold ?? 500;
    const midF = userSettings?.feeConfig?.midFee ?? 5;
    const fullF = userSettings?.feeConfig?.fullFee ?? 10;

    const thousands = Math.floor(val / 1000);
    const remainder = val % 1000;
    
    let extra = 0;
    if (remainder > 0) {
      extra = remainder < midThresh ? midF : fullF;
    }
    
    return (thousands * baseInc) + extra;
  };

  const autoFee = useMemo(() => calculateFee(parseFloat(amount) || 0), [amount]);
  const currentFee = useMemo(() => {
    if (type === 'misc') return parseFloat(manualFee) || 0;
    return autoFee;
  }, [type, manualFee, autoFee]);

  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    // Always include current month
    months.add(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }));
    
    activeTransactions.forEach(t => {
      const m = new Date(t.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      months.add(m);
    });
    
    return Array.from(months).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });
  }, [activeTransactions]);

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    activeTransactions.forEach(t => {
      const d = new Date(t.timestamp);
      const m = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (m === historyMonthFilter) {
        dates.add(getLocalDateISO(d));
      }
    });

    // If filter is current month, ensure today is in there
    const today = new Date();
    if (today.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) === historyMonthFilter) {
      dates.add(getLocalDateISO(today));
    }
    
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [activeTransactions, historyMonthFilter]);

  // Auto-select most recent date when month filter changes
  useEffect(() => {
    if (availableDates.length > 0) {
      if (!availableDates.includes(viewedDate)) {
        setViewedDate(availableDates[0]);
        setTransactionDate(availableDates[0]);
      }
    }
  }, [historyMonthFilter, availableDates, viewedDate]);

  const filteredTransactions = useMemo(() => {
    return activeTransactions.filter(t => {
      // Date Filter: either we show all, or we match viewedDate
      const isCorrectDate = showAllHistory || getLocalDateISO(new Date(t.timestamp)) === viewedDate;
      
      // Wallet Filter
      const isCorrectWallet = selectedWalletId === 'all' || t.walletId === selectedWalletId;
      
      // Search Filter
      const searchLower = historySearchQuery.toLowerCase().trim();
      const matchesSearch = !searchLower || (
        t.note?.toLowerCase().includes(searchLower) ||
        t.refNumber?.toLowerCase().includes(searchLower) ||
        t.debtorName?.toLowerCase().includes(searchLower) ||
        t.recipientName?.toLowerCase().includes(searchLower) ||
        (managedPeople.find(p => p.id === t.personId)?.name.toLowerCase().includes(searchLower)) ||
        t.amount.toString().includes(searchLower) ||
        t.type.toLowerCase().includes(searchLower) ||
        (wallets.find(w => w.id === t.walletId)?.name.toLowerCase().includes(searchLower))
      );

      return isCorrectDate && isCorrectWallet && matchesSearch;
    });
  }, [activeTransactions, viewedDate, selectedWalletId, showAllHistory, historySearchQuery, wallets]);

  const stats = useMemo(() => {
    return filteredTransactions.reduce((acc, curr) => {
      // Logic adjusted: Cash In (type 'in') is a deduction, Cash Out (type 'out') is an addition
      const isAddition = curr.type === 'out' || (curr.type === 'misc' && curr.miscSubtype === 'add');
      
      if (isAddition) acc.totalIn += curr.amount;
      else acc.totalOut += curr.amount;
      
      acc.totalFees += curr.fee;
      return acc;
    }, { totalIn: 0, totalOut: 0, totalFees: 0 });
  }, [filteredTransactions]);

  const globalStats = useMemo(() => {
    const today = getLocalDateISO();
    
    // Aggregates for ALL time
    const allTimeStats = transactions.reduce((acc, t) => {
      const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
      if (isAddition) acc.in += t.amount;
      else acc.out += t.amount;
      acc.profit += t.fee;
      return acc;
    }, { in: 0, out: 0, profit: 0 });

    const todayTransactions = transactions.filter(t => getLocalDateISO(new Date(t.timestamp)) === today);
    const todayStats = todayTransactions.reduce((acc, t) => {
      const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
      if (isAddition) acc.globalIn += t.amount;
      else acc.globalOut += t.amount;
      acc.globalProfit += t.fee;
      return acc;
    }, { globalIn: 0, globalOut: 0, globalProfit: 0 });
    
    return {
      ...todayStats,
      allTimeIn: allTimeStats.in,
      allTimeOut: allTimeStats.out,
      allTimeProfit: allTimeStats.profit,
      totalBalance: wallets.reduce((sum, w) => sum + w.balance, 0),
      totalPeople: managedPeople.length 
    };
  }, [transactions, wallets, managedPeople]);

  const handleSaveTransaction = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || !user || !selectedWalletId || !activePersonId) return;

    setIsSaving(true);
    const path = 'transactions';
    const walletsPath = 'wallets';
    const currentWallet = activeWallets.find(w => w.id === selectedWalletId);
    
    if (!currentWallet) {
      setIsSaving(false);
      return;
    }

    try {
      const now = new Date();
      const [year, month, day] = transactionDate.split('-').map(Number);
      const targetTimestamp = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).getTime();

      const transactionData: any = {
        type,
        amount: numAmount,
        fee: currentFee,
        timestamp: targetTimestamp,
        uid: user.uid,
        walletId: selectedWalletId,
        personId: activePersonId,
        isDebt: isDebt,
        debtStatus: isDebt ? 'unpaid' : 'paid',
        debtorName: (isDebt && debtorNameInput.trim()) ? debtorNameInput.trim() : "",
        isPayout: isPayout,
        payoutStatus: isPayout ? 'unclaimed' : 'claimed',
        recipientName: (isPayout && recipientNameInput.trim()) ? recipientNameInput.trim() : "",
        updatedAt: Date.now()
      };

      if (refNumber.trim()) {
        transactionData.refNumber = refNumber.trim();
      }

      if (editingTransactionId) {
        const oldTrans = transactions.find(t => t.id === editingTransactionId);
        transactionData.paidAmount = isDebt ? (oldTrans?.paidAmount || 0) : 0;
        transactionData.claimedAmount = isPayout ? (oldTrans?.claimedAmount || 0) : 0;
      } else {
        transactionData.paidAmount = 0;
        transactionData.claimedAmount = 0;
      }

      if (type === 'misc') {
        transactionData.miscSubtype = miscSubtype;
      }
      
      if (note.trim()) {
        transactionData.note = note.trim();
      }

      const batch = writeBatch(db);
      
      // Calculate balance delta
      // Logic: Addition: type === 'out' or (type === 'misc' && miscSubtype === 'add')
      //        Deduction: type === 'in' or (type === 'misc' && miscSubtype === 'deduct')
      const isAddition = type === 'out' || (type === 'misc' && miscSubtype === 'add');
      
      // DEBT LOGIC:
      // If debt is unpaid:
      // - 'In' (Service/Received) -> No balance change yet (we haven't received it)
      // - 'Out' (Loan Given) -> Balance decreases (cash left the wallet)
      let balanceDelta = 0;
      if (isDebt) {
        if (type === 'out') balanceDelta = -numAmount;
        else if (type === 'misc') balanceDelta = miscSubtype === 'add' ? numAmount : -numAmount;
        // if type === 'in', delta remains 0
      } else {
        balanceDelta = isAddition ? numAmount : -numAmount;
      }

      if (editingTransactionId) {
        // Reverse the old transaction impact first
        const oldTrans = transactions.find(t => t.id === editingTransactionId);
        if (oldTrans) {
          let oldReverseDelta = 0;
          if (oldTrans.isDebt && oldTrans.debtStatus === 'unpaid') {
             if (oldTrans.type === 'out') oldReverseDelta = oldTrans.amount;
             else if (oldTrans.type === 'misc') oldReverseDelta = oldTrans.miscSubtype === 'add' ? -oldTrans.amount : oldTrans.amount;
          } else {
             const wasAddition = oldTrans.type === 'out' || (oldTrans.type === 'misc' && oldTrans.miscSubtype === 'add');
             oldReverseDelta = wasAddition ? -oldTrans.amount : oldTrans.amount;
          }
          
          if (oldTrans.walletId === selectedWalletId) {
             balanceDelta += oldReverseDelta;
          } else {
             // Handle cross-wallet update if needed
             const oldWallet = wallets.find(w => w.id === oldTrans.walletId);
             if (oldWallet) {
               batch.update(doc(db, walletsPath, oldTrans.walletId), {
                 balance: oldWallet.balance + oldReverseDelta,
                 updatedAt: Date.now()
               });
             }
          }
        }
        
        batch.update(doc(db, path, editingTransactionId), transactionData);
      } else {
        const transRef = doc(collection(db, path));
        transactionData.id = transRef.id;
        batch.set(transRef, transactionData);
      }

      // Update balance of the selected wallet
      const walletRef = doc(db, walletsPath, selectedWalletId);
      batch.update(walletRef, {
        balance: currentWallet.balance + balanceDelta,
        updatedAt: Date.now()
      });

      await batch.commit();
      
      setAmount('');
      setManualFee('');
      setNote('');
      setRefNumber('');
      setDebtorNameInput('');
      setIsDebt(false);
      setRecipientNameInput('');
      setIsPayout(false);
      setEditingTransactionId(null);
    } catch (error) {
      handleFirestoreError(error, editingTransactionId ? OperationType.UPDATE : OperationType.CREATE, path);
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingTransaction = (t: Transaction) => {
    setEditingTransactionId(t.id);
    setAmount(t.amount.toString());
    setManualFee(t.fee.toString());
    setIsDebt(!!t.isDebt);
    setDebtorNameInput(t.debtorName || '');
    setIsPayout(!!t.isPayout);
    setRecipientNameInput(t.recipientName || '');
    setType(t.type);
    if (t.type === 'misc') setMiscSubtype(t.miscSubtype || 'add');
    setNote(t.note || '');
    setRefNumber(t.refNumber || '');
    setTransactionDate(getLocalDateISO(new Date(t.timestamp)));
    setSelectedWalletId(t.walletId);
    setActiveMobileTab('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpsertWallet = async () => {
    const name = walletNameInput.trim();
    const balanceVal = parseFloat(walletBalanceInput);
    if (!name || isNaN(balanceVal) || !user || !activePersonId) return;
    
    // Guard against editing without a selected wallet
    if (isEditingWallet && !selectedWalletId) {
      setIsEditingWallet(false); // Reset to creation mode
    }

    setIsSaving(true);
    const walletId = (isEditingWallet && selectedWalletId) ? selectedWalletId : crypto.randomUUID();
    const docPath = `wallets/${walletId}`;

    try {
      await setDoc(doc(db, 'wallets', walletId), {
        id: walletId,
        name,
        balance: balanceVal,
        uid: user.uid,
        personId: activePersonId,
        updatedAt: Date.now()
      }, { merge: true });
      
      setShowWalletModal(false);
      setWalletNameInput('');
      setWalletBalanceInput('');
      setSelectedWalletId(walletId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpsertPerson = async () => {
    const name = personNameInput.trim();
    if (!name || !user) return;
    
    setIsSaving(true);
    try {
      const personId = isEditingPerson && editingPersonId ? editingPersonId : crypto.randomUUID();
      
      const newPerson: any = {
        id: personId,
        name,
        uid: user.uid,
        createdAt: isEditingPerson ? managedPeople.find(p => p.id === personId)?.createdAt || Date.now() : Date.now()
      };

      await setDoc(doc(db, 'people', personId), newPerson, { merge: true });
      
      setShowPersonModal(false);
      setPersonNameInput('');
      setActivePersonId(personId);
      setIsEditingPerson(false);
      setEditingPersonId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'people');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePerson = async (personId: string) => {
    if (!user || !personId) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      // Delete person
      batch.delete(doc(db, 'people', personId));
      
      // Also delete their wallets and transactions (Note: In production you'd use a cloud function or recursive delete)
      // For this app, we'll fetch and batch delete what we have access to
      const ws = await getDocs(query(collection(db, 'wallets'), where('personId', '==', personId)));
      ws.forEach(d => batch.delete(d.ref));
      
      const ts = await getDocs(query(collection(db, 'transactions'), where('personId', '==', personId)));
      ts.forEach(d => batch.delete(d.ref));

      await batch.commit();
      if (activePersonId === personId) {
        setActivePersonId(managedPeople.find(p => p.id !== personId)?.id || '');
      }
      setDeletingPersonId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `people/${personId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (!user || !walletId) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'wallets', walletId));
      
      // Delete transactions for this wallet
      const ts = await getDocs(query(collection(db, 'transactions'), where('walletId', '==', walletId)));
      ts.forEach(d => batch.delete(d.ref));

      await batch.commit();
      if (selectedWalletId === walletId) {
        setSelectedWalletId(wallets.find(w => w.id !== walletId)?.id || '');
      }
      setDeletingWalletId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `wallets/${walletId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolveDebt = async (t: Transaction) => {
    if (!user || !t.id || t.debtStatus === 'paid') return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const walletsPath = 'wallets';
      const transPath = 'transactions';
      const wallet = wallets.find(w => w.id === t.walletId);

      if (!wallet) {
        setIsSaving(false);
        return;
      }

      // DEBT LOGIC:
      // If it was 'In' -> Balance increases (we finally received the money)
      // If it was 'Out' -> Balance increases (they returned the money)
      
      const currentPaid = t.paidAmount || 0;
      const remaining = t.amount - currentPaid;
      const amountToApply = remaining; // "Mark as Paid" button assumes full remaining amount
      const newPaid = currentPaid + amountToApply;
      const fullyPaid = newPaid >= t.amount;

      batch.update(doc(db, transPath, t.id), {
        debtStatus: fullyPaid ? 'paid' : 'unpaid',
        paidAmount: newPaid,
        updatedAt: Date.now()
      });

      batch.update(doc(db, walletsPath, wallet.id), {
        balance: wallet.balance + amountToApply,
        updatedAt: Date.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'transactions');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePartialPayment = async (t: Transaction) => {
    if (!user || !t.id || t.debtStatus === 'paid') return;
    const payVal = parseFloat(partialPayAmount);
    if (isNaN(payVal) || payVal <= 0) return;

    const currentPaid = t.paidAmount || 0;
    const remaining = t.amount - currentPaid;
    const amountToApply = Math.min(payVal, remaining);
    
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const walletsPath = 'wallets';
      const transPath = 'transactions';
      const wallet = wallets.find(w => w.id === t.walletId);
      if (!wallet) throw new Error("Wallet not found");

      const newPaid = currentPaid + amountToApply;
      const fullyPaid = newPaid >= t.amount;

      batch.update(doc(db, transPath, t.id), {
        paidAmount: newPaid,
        debtStatus: fullyPaid ? 'paid' : 'unpaid',
        updatedAt: Date.now()
      });

      batch.update(doc(db, walletsPath, wallet.id), {
        balance: wallet.balance + amountToApply,
        updatedAt: Date.now()
      });

      await batch.commit();
      setActiveDebtIdForPartial(null);
      setPartialPayAmount('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'transactions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCollectPayment = (t: Transaction) => {
    setPortalTransaction(t);
    setShowPaymentPortal(true);
  };

  const handleResolvePayout = async (t: Transaction) => {
    if (!user || !t.id || t.payoutStatus === 'claimed') return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const walletsPath = 'wallets';
      const transPath = 'transactions';
      const wallet = wallets.find(w => w.id === t.walletId);
      if (!wallet) return;

      const remainingToClaim = t.amount - (t.claimedAmount || 0);
      
      batch.update(doc(db, transPath, t.id), {
        payoutStatus: 'claimed',
        claimedAmount: t.amount,
        updatedAt: Date.now()
      });

      batch.update(doc(db, walletsPath, wallet.id), {
        balance: wallet.balance - remainingToClaim,
        updatedAt: Date.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'transactions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!user || !deletingId) return;
    const path = 'transactions';
    const walletsPath = 'wallets';
    setIsSaving(true);
    try {
      const transactionToDelete = transactions.find(t => t.id === deletingId);
      if (!transactionToDelete) {
        setDeletingId(null);
        setIsSaving(false);
        return;
      }

      const walletOfTransaction = wallets.find(w => w.id === transactionToDelete.walletId);
      
      const batch = writeBatch(db);
      batch.delete(doc(db, path, deletingId));

      if (walletOfTransaction) {
        // Reverse balance logic
        let oldBalanceImpact = 0;
        if (transactionToDelete.isDebt && transactionToDelete.debtStatus === 'unpaid') {
           if (transactionToDelete.type === 'out') oldBalanceImpact = -transactionToDelete.amount;
           else if (transactionToDelete.type === 'misc') oldBalanceImpact = transactionToDelete.miscSubtype === 'add' ? transactionToDelete.amount : -transactionToDelete.amount;
           // In debt (unpaid) has 0 impact on wallet
        } else {
           const wasAddition = transactionToDelete.type === 'out' || (transactionToDelete.type === 'misc' && transactionToDelete.miscSubtype === 'add');
           oldBalanceImpact = wasAddition ? transactionToDelete.amount : -transactionToDelete.amount;
        }

        batch.update(doc(db, walletsPath, walletOfTransaction.id), {
          balance: walletOfTransaction.balance - oldBalanceImpact,
          updatedAt: Date.now()
        });
      }

      await batch.commit();
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } finally {
      setIsSaving(false);
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    const path = 'transactions';
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      // We list all but filter in code because date comparison in firestore query might be tricky with timestamps
      // and we need to verify which docs to delete precisely for that day.
      const q = query(collection(db, path), where('uid', '==', user.uid));
      const snapshot = await getDocs(q);
      
      let count = 0;
      snapshot.forEach((doc) => {
        const tDate = getLocalDateISO(new Date(doc.data().timestamp));
        if (tDate === clearDate) {
          batch.delete(doc.ref);
          count++;
        }
      });
      
      if (count > 0) {
        await batch.commit();
      }
      setShowClearConfirm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (ts: number) => {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts));
  };

  const exportToExcel = async () => {
    // Filter transactions by selected range
    const filtered = transactions.filter(t => {
      const tDate = new Date(t.timestamp);
      if (exportRange === 'day') {
        return getLocalDateISO(tDate) === exportDate;
      } else {
        const selectedMonth = new Date(exportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        const tMonth = tDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        return selectedMonth === tMonth;
      }
    });

    if (filtered.length === 0) {
      alert(`No transactions found for the selected period.`);
      return;
    }
    
    // Detailed Stats Calculation
    const dayIn = filtered.reduce((acc, t) => (t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add')) ? acc + t.amount : acc, 0);
    const dayOut = filtered.reduce((acc, t) => (t.type === 'in' || (t.type === 'misc' && t.miscSubtype === 'deduct')) ? acc + t.amount : acc, 0);
    const dayFees = filtered.reduce((acc, t) => acc + t.fee, 0);

    // Per-Account Breakdown
    const accountStats = activeWallets.map(w => {
      const wTransactions = filtered.filter(t => t.walletId === w.id);
      return {
        name: w.name,
        profit: wTransactions.reduce((sum, t) => sum + t.fee, 0),
        count: wTransactions.length
      };
    }).filter(s => s.count > 0);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Toolkit Report');

    // Branding Colors
    const BRAND_ACCENT = '0063FF';
    const BRAND_BG = 'F8FAFC';
    const BRAND_SUCCESS = '10B981';
    const BRAND_DANGER = 'EF4444';

    // 1. Header Information
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'GCASH TOOLKIT - STORE REPORT';
    titleCell.font = { name: 'Inter', size: 18, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ACCENT } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 40;

    worksheet.mergeCells('A2:G2');
    const periodValue = exportRange === 'day' 
      ? new Date(exportDate).toLocaleDateString('en-PH', { dateStyle: 'full' })
      : new Date(exportDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
    worksheet.getCell('A2').value = `Reporting Period: ${periodValue}`;
    worksheet.getCell('A2').font = { bold: true, size: 12 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // 2. High-Level Summary
    worksheet.mergeCells('A4:B4');
    worksheet.getCell('A4').value = 'FINANCIAL OVERVIEW';
    worksheet.getCell('A4').font = { bold: true, color: { argb: BRAND_ACCENT } };

    const summaryData = [
      ['Total Inflow', dayIn],
      ['Total Outflow', dayOut],
      ['Total Profit', dayFees],
      ['Total Transactions', filtered.length],
    ];

    summaryData.forEach((row, i) => {
      const ri = 5 + i;
      worksheet.getCell(`A${ri}`).value = row[0];
      worksheet.getCell(`B${ri}`).value = row[1];
      if (typeof row[1] === 'number' && i < 3) worksheet.getCell(`B${ri}`).numFmt = '"₱"#,##0.00';
      worksheet.getCell(`A${ri}`).font = { bold: true };
      if (row[0] === 'Total Profit') worksheet.getCell(`B${ri}`).font = { bold: true, color: { argb: BRAND_SUCCESS } };
    });

    // 3. Per-Account Profit (The "User Accounts" request)
    const acctStartRow = 5;
    worksheet.getCell('D4').value = 'PROFIT PER ACCOUNT';
    worksheet.getCell('D4').font = { bold: true, color: { argb: BRAND_ACCENT } };
    
    accountStats.forEach((stat, i) => {
      const ri = 5 + i;
      worksheet.getCell(`D${ri}`).value = stat.name;
      worksheet.getCell(`E${ri}`).value = stat.profit;
      worksheet.getCell(`E${ri}`).numFmt = '"₱"#,##0.00';
      worksheet.getCell(`D${ri}`).font = { bold: true };
    });

    // 4. Transaction Ledger
    const tableHeaderRow = Math.max(10, 5 + accountStats.length + 2);
    const columns = [
      { header: 'DATE/TIME', key: 'time', width: 22 },
      { header: 'ACCOUNT', key: 'wallet', width: 18 },
      { header: 'SERVICE', key: 'type', width: 18 },
      { header: 'SUBTYPE', key: 'sub', width: 15 },
      { header: 'AMOUNT', key: 'amount', width: 15 },
      { header: 'PROFIT (FEE)', key: 'fee', width: 15 },
      { header: 'NOTE', key: 'note', width: 25 },
    ];

    worksheet.getRow(tableHeaderRow).values = columns.map(c => c.header);
    columns.forEach((col, idx) => worksheet.getColumn(idx + 1).width = col.width);
    
    worksheet.getRow(tableHeaderRow).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(tableHeaderRow).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      cell.border = { bottom: { style: 'medium', color: { argb: BRAND_ACCENT } } };
    });

    filtered.sort((a, b) => b.timestamp - a.timestamp).forEach((t, i) => {
      const ri = tableHeaderRow + 1 + i;
      const wallet = wallets.find(w => w.id === t.walletId);
      const isAdd = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
      
      const row = worksheet.getRow(ri);
      row.values = [
        new Date(t.timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        wallet?.name || 'N/A',
        t.type === 'in' ? 'Cash In' : t.type === 'out' ? 'Cash Out' : 'Misc',
        t.miscSubtype || (t.type === 'out' ? 'add' : 'deduct'),
        t.amount,
        t.fee,
        t.note || '-',
      ];

      row.getCell(5).numFmt = '"₱"#,##0.00';
      row.getCell(6).numFmt = '"₱"#,##0.00';
      row.getCell(5).font = { bold: true, color: { argb: isAdd ? BRAND_SUCCESS : BRAND_DANGER } };
      row.getCell(6).font = { italic: true };

      if (i % 2 === 0) {
        row.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_BG } });
      }
    });

    // 5. Finalize
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Toolkit_${exportRange}_${exportDate}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-accent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
        <div className="bg-brand-card p-10 rounded-2xl border border-brand-line shadow-xl max-w-md w-full text-center space-y-8">
          <div className="mx-auto w-16 h-16 bg-brand-bg rounded-full flex items-center justify-center text-brand-accent border border-brand-line">
            <WalletIcon className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">GCash Toolkit</h1>
            <p className="text-brand-muted text-sm mt-2">Secure Store Transaction Ledger</p>
          </div>
          <button 
            onClick={loginWithGoogle}
            className="w-full py-4 bg-brand-text text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-lg"
          >
            <LogIn className="w-5 h-5" /> Sign in with Google
          </button>
          <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold">Secure Cloud Data Persistence</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans flex flex-col overflow-x-hidden pb-16 md:pb-0">
      
      {/* Customer Terminal Overlay */}
      <AnimatePresence>
        {showCustomerTerminal && (
          <motion.div 
            initial={{ translateZ: 0, opacity: 0 }}
            animate={{ translateZ: 0, opacity: 1 }}
            exit={{ translateZ: 0, opacity: 0 }}
            className="fixed inset-0 z-[200] bg-white flex flex-col overflow-y-auto"
          >
            {/* Terminal Header */}
            <header className="p-6 md:p-10 border-b border-brand-line flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-accent rounded-2xl flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,99,255,0.3)]">
                  <Monitor className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-brand-text">
                   Customer <span className="text-brand-accent">Kiosk</span>
                  </h1>
                  <p className="text-[10px] font-black text-brand-muted uppercase tracking-[0.3em]">Official Store Terminal</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAdminLock(true)}
                className="p-4 bg-brand-bg hover:bg-brand-accent text-brand-muted hover:text-white rounded-2xl border border-brand-line transition-all shadow-sm flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em]"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Access</span>
              </button>
            </header>

            {/* Admin Access Lock Modal */}
            <AnimatePresence>
              {showAdminLock && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[300] bg-brand-text/90 backdrop-blur-sm flex items-center justify-center p-4"
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="bg-brand-card p-10 rounded-[3rem] border border-brand-line shadow-2xl max-w-sm w-full space-y-8"
                  >
                    <div className="text-center space-y-2">
                       <div className="w-16 h-16 bg-brand-bg rounded-3xl mx-auto flex items-center justify-center text-brand-accent border border-brand-line">
                          <LogIn className="w-8 h-8" />
                       </div>
                       <h3 className="text-xl font-black uppercase italic tracking-tight">Security Lock</h3>
                       <p className="text-xs font-medium text-brand-muted">Enter Admin PIN to exit terminal mode</p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-center gap-3">
                         {Array.from({ length: 4 }).map((_, i) => (
                           <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${adminLockInput.length > i ? 'bg-brand-accent border-brand-accent' : 'border-brand-line'}`} />
                         ))}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'DEL'].map((num) => (
                          <button
                            key={num}
                            onClick={() => {
                              setAdminLockError(false);
                              if (num === 'C') setAdminLockInput('');
                              else if (num === 'DEL') setAdminLockInput(prev => prev.slice(0, -1));
                              else if (typeof num === 'number' && adminLockInput.length < 4) {
                                const newInput = adminLockInput + num;
                                setAdminLockInput(newInput);
                                if (newInput.length === 4) {
                                  if (newInput === terminalPassword) {
                                    setShowCustomerTerminal(false);
                                    setShowAdminLock(false);
                                    setAdminLockInput('');
                                  } else {
                                    setAdminLockError(true);
                                    setTimeout(() => {
                                      setAdminLockInput('');
                                      setAdminLockError(false);
                                    }, 1000);
                                  }
                                }
                              }
                            }}
                            className={`p-5 rounded-2xl text-lg font-black transition-all ${adminLockError && typeof num === 'number' ? 'bg-red-50 text-red-500' : 'bg-brand-bg hover:bg-brand-accent hover:text-white'}`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                      
                      <button 
                        onClick={() => { setShowAdminLock(false); setAdminLockInput(''); }}
                        className="w-full py-3 text-[10px] font-black text-brand-muted uppercase tracking-widest hover:text-brand-text"
                      >
                        Back to Terminal
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <main className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
              <div className="space-y-10">
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1 h-6 bg-brand-accent rounded-full" />
                    <h2 className="text-2xl font-black uppercase italic tracking-tight">Withdraw <span className="text-brand-accent">Cash</span></h2>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="relative group">
                      <label className="text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] mb-3 block">Enter Amount to Withdraw</label>
                      <div className="relative">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-4xl font-black text-brand-line group-focus-within:text-brand-accent transition-colors">₱</span>
                        <input 
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-brand-bg border-4 border-brand-line focus:border-brand-accent rounded-[2rem] p-8 pl-16 text-5xl font-black tracking-tighter outline-none transition-all placeholder:text-brand-line"
                        />
                      </div>
                      <p className="text-[11px] text-brand-muted font-bold mt-4 px-2">
                        Enter the physical cash amount you want to receive. Our system calculates the service rate automatically.
                      </p>
                    </div>

                    <div className="bg-brand-card border-2 border-brand-line rounded-[2.5rem] p-8 shadow-sm space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] block pl-1">Fee Handling Choice</label>
                        <div className="grid grid-cols-2 gap-4">
                          <button 
                            onClick={() => setTerminalFeeStrategy('add')}
                            className={`p-4 rounded-[1.5rem] border-2 flex flex-col items-center gap-1 transition-all ${terminalFeeStrategy === 'add' ? 'border-brand-accent bg-brand-accent/5 ring-4 ring-brand-accent/10' : 'border-brand-line hover:border-brand-accent/30'}`}
                          >
                            <PlusCircle className={`w-5 h-5 ${terminalFeeStrategy === 'add' ? 'text-brand-accent' : 'text-brand-muted'}`} />
                            <span className={`text-[10px] font-black uppercase tracking-tight ${terminalFeeStrategy === 'add' ? 'text-brand-accent' : 'text-brand-muted'}`}>Add Fee Extra</span>
                            <span className="text-[8px] font-bold text-brand-muted/60 leading-none">Pay fee on top</span>
                          </button>
                          <button 
                            onClick={() => setTerminalFeeStrategy('deduct')}
                            className={`p-4 rounded-[1.5rem] border-2 flex flex-col items-center gap-1 transition-all ${terminalFeeStrategy === 'deduct' ? 'border-brand-accent bg-brand-accent/5 ring-4 ring-brand-accent/10' : 'border-brand-line hover:border-brand-accent/30'}`}
                          >
                            <MinusCircle className={`w-5 h-5 ${terminalFeeStrategy === 'deduct' ? 'text-brand-accent' : 'text-brand-muted'}`} />
                            <span className={`text-[10px] font-black uppercase tracking-tight ${terminalFeeStrategy === 'deduct' ? 'text-brand-accent' : 'text-brand-muted'}`}>Deduct from Sent</span>
                            <span className="text-[8px] font-bold text-brand-muted/60 leading-none">Take fee from amount</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4 pt-2">
                        <div className="flex justify-between items-center text-brand-muted">
                          <span className="text-sm font-bold">Amount to {terminalFeeStrategy === 'add' ? 'Withdraw' : 'Send'}</span>
                          <span className="text-lg font-black italic">₱{(parseFloat(amount) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-brand-muted italic opacity-60">
                          <span className="text-xs font-bold">Store Service Fee</span>
                          <span className="text-sm font-black underline decoration-brand-accent/30 underline-offset-4">₱{autoFee.toLocaleString()}</span>
                        </div>
                        
                        <div className="pt-6 border-t-2 border-brand-line flex justify-between items-center bg-brand-bg -mx-8 -mb-8 p-8 rounded-b-[2.5rem]">
                          <div>
                            <span className="text-[10px] font-black text-brand-muted uppercase tracking-widest block mb-1">
                              {terminalFeeStrategy === 'add' ? 'Total to Send via GCash' : 'Cash you will Receive'}
                            </span>
                            <span className="text-4xl font-black text-brand-text italic tracking-tighter">
                              ₱{terminalFeeStrategy === 'add' 
                                ? ((parseFloat(amount) || 0) + autoFee).toLocaleString() 
                                : ((parseFloat(amount) || 0) - autoFee).toLocaleString()
                              }
                            </span>
                          </div>
                          <div className={`w-12 h-12 bg-white rounded-full border-2 border-brand-line flex items-center justify-center shadow-inner transition-colors ${terminalFeeStrategy === 'add' ? 'text-brand-accent' : 'text-orange-500'}`}>
                            {terminalFeeStrategy === 'add' ? <PlusCircle className="w-6 h-6" /> : <MinusCircle className="w-6 h-6" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="space-y-10">
                <section className="bg-brand-accent/5 rounded-[3rem] border border-brand-accent/10 p-10 flex flex-col items-center gap-8">
                  {userSettings?.gcashQrUrl ? (
                    <div className="space-y-6 text-center">
                      <div className="p-6 bg-white rounded-[2rem] shadow-2xl border-2 border-brand-accent/20">
                        <img 
                          src={userSettings.gcashQrUrl} 
                          alt="GCash QR" 
                          className="w-56 h-56 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-lg font-black uppercase italic tracking-tight">Scan QR Code</h4>
                        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em]">Open GCash & Scan to Pay</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-square bg-slate-100 rounded-[2rem] flex flex-col items-center justify-center p-10 text-center gap-4">
                      <div className="p-4 bg-white rounded-full shadow-sm">
                        <Hash className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">QR Code Not Configured</p>
                    </div>
                  )}

                  <div className="w-full space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-brand-line">
                      <div className="flex-1">
                        <span className="text-[9px] font-black text-brand-muted uppercase tracking-widest block mb-0.5">GCash Account Number</span>
                        <span className="text-base font-black text-brand-text font-mono tracking-widest">{userSettings?.gcashNumber || '---'}</span>
                      </div>
                      <button 
                        onClick={() => {
                          if (userSettings?.gcashNumber) {
                            navigator.clipboard.writeText(userSettings.gcashNumber);
                            alert('GCash Number Copied!');
                          }
                        }}
                        className="p-3 bg-brand-bg text-brand-accent rounded-xl hover:bg-brand-accent hover:text-white transition-all shadow-sm"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>

                    <button 
                      onClick={() => {
                        const baseAmount = (parseFloat(amount) || 0);
                        const totalAm = terminalFeeStrategy === 'add' ? (baseAmount + autoFee) : baseAmount;
                        const num = userSettings?.gcashNumber || '';
                        const text = `Amount: ${totalAm}\nNumber: ${num}`;
                        
                        navigator.clipboard.writeText(text);
                        setShowCopiedToast(true);
                        setTimeout(() => setShowCopiedToast(false), 3000);
                        setTerminalStep(2);
                      }}
                      disabled={!amount || parseFloat(amount) <= 0}
                      className={`w-full py-6 bg-brand-accent text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-brand-accent/40 flex items-center justify-center gap-4 group transition-all hover:scale-[1.02] ${(!amount || parseFloat(amount) <= 0) ? 'opacity-30 pointer-events-none' : ''}`}
                    >
                      {showCopiedToast ? (
                        <>
                          <Check className="w-6 h-6" />
                          <span>Details Copied! Complete Payment</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-6 h-6 fill-white" />
                          <span>Ready to Pay? Copy Details</span>
                        </>
                      )}
                    </button>
                  </div>
                </section>

                {/* Step 2: Verification & Submit Record */}
                <AnimatePresence>
                  {terminalStep === 2 && (
                    <motion.section 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-8 bg-brand-card rounded-[2.5rem] border-2 border-brand-accent/20 shadow-xl space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-brand-accent rounded-full flex items-center justify-center text-white font-black">2</div>
                          <h3 className="text-xl font-black uppercase italic tracking-tight text-brand-text">Verify Receipt</h3>
                        </div>
                        <button onClick={() => setTerminalStep(1)} className="text-[10px] font-black text-brand-muted uppercase tracking-widest hover:text-brand-text">Change Amount</button>
                      </div>

                      <div className="space-y-4">
                        {/* Reference Number & Screenshot Upload */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest pl-1">Reference Number</label>
                            <div className="relative">
                             <input 
                               type="text"
                               value={customerRefNum}
                               onChange={(e) => setCustomerRefNum(e.target.value)}
                               placeholder="13-digit Ref No."
                               className="w-full bg-brand-bg border-4 border-brand-line p-5 rounded-[1.5rem] text-brand-text font-mono font-bold outline-none focus:border-brand-accent transition-all text-lg"
                             />
                              <Hash className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest pl-1">Proof of Payment</label>
                            <div className="relative">
                              <div 
                                className={`border-4 border-dashed rounded-[1.5rem] p-5 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative overflow-hidden min-h-[5.5rem] ${receiptImage ? 'border-brand-accent bg-brand-accent/5' : 'border-brand-line hover:border-brand-accent/50'}`}
                                onClick={() => setShowUploadSource(true)}
                              >
                                {receiptImage ? (
                                   <>
                                     <img src={receiptImage} className="absolute inset-0 w-full h-full object-cover opacity-20" alt="Preview" />
                                     <p className="relative z-10 text-[10px] font-black text-brand-accent uppercase tracking-widest bg-white/90 backdrop-blur px-4 py-1.5 rounded-full shadow-sm border border-brand-accent/20">Change Photo</p>
                                   </>
                                ) : (
                                   <>
                                     <div className="flex items-center gap-3">
                                        <ImageIcon className="w-5 h-5 text-brand-accent" />
                                        <span className="text-xs font-black uppercase text-brand-accent italic tracking-tighter">Upload Proof</span>
                                     </div>
                                   </>
                                )
                              }
                            </div>

                            {/* Source Picker Overlay */}
                            <AnimatePresence>
                              {showUploadSource && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="absolute inset-0 z-20 bg-brand-bg/98 backdrop-blur-xl rounded-[1.5rem] p-5 flex flex-col justify-center gap-4 border-4 border-brand-accent shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
                                >
                                  <div className="flex justify-between items-center px-1">
                                     <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-brand-accent uppercase tracking-[0.2em] leading-tight">Verification Source</span>
                                        <span className="text-[11px] font-black italic text-brand-text uppercase">Select Method</span>
                                     </div>
                                     <button 
                                       onClick={(e) => { 
                                         e.stopPropagation(); 
                                         setShowUploadSource(false); 
                                       }} 
                                       className="w-8 h-8 flex items-center justify-center bg-brand-line hover:bg-brand-text hover:text-white rounded-xl transition-all active:scale-90"
                                     >
                                       <X className="w-4 h-4" />
                                     </button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        document.getElementById('receipt-upload-camera')?.click();
                                        setShowUploadSource(false);
                                      }}
                                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-brand-accent/10 hover:bg-brand-accent/20 border-2 border-brand-accent/30 text-brand-accent transition-all group active:scale-95"
                                    >
                                      <div className="w-12 h-12 bg-brand-accent rounded-2xl flex items-center justify-center shadow-[0_8px_20px_rgba(0,123,255,0.3)] group-hover:scale-110 transition-transform">
                                         <Camera className="w-6 h-6 text-white" />
                                      </div>
                                      <div className="flex flex-col items-center">
                                         <span className="text-[10px] font-black uppercase tracking-widest">Camera</span>
                                         <span className="text-[8px] font-bold text-brand-accent/60 uppercase">Snap Photo</span>
                                      </div>
                                    </button>

                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        document.getElementById('receipt-upload-gallery')?.click();
                                        setShowUploadSource(false);
                                      }}
                                      className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-brand-line/50 hover:bg-brand-text hover:text-white border-2 border-brand-line text-brand-text transition-all group active:scale-95"
                                    >
                                      <div className="w-12 h-12 bg-brand-text rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform group-hover:bg-white group-hover:text-brand-text">
                                         <ImageIcon className="w-6 h-6" />
                                      </div>
                                      <div className="flex flex-col items-center">
                                         <span className="text-[10px] font-black uppercase tracking-widest">Gallery</span>
                                         <span className="text-[8px] font-bold opacity-60 uppercase">Library</span>
                                      </div>
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                              {/* Hidden Inputs */}
                              <input 
                                id="receipt-upload-camera"
                                type="file" 
                                accept="image/*"
                                capture="environment"
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => setReceiptImage(reader.result as string);
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <input 
                                id="receipt-upload-gallery"
                                type="file" 
                                accept="image/*"
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => setReceiptImage(reader.result as string);
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Customer Guide Section */}
                        <div className="bg-brand-bg rounded-[2.5rem] p-8 border-4 border-brand-line space-y-6">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent">
                                <ShieldCheck className="w-6 h-6" />
                             </div>
                             <div>
                                <h4 className="text-[10px] font-black text-brand-muted uppercase tracking-[0.3em] leading-tight">Safety & Guidance</h4>
                                <p className="text-sm font-black uppercase italic tracking-tight text-brand-text">How to verify your receipt</p>
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="flex gap-4">
                               <div className="w-7 h-7 rounded-full bg-brand-text flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-lg">1</div>
                               <p className="text-[11px] font-bold text-brand-muted leading-relaxed">Pay the exact amount from Step 1 to our GCash number.</p>
                             </div>
                             <div className="flex gap-4">
                               <div className="w-7 h-7 rounded-full bg-brand-text flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-lg">2</div>
                               <p className="text-[11px] font-bold text-brand-muted leading-relaxed">Type the 13-digit Reference Number accurately above.</p>
                             </div>
                             <div className="flex gap-4">
                               <div className="w-7 h-7 rounded-full bg-brand-text flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-lg">3</div>
                               <p className="text-[11px] font-bold text-brand-muted leading-relaxed">Upload the official success screenshot from your GCash app.</p>
                             </div>
                             <div className="flex gap-4">
                               <div className="w-7 h-7 rounded-full bg-brand-accent flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-[0_4px_12px_rgba(0,99_255,0.3)] animate-pulse">4</div>
                               <p className="text-[11px] font-bold text-brand-accent leading-relaxed italic">Wait 5-10s for our Smart Guard to verify the authenticity.</p>
                             </div>
                          </div>
                        </div>

                        {/* Status Message */}
                        {verificationResult && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-4 rounded-2xl flex items-start gap-3 ${verificationResult.success ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' : 'bg-red-50 border border-red-100 text-red-800'}`}
                          >
                            {verificationResult.success ? <ShieldCheck className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                            <div className="space-y-1">
                               <p className="text-[11px] font-black uppercase tracking-tight">{verificationResult.success ? 'Identity Confirmed' : 'Verification Denied'}</p>
                               <p className="text-xs font-medium opacity-80 leading-tight">{verificationResult.message}</p>
                            </div>
                          </motion.div>
                        )}

                        {/* Actions */}
                        {!verificationResult?.success ? (
                          <button 
                            onClick={handleVerifyReceipt}
                            disabled={isVerifying || !receiptImage || !customerRefNum}
                            className="w-full py-5 bg-brand-text text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-brand-accent transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed group"
                          >
                            {isVerifying ? (
                               <>
                                 <Loader2 className="w-4 h-4 animate-spin" />
                                 <span>Scanning Receipt...</span>
                               </>
                            ) : (
                               <>
                                 <ShieldCheck className="w-4 h-4 group-hover:scale-125 transition-transform" />
                                 <span>Verify Reference Number</span>
                               </>
                            )}
                          </button>
                        ) : (
                          <button 
                            onClick={handleSubmitCustomerTransaction}
                            disabled={isSaving}
                            className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all shadow-2xl flex items-center justify-center gap-4 animate-pulse-slow"
                          >
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            <span>Complete Transaction</span>
                          </button>
                        )}
                        
                        <p className="text-center text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em] leading-relaxed">
                          By clicking verify, our AI system checks the screenshot against your input to prevent fraudulent entries.
                        </p>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                {showTerminalSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 bg-emerald-50 border-2 border-emerald-200 rounded-[2.5rem] text-center space-y-4"
                  >
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center border-4 border-emerald-50">
                      <Check className="w-8 h-8" />
                    </div>
                    <h4 className="text-xl font-black text-emerald-900 uppercase italic">Payment Received!</h4>
                    <p className="text-sm text-emerald-700 font-medium">Please inform the store manager to collect your cash.</p>
                  </motion.div>
                )}

                <div className="p-8 bg-brand-bg rounded-[2rem] border border-brand-line flex items-start gap-4">
                  <div className="p-3 bg-white rounded-2xl shadow-sm text-brand-accent">
                    <Info className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-brand-text">Check Out Instructions</h5>
                    <p className="text-[11px] text-brand-muted leading-relaxed font-medium">
                      Send the exact total amount. Once done, inform the store manager with your reference number to claim your cash.
                    </p>
                  </div>
                </div>
              </div>
            </main>

            <footer className="p-10 border-t border-brand-line text-center opacity-40">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-muted">
                Managed POS Terminal Ref: {user?.uid.substring(0,8).toUpperCase()}
              </p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-brand-card border-b border-brand-line px-4 lg:px-10 py-4 flex flex-col md:flex-row justify-between items-start md:items-center sticky top-0 z-20 shadow-sm gap-4">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight truncate max-w-[200px] md:max-w-none">GCash Transaction Assistant</h1>
            <p className="text-[10px] md:text-sm text-brand-muted">Daily Store Services & Fee Tracker</p>
          </div>
          <div className="flex items-center gap-2 md:hidden">
             <button 
              onClick={() => {
                setClearDate(viewedDate);
                setShowClearConfirm(true);
              }}
              className="p-2 text-brand-muted hover:text-red-500 rounded-lg transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between w-full md:w-auto gap-3 md:gap-8 grow justify-end">
          {/* Managed Person Switcher */}
          <div className="flex items-center gap-4 border-r border-brand-line pr-4 md:border-none md:pr-0">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[8px] md:text-[10px] font-black text-brand-muted uppercase tracking-widest leading-none">Profile</span>
              <div className="flex items-center gap-2">
                <select 
                  value={activePersonId}
                  onChange={(e) => setActivePersonId(e.target.value)}
                  className="bg-brand-bg border border-brand-line px-2 py-1 rounded-lg text-[10px] md:text-xs font-bold text-brand-text outline-none focus:border-brand-accent transition-all min-w-[100px] md:min-w-[140px]"
                >
                  {managedPeople.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  {managedPeople.length === 0 && <option value="">No Profile</option>}
                </select>
                <button 
                  onClick={() => {
                    setIsEditingPerson(false);
                    setPersonNameInput('');
                    setShowPersonModal(true);
                  }}
                  className="p-1.5 bg-brand-bg border border-brand-line rounded-lg text-brand-accent hover:bg-brand-accent hover:text-white transition-all shadow-sm"
                  title="Manage Profiles"
                >
                  <UserPlus className="w-3.5 h-3.5 md:w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="text-right border-l border-brand-line pl-4 md:pl-8 hidden sm:block">
            <span className="block text-[10px] font-bold text-brand-muted uppercase tracking-widest">Store Date</span>
            <span className="text-xs md:text-sm font-bold text-brand-accent whitespace-nowrap">
              {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowExportModal(true)}
              disabled={transactions.length === 0}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-accent text-white text-[10px] md:text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-30 transition-all shadow-sm"
            >
              <BarChart3 className="w-3.5 h-3.5 md:w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button 
              onClick={() => {
                setClearDate(viewedDate);
                setShowClearConfirm(true);
              }}
              className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all hidden md:block"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* User Profile & Sign Out */}
            <div className="relative pl-3 md:pl-4 border-l border-brand-line ml-1 md:ml-2">
              <button 
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-3 p-1 rounded-full hover:bg-brand-bg transition-all group"
              >
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] font-black text-brand-text leading-tight">{user.displayName}</div>
                  <div className="text-[8px] font-bold text-brand-muted uppercase tracking-tighter">{user.email}</div>
                </div>
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt="User" 
                    className="w-8 h-8 rounded-full border border-brand-line shadow-sm group-hover:border-brand-accent transition-all"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-brand-accent text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-110 transition-all">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </div>
                )}
              </button>

              <AnimatePresence>
                {showProfileDropdown && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowProfileDropdown(false)}
                      className="fixed inset-0 z-40"
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-3 w-56 bg-brand-card rounded-2xl shadow-2xl border border-brand-line z-50 overflow-hidden"
                    >
                      <div className="p-5 border-b border-brand-line bg-slate-50/50">
                        <div className="text-xs font-black text-brand-text mb-1 truncate">{user.displayName}</div>
                        <div className="text-[10px] font-medium text-brand-muted truncate">{user.email}</div>
                      </div>
                      <div className="p-2">
                        <button 
                          onClick={() => {
                            setShowProfileDropdown(false);
                            setShowSettingsModal(true);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-brand-text hover:bg-brand-bg font-bold text-xs transition-all group"
                        >
                          <div className="p-2 bg-brand-bg rounded-lg group-hover:bg-brand-accent group-hover:text-white transition-all">
                            <Settings className="w-4 h-4" />
                          </div>
                          <span>Store Settings</span>
                        </button>

                        <button 
                          onClick={() => {
                            setShowProfileDropdown(false);
                            setShowCustomerTerminal(true);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-brand-text hover:bg-brand-bg font-bold text-xs transition-all group"
                        >
                          <div className="p-2 bg-brand-bg rounded-lg group-hover:bg-brand-accent group-hover:text-white transition-all">
                            <Monitor className="w-4 h-4" />
                          </div>
                          <span>Customer Terminal</span>
                        </button>
                        <button 
                          onClick={() => logout()}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-red-500 hover:bg-red-50 font-bold text-xs transition-all group"
                        >
                          <div className="p-2 bg-red-100 rounded-lg group-hover:bg-red-200 transition-all">
                            <LogOut className="w-4 h-4" />
                          </div>
                          <span>Sign Out of Account</span>
                        </button>
                      </div>
                      <div className="p-3 bg-brand-bg text-center">
                        <p className="text-[8px] font-black text-brand-muted uppercase tracking-[0.2em]">GCash Toolkit v3.5</p>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto w-full grid grid-cols-1 md:grid-cols-[1fr] lg:grid-cols-[240px_400px_1fr] gap-6 lg:gap-8 p-4 lg:p-10 flex-1">
        {/* Far Left: Date History */}
        <aside className="hidden lg:flex flex-col gap-6">
          <div className="bg-brand-card rounded-2xl border border-brand-line p-6 shadow-sm h-fit sticky top-[120px]">
            <h3 className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-6 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> History Log
            </h3>
            
            {/* Month Selector Dropdown */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-[9px] font-black text-brand-muted uppercase tracking-widest block mb-1.5 px-1 flex items-center justify-between">
                  <span>Filter Month</span>
                  <button 
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    className={`text-[8px] px-2 py-0.5 rounded-full transition-all border ${showAllHistory ? 'bg-brand-accent border-brand-accent text-white' : 'bg-brand-bg border-brand-line text-brand-muted hover:text-brand-accent'}`}
                  >
                    {showAllHistory ? 'SHOWING ALL' : 'SHOW ALL'}
                  </button>
                </label>
                <select 
                  value={historyMonthFilter}
                  onChange={(e) => {
                    setHistoryMonthFilter(e.target.value);
                    setShowAllHistory(false); // Switch back to date-specific when changing month
                  }}
                  className="w-full bg-brand-bg border border-brand-line rounded-xl px-3 py-2.5 text-xs font-bold text-brand-text outline-none focus:border-brand-accent transition-all cursor-pointer appearance-none shadow-sm"
                >
                  {uniqueMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input 
                  type="text"
                  placeholder="Search ledger..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-line rounded-xl pl-9 pr-8 py-2.5 text-[11px] font-bold text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-accent transition-all shadow-sm"
                />
                {historySearchQuery && (
                   <button 
                    onClick={() => setHistorySearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full transition-all"
                   >
                     <X className="w-3 h-3 text-brand-muted" />
                   </button>
                )}
              </div>
            </div>

            <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {availableDates.map(dateStr => {
                const isSelected = dateStr === viewedDate;
                const isToday = dateStr === getLocalDateISO();
                const dateObj = parseLocalDateISO(dateStr);
                
                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      setViewedDate(dateStr);
                      setTransactionDate(dateStr);
                      // User explicitly clicked a historical date
                      setIsDateManuallySet(true);
                    }}
                    className={`w-full group text-left p-3 rounded-xl transition-all border ${
                      isSelected 
                        ? 'bg-brand-accent border-brand-accent text-white shadow-lg shadow-brand-accent/20' 
                        : 'bg-transparent border-transparent hover:bg-slate-100 text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-brand-text'}`}>
                          {dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-brand-muted'}`}>
                          {isToday ? 'Today' : dateObj.toLocaleDateString('en-PH', { weekday: 'long' })}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Left Section: Calculator */}
        <section className={`space-y-6 ${activeMobileTab === 'form' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-brand-card rounded-2xl border border-brand-line p-5 lg:p-8 flex flex-col gap-6 shadow-sm h-fit lg:sticky lg:top-[120px]">
            {/* Mobile Date Scroller */}
            <div className="lg:hidden space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {availableDates.map(dateStr => {
                  const isSelected = dateStr === viewedDate;
                  const dateObj = new Date(dateStr);
                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        setViewedDate(dateStr);
                        setTransactionDate(dateStr);
                        setIsDateManuallySet(true);
                      }}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${
                        isSelected ? 'bg-brand-accent border-brand-accent text-white shadow-md' : 'bg-brand-bg border-brand-line text-brand-muted'
                      }`}
                    >
                      {dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 p-4 bg-brand-bg rounded-xl border border-brand-line">
              <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Transaction Date
              </label>
              <input 
                type="date"
                value={transactionDate}
                onChange={(e) => {
                  setTransactionDate(e.target.value);
                  setIsDateManuallySet(true);
                }}
                className="w-full bg-transparent text-sm font-bold outline-none text-brand-text cursor-pointer"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">
                  {managedPeople.find(p => p.id === activePersonId)?.name || 'Profile'}'s Accounts
                </label>
                <button 
                  onClick={() => {
if (managedPeople.length === 0) {
  setShowPersonModal(true);
  return;
}
                    setIsEditingWallet(false);
                    setWalletNameInput('');
                    setWalletBalanceInput('0');
                    setShowWalletModal(true);
                  }}
                  className="text-[10px] text-brand-accent hover:underline font-bold"
                >
                  + Add Account
                </button>
              </div>
                {activeWallets.length === 0 ? (
                  <div className="p-4 bg-brand-bg rounded-xl border border-dashed border-brand-line text-center">
                    <p className="text-[10px] text-brand-muted">
                      {managedPeople.length === 0 ? 'Create a profile first' : 'No accounts for this profile.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative group col-span-2">
                      <button
                        onClick={() => setSelectedWalletId('all')}
                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                          selectedWalletId === 'all' 
                            ? 'bg-brand-accent/5 border-brand-accent' 
                            : 'bg-brand-bg border-brand-line hover:border-brand-accent/30'
                        }`}
                      >
                        <div className="text-[10px] font-black truncate opacity-60 uppercase pr-6 italic">Consolidated View</div>
                        <div className={`text-xs font-bold ${selectedWalletId === 'all' ? 'text-brand-accent' : ''}`}>
                          All Accounts Combined
                        </div>
                      </button>
                    </div>
                    {activeWallets.map(w => (
                      <div key={w.id} className="relative group">
                      <button
                        onClick={() => setSelectedWalletId(w.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                          selectedWalletId === w.id 
                            ? 'bg-brand-accent/5 border-brand-accent' 
                            : 'bg-brand-bg border-brand-line hover:border-brand-accent/30'
                        }`}
                      >
                        <div className="text-[10px] font-bold truncate opacity-60 uppercase pr-6">{w.name}</div>
                        <div className={`text-xs font-bold ${selectedWalletId === w.id ? 'text-brand-accent' : ''}`}>
                          ₱{w.balance.toLocaleString()}
                        </div>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingWalletId(w.id);
                        }}
                        className="absolute top-2 right-2 p-1 text-brand-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                        title="Delete Account"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {activeWallets.length > 0 && (
                <div className="pt-2 space-y-2">
                  <button 
                    onClick={() => setShowSummaryModal(true)}
                    className="w-full py-3 bg-brand-bg rounded-xl border border-brand-line flex items-center justify-between px-3 hover:border-brand-accent group transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-brand-accent/10 rounded-lg group-hover:bg-brand-accent/20 transition-all">
                        <BarChart3 className="w-3.5 h-3.5 text-brand-accent" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Profile Analytics</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-brand-muted group-hover:text-brand-accent transition-all" />
                  </button>

                  <button 
                    onClick={() => setShowDebtsView(true)}
                    className="w-full py-3 bg-red-50/50 rounded-xl border border-red-100 flex items-center justify-between px-3 hover:bg-red-50 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-red-500 rounded-lg group-hover:bg-red-600 transition-all">
                        <History className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-700">Active Debts</span>
                    </div>
                    <div className="flex items-center gap-2">
                       {activeTransactions.filter(t => t.isDebt && t.debtStatus === 'unpaid').length > 0 && (
                         <span className="px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-black rounded-full shadow-sm">
                           {activeTransactions.filter(t => t.isDebt && t.debtStatus === 'unpaid').length}
                         </span>
                       )}
                       <ChevronRight className="w-3 h-3 text-red-300 group-hover:text-red-500 transition-all" />
                    </div>
                  </button>

                  <button 
                    onClick={() => setShowPayoutsView(true)}
                    className="w-full py-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between px-3 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-500 rounded-lg group-hover:bg-blue-600 transition-all">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">Unclaimed Payouts</span>
                    </div>
                    <div className="flex items-center gap-2">
                       {activeTransactions.filter(t => t.isPayout && t.payoutStatus === 'unclaimed').length > 0 && (
                         <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-black rounded-full shadow-sm">
                           {activeTransactions.filter(t => t.isPayout && t.payoutStatus === 'unclaimed').length}
                         </span>
                       )}
                       <ChevronRight className="w-3 h-3 text-blue-300 group-hover:text-blue-500 transition-all" />
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Service Mode</label>
              <div className="grid grid-cols-3 gap-2 bg-brand-bg p-1.5 rounded-xl">
                <button 
                  onClick={() => setType('in')}
                  className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${type === 'in' ? 'bg-brand-accent text-white shadow-md' : 'text-brand-muted hover:bg-slate-200/50'}`}
                >
                  <ArrowUpRight className="w-4 h-4" /> 
                  <span>Cash In</span>
                </button>
                <button 
                  onClick={() => setType('out')}
                  className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${type === 'out' ? 'bg-brand-accent text-white shadow-md' : 'text-brand-muted hover:bg-slate-200/50'}`}
                >
                  <ArrowDownLeft className="w-4 h-4" /> 
                  <span>Cash Out</span>
                </button>
                <button 
                  onClick={() => setType('misc')}
                  className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${type === 'misc' ? 'bg-brand-accent text-white shadow-md' : 'text-brand-muted hover:bg-slate-200/50'}`}
                >
                  <Zap className="w-4 h-4" /> 
                  <span>Misc</span>
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {type === 'misc' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Action Subtype</label>
                  <div className="flex gap-2 bg-brand-bg p-1.5 rounded-xl">
                    <button 
                      onClick={() => setMiscSubtype('add')}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2 ${miscSubtype === 'add' ? 'bg-emerald-500 text-white' : 'text-brand-muted'}`}
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Addition
                    </button>
                    <button 
                      onClick={() => setMiscSubtype('deduct')}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2 ${miscSubtype === 'deduct' ? 'bg-orange-500 text-white' : 'text-brand-muted'}`}
                    >
                      <MinusCircle className="w-3.5 h-3.5" /> Deduction
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Amount (PHP)</label>
              <div className="relative group">
                <span className="absolute left-0 bottom-3 text-xl font-bold text-brand-muted group-focus-within:text-brand-accent">₱</span>
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-3xl font-bold pl-6 py-2 bg-transparent border-b-2 border-brand-line focus:border-brand-accent outline-none transition-all placeholder:text-brand-line text-brand-accent"
                />
              </div>
            </div>

            {type === 'misc' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Commission Fee</label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-brand-muted group-focus-within:text-brand-accent">₱</span>
                  <input 
                    type="number" 
                    value={manualFee}
                    onChange={(e) => setManualFee(e.target.value)}
                    placeholder="Enter fee..."
                    className="w-full p-3 pl-8 bg-brand-bg border border-brand-line rounded-lg text-sm font-bold focus:border-brand-accent outline-none"
                  />
                </div>
              </div>
            )}

            <div className="bg-[#f8fafc] rounded-xl p-6 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-muted font-medium">Service Fee</span>
                <span className="font-bold">₱{currentFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-brand-muted font-medium">Original Amount</span>
                <span className="font-bold">₱{(parseFloat(amount) || 0).toLocaleString()}</span>
              </div>
              <div className="pt-3 border-t border-brand-line flex justify-between items-center">
                <span className="text-sm font-bold uppercase tracking-wider">Total Collection</span>
                <span className="text-2xl font-black text-brand-accent">₱{((parseFloat(amount) || 0) + currentFee).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Reference Number (Optional)</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                <input 
                  type="text" 
                  value={refNumber}
                  onChange={(e) => setRefNumber(e.target.value)}
                  placeholder="Reference or Transaction ID..."
                  className="w-full p-3 pl-10 bg-brand-bg border border-brand-line rounded-lg text-sm focus:border-brand-accent outline-none font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-muted uppercase tracking-wider">Note (Optional)</label>
              <input 
                type="text" 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Smart Load, Meralco Bill..."
                className="w-full p-3 bg-brand-bg border border-brand-line rounded-lg text-sm focus:border-brand-accent outline-none"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50/50 rounded-xl border border-red-100">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDebt ? 'bg-red-500 text-white' : 'bg-brand-bg text-brand-muted'}`}>
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">Mark as Debt</div>
                  <div className="text-[10px] text-brand-muted">Wait for payment later</div>
                </div>
              </div>
              <button 
                onClick={() => setIsDebt(!isDebt)}
                className={`w-12 h-6 rounded-full transition-all relative ${isDebt ? 'bg-red-500' : 'bg-brand-line'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isDebt ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <AnimatePresence>
              {isDebt && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                   <label className="text-xs font-bold text-red-600 uppercase tracking-wider">Debtor's Name</label>
                   <div className="relative">
                     <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-300" />
                     <input 
                       type="text" 
                       value={debtorNameInput}
                       onChange={(e) => setDebtorNameInput(e.target.value)}
                       placeholder="Who owes this money?"
                       className="w-full p-3 pl-10 bg-red-50/30 border border-red-100 rounded-lg text-sm focus:border-red-500 outline-none placeholder:text-red-200"
                     />
                   </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Payout Toggle */}
            {type === 'out' && (
              <>
                <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isPayout ? 'bg-blue-500 text-white' : 'bg-brand-bg text-brand-muted'}`}>
                      <ArrowRightLeft className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Unclaimed Payout</div>
                      <div className="text-[10px] text-brand-muted">Recipient will claim later</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsPayout(!isPayout)}
                    className={`w-12 h-6 rounded-full transition-all relative ${isPayout ? 'bg-blue-500' : 'bg-brand-line'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isPayout ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <AnimatePresence>
                  {isPayout && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                       <label className="text-xs font-bold text-blue-600 uppercase tracking-wider">Recipient Name</label>
                       <div className="relative">
                         <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                         <input 
                           type="text" 
                           value={recipientNameInput}
                           onChange={(e) => setRecipientNameInput(e.target.value)}
                           placeholder="Who is claiming this?"
                           className="w-full p-3 pl-10 bg-blue-50/30 border border-blue-100 rounded-lg text-sm focus:border-blue-500 outline-none placeholder:text-blue-200"
                         />
                       </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            <button 
              onClick={handleSaveTransaction}
              disabled={!parseFloat(amount) || isSaving || selectedWalletId === 'all'}
              className={`w-full py-4 text-white rounded-xl font-bold text-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:scale-100 flex items-center justify-center gap-2 ${editingTransactionId ? 'bg-brand-accent shadow-lg shadow-brand-accent/20' : 'bg-brand-text'}`}
            >
              {isSaving && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>
                {isSaving 
                  ? 'Processing...' 
                  : editingTransactionId
                    ? 'Update Transaction'
                    : selectedWalletId === 'all' 
                      ? 'Select Account to Save' 
                      : 'Save Transaction'
                }
              </span>
            </button>

            {editingTransactionId && (
              <button 
                onClick={() => {
                  setEditingTransactionId(null);
                  setAmount('');
                  setManualFee('');
                  setNote('');
                }}
                className="w-full py-2 text-brand-muted hover:text-red-500 font-bold text-xs uppercase tracking-widest transition-all"
              >
                Cancel Editing
              </button>
            )}
          </div>

          <div className="bg-brand-card rounded-2xl border border-brand-line p-6 shadow-sm">
             <h3 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-4">Service Rates</h3>
             <div className="space-y-3 text-[11px]">
                {serviceNotesInput.split('\n').map(s => s.trim()).filter(Boolean).length > 0 ? (
                  serviceNotesInput.split('\n').filter(s => s.trim()).map((line, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-brand-bg rounded-lg p-2 border border-brand-line/50">
                      <span className="text-brand-text font-medium">{line.split(':')[0]}</span>
                      <span className="font-black text-brand-accent">{line.split(':')[1] || ''}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-brand-muted">Below ₱{userSettings?.feeConfig?.midThreshold || 500}</span>
                      <span className="font-bold">₱{(userSettings?.feeConfig?.midFee || 5).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-muted">₱{userSettings?.feeConfig?.midThreshold || 500} - ₱1,000</span>
                      <span className="font-bold">₱{(userSettings?.feeConfig?.fullFee || 10).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-muted">Per ₱1,000</span>
                      <span className="font-bold">₱{(userSettings?.feeConfig?.baseIncrement || 10).toFixed(2)}</span>
                    </div>
                  </>
                )}
             </div>
          </div>
        </section>

        {/* Right Section: Stats & Ledger */}
        <section className={`flex flex-col gap-6 ${activeMobileTab === 'ledger' ? 'block' : 'hidden lg:block'}`}>
          
          {/* Mobile History Search & Filters Moved Here */}
          <div className="lg:hidden space-y-4">
            <div className="flex flex-col gap-3 p-1">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">History Search</label>
                <button 
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className={`text-[8px] px-3 py-1 rounded-full font-black tracking-widest transition-all border ${showAllHistory ? 'bg-brand-accent border-brand-accent text-white shadow-lg' : 'bg-brand-bg border-brand-line text-brand-muted'}`}
                >
                  {showAllHistory ? 'VIEWING ALL HISTORY' : 'VIEW ALL HISTORY'}
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input 
                  type="text"
                  placeholder="Search ledger by note, amount, or type..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full bg-brand-card border border-brand-line rounded-xl pl-12 pr-10 py-4 text-sm font-bold text-brand-text placeholder:text-brand-muted outline-none focus:border-brand-accent transition-all shadow-sm"
                />
                {historySearchQuery && (
                  <button 
                    onClick={() => setHistorySearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-brand-text" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <select 
                  value={historyMonthFilter}
                  onChange={(e) => {
                    setHistoryMonthFilter(e.target.value);
                    setShowAllHistory(false);
                  }}
                  className="flex-1 bg-brand-card border border-brand-line rounded-xl px-4 py-3.5 text-xs font-bold text-brand-text outline-none focus:border-brand-accent appearance-none border-b-2 border-b-brand-accent/30 shadow-sm"
                >
                  {uniqueMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <div className="flex items-center justify-center bg-brand-accent/5 border border-brand-accent/10 text-brand-accent rounded-xl px-5 py-3.5 text-[10px] font-black shadow-sm">
                  {availableDates.length} DAYS
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 lg:gap-6">
            <div className="bg-brand-card p-6 rounded-2xl border border-brand-line shadow-sm border-l-4 border-l-brand-accent">
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1 flex justify-between items-center">
                <span>{selectedWalletId === 'all' ? 'Consolidated Balance' : (wallets.find(w => w.id === selectedWalletId)?.name || 'Account Balance')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-brand-muted font-normal max-w-[80px] truncate">
                    ({managedPeople.find(p => p.id === activePersonId)?.name})
                  </span>
                  {selectedWalletId !== 'all' && (
                    <button 
                      onClick={() => {
                        const w = wallets.find(w => w.id === selectedWalletId);
                        if (!w) return;
                        setWalletNameInput(w.name);
                        setWalletBalanceInput(w.balance.toString());
                        setIsEditingWallet(true);
                        setShowWalletModal(true);
                      }}
                      className="text-brand-accent hover:underline text-[9px]"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <div className="text-2xl font-bold flex items-center gap-2">
                ₱{selectedWalletId === 'all' 
                   ? activeWallets.reduce((sum, w) => sum + w.balance, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                   : (wallets.find(w => w.id === selectedWalletId)?.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00')}
                <WalletIcon className="w-4 h-4 text-brand-muted" />
              </div>
            </div>
            <div className="bg-brand-card p-6 rounded-2xl border border-brand-line shadow-sm border-l-4 border-l-brand-success/50">
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">
                {showAllHistory 
                   ? 'Total Period Inflow' 
                   : `${new Date(viewedDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} Inflow`}
              </div>
              <div className="text-2xl font-bold">₱{stats.totalIn.toLocaleString()}</div>
            </div>
            <div className="bg-brand-card p-6 rounded-2xl border border-brand-line shadow-sm border-l-4 border-l-orange-400">
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">
                {showAllHistory 
                   ? 'Total Period Outflow' 
                   : `${new Date(viewedDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} Outflow`}
              </div>
              <div className="text-2xl font-bold">₱{stats.totalOut.toLocaleString()}</div>
            </div>
            <div className="bg-brand-card p-6 rounded-2xl border border-brand-line shadow-sm border-l-4 border-l-brand-success">
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">
                {showAllHistory 
                   ? 'Total Period Profit' 
                   : `${new Date(viewedDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} Profit`}
              </div>
              <div className="text-2xl font-bold text-brand-success">₱{stats.totalFees.toLocaleString()}</div>
            </div>
          </div>

            <div className="bg-brand-card rounded-2xl border border-brand-line shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="bg-slate-100/30 px-8 py-5 border-b border-brand-line flex justify-between items-center whitespace-nowrap overflow-auto gap-4">
              <div className="flex items-center gap-4">
                <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <History className="w-4 h-4 text-brand-accent" /> 
                  <span className="hidden sm:inline">{managedPeople.find(p => p.id === activePersonId)?.name || 'Ledger'}:</span>
                  <span className="text-brand-accent ml-1 italic underline underline-offset-4 decoration-brand-accent/30">
                    {showAllHistory 
                       ? 'Full Activity Log' 
                       : new Date(viewedDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    }
                  </span>
                </span>
                
                {historySearchQuery && (
                   <span className="px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/20 rounded-md text-[9px] font-bold text-brand-accent uppercase italic">
                     Search: "{historySearchQuery}"
                   </span>
                )}
              </div>
              <span className="bg-brand-accent/10 text-brand-accent px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border border-brand-accent/10">
                <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse shadow-[0_0_8px_rgba(0,99,255,0.5)]" /> 
                Live Sink
              </span>
            </div>

            <div className="flex-1 overflow-auto min-h-[450px]">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50/10">
                    <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-wider border-b border-brand-line">Time</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-wider border-b border-brand-line">Type & Cat</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-wider border-b border-brand-line">Amount</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-wider border-b border-brand-line">Fee</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-brand-muted uppercase tracking-wider border-b border-brand-line text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false} mode="wait">
                    {filteredTransactions.length === 0 ? (
                      <motion.tr
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <td colSpan={5} className="px-8 py-24 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-30">
                            <Search className="w-10 h-10" />
                            <p className="text-sm font-bold uppercase tracking-widest">No matching activities</p>
                            <p className="text-[10px] font-medium max-w-[200px] mx-auto text-brand-muted">Try using a different keyword or checking another date.</p>
                          </div>
                        </td>
                      </motion.tr>
                    ) : (
                      filteredTransactions.map((t) => (
                        <motion.tr 
                          layout
                          key={t.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-brand-bg/40 transition-colors group"
                        >
                          <td className="px-8 py-4">
                             <div className="flex flex-col">
                               <span className="text-[11px] font-bold text-brand-text">
                                  {new Date(t.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                               </span>
                               {(showAllHistory || historySearchQuery) && (
                                 <span className="text-[9px] font-medium text-brand-muted uppercase">
                                   {new Date(t.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                 </span>
                               )}
                             </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 w-fit ${
                                (t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add')) 
                                ? 'bg-emerald-50 text-emerald-700' 
                                : 'bg-orange-50 text-orange-700'
                              }`}>
                                { (t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add')) ? <PlusCircle className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" /> }
                                { (t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add')) ? 'Addition' : 'Deduction' }
                              </span>
                              <span className="text-[9px] font-bold text-brand-muted uppercase tracking-tighter flex items-center gap-1">
                                {t.type === 'in' && <><ArrowUpRight className="w-2.5 h-2.5" /> Cash In</>}
                                {t.type === 'out' && <><ArrowDownLeft className="w-2.5 h-2.5" /> Cash Out</>}
                                {t.type === 'misc' && <><Zap className="w-2.5 h-2.5" /> Miscellaneous</>}
                              </span>
                              <span className="text-[8px] font-black text-brand-accent/70 uppercase tracking-widest mt-0.5">
                                Account: {wallets.find(w => w.id === t.walletId)?.name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-4 font-bold text-sm">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                ₱{t.amount.toLocaleString()}
                                {t.isDebt && (
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-black ${t.debtStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {t.debtStatus === 'paid' ? 'Paid Debt' : 'Debt'}
                                  </span>
                                )}
                                {t.isPayout && (
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-black ${t.payoutStatus === 'claimed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {t.payoutStatus === 'claimed' ? 'Claimed Payout' : 'Payout'}
                                  </span>
                                )}
                              </div>
                              {t.debtorName && (
                                <div className="text-[9px] font-black text-red-600 uppercase tracking-tight flex items-center gap-1">
                                  <UserIcon className="w-3 h-3" /> {t.debtorName}
                                </div>
                              )}
                              {t.recipientName && (
                                <div className="text-[9px] font-black text-blue-600 uppercase tracking-tight flex items-center gap-1">
                                  <UserIcon className="w-3 h-3" /> {t.recipientName}
                                </div>
                              )}
                              {t.note && <div className="text-[10px] font-normal text-brand-muted max-w-[150px] truncate"> {t.note}</div>}
                              {t.refNumber && (
                                <div className="text-[9px] font-black text-brand-accent uppercase tracking-tight flex items-center gap-1 mt-1 font-mono">
                                  <Hash className="w-2.5 h-2.5" /> REF: {t.refNumber}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-4 text-sm font-bold">₱{t.fee.toLocaleString()}</td>
                          <td className="px-8 py-4 text-right">
                             <div className="flex items-center justify-end gap-2 text-right">
                                <button 
                                  onClick={() => startEditingTransaction(t)}
                                  className="p-1.5 bg-brand-bg text-brand-muted hover:text-brand-accent hover:bg-brand-accent/5 border border-brand-line rounded-lg transition-all shadow-sm"
                                  title="Edit Transaction"
                                >
                                  <Settings className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setDeletingId(t.id)}
                                  className="p-1.5 bg-brand-bg text-brand-muted hover:text-red-500 hover:bg-red-50 border border-brand-line rounded-lg transition-all shadow-sm"
                                  title="Delete Transaction"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                             </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-brand-card border-t border-brand-line p-2 flex justify-around items-center z-40 md:hidden pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setActiveMobileTab('form')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeMobileTab === 'form' ? 'bg-brand-accent/10 text-brand-accent' : 'text-brand-muted'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-bold">Services</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('ledger')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeMobileTab === 'ledger' ? 'bg-brand-accent/10 text-brand-accent' : 'text-brand-muted'}`}
        >
          <ReceiptText className="w-5 h-5" />
          <span className="text-[11px] font-bold">Ledger</span>
        </button>
        <button 
          onClick={() => setShowGlobalStats(true)}
          className="flex flex-col items-center gap-1 p-2 text-brand-muted rounded-xl bg-slate-100/50"
        >
          <PieChart className="w-5 h-5" />
          <span className="text-[10px] font-bold">Network</span>
        </button>
      </nav>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />

      {/* Export Date Picker Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExportModal(false)}
              className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-card rounded-2xl p-8 w-full max-w-sm relative z-10 shadow-2xl border border-brand-line"
            >
              <h3 className="text-xl font-bold mb-2">Export Data</h3>
              <p className="text-brand-muted text-sm mb-6">Select the date you want to export.</p>
              
              <div className="space-y-6 mb-8">
                <div className="flex bg-brand-bg p-1.5 rounded-2xl border border-brand-line">
                  <button 
                    onClick={() => setExportRange('day')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${exportRange === 'day' ? 'bg-brand-accent text-white shadow-lg' : 'text-brand-muted hover:bg-slate-200/50'}`}
                  >
                    Daily
                  </button>
                  <button 
                    onClick={() => setExportRange('month')}
                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${exportRange === 'month' ? 'bg-brand-accent text-white shadow-lg' : 'text-brand-muted hover:bg-slate-200/50'}`}
                  >
                    Monthly
                  </button>
                </div>

                <div className="p-5 bg-brand-bg rounded-2xl border border-brand-line">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] block mb-3">
                    {exportRange === 'day' ? 'Choose Date' : 'Choose Target month'}
                  </label>
                  <input 
                    type={exportRange === 'day' ? 'date' : 'month'}
                    value={exportDate.substring(0, exportRange === 'day' ? 10 : 7)}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (exportRange === 'month') {
                        // Month input returns YYYY-MM
                        setExportDate(`${val}-01`);
                      } else {
                        setExportDate(val);
                      }
                    }}
                    className="w-full bg-transparent font-black italic text-brand-text outline-none text-xl md:text-2xl cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-3 bg-brand-bg text-brand-muted font-bold rounded-lg hover:bg-brand-line transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={exportToExcel}
                  className="flex-1 py-3 bg-brand-accent text-white font-bold rounded-lg hover:opacity-90 transition-all shadow-md shadow-brand-accent/20"
                >
                  Download
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Wallet / Account Modal */}
      <AnimatePresence>
        {showWalletModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWalletModal(false)}
              className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-card rounded-2xl p-8 w-full max-w-sm relative z-10 shadow-2xl border border-brand-line"
            >
              <h3 className="text-xl font-bold mb-2">{isEditingWallet ? 'Edit Account' : 'New Account'}</h3>
              <p className="text-brand-muted text-sm mb-6">Details for this money pool.</p>
              
              <div className="space-y-4 mb-8">
                <div className="p-4 bg-brand-bg rounded-xl border border-brand-line">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest block mb-2">Account Name</label>
                  <input 
                    type="text"
                    value={walletNameInput}
                    onChange={(e) => setWalletNameInput(e.target.value)}
                    placeholder="e.g. Personal GCash"
                    className="w-full bg-transparent font-bold outline-none text-brand-text"
                  />
                </div>

                <div className="p-4 bg-brand-bg rounded-xl border border-brand-line">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest block mb-2">Current Balance (₱)</label>
                  <input 
                    type="number"
                    value={walletBalanceInput}
                    onChange={(e) => setWalletBalanceInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent font-bold outline-none text-brand-text"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowWalletModal(false)}
                  className="flex-1 py-3 bg-brand-bg text-brand-muted font-bold rounded-lg hover:bg-brand-line transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpsertWallet}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-brand-accent text-white font-bold rounded-lg hover:opacity-90 transition-all shadow-md shadow-brand-accent/20"
                >
                  {isSaving ? 'Saving...' : (isEditingWallet ? 'Update' : 'Create')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Single Transaction Deletion Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-card rounded-2xl p-8 w-full max-w-sm relative z-10 shadow-2xl border border-brand-line"
            >
              <h3 className="text-xl font-bold mb-2">Delete Transaction?</h3>
              <p className="text-brand-muted text-sm mb-8">Are you sure you want to remove this transaction? This cannot be undone.</p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-3 bg-brand-bg text-brand-muted font-bold rounded-lg hover:bg-brand-line transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteTransaction}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-all shadow-md shadow-red-200 disabled:opacity-50"
                >
                  {isSaving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-card rounded-2xl p-8 w-full max-w-sm relative z-10 shadow-2xl border border-brand-line"
            >
              <h3 className="text-xl font-bold mb-2">Clear Records</h3>
              <p className="text-brand-muted text-sm mb-6">Select a date to remove its records from the cloud.</p>
              
              <div className="space-y-4 mb-8">
                <div className="p-4 bg-brand-bg rounded-xl border border-brand-line">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest block mb-2">Select Date</label>
                  <input 
                    type="date"
                    value={clearDate}
                    onChange={(e) => setClearDate(e.target.value)}
                    className="w-full bg-transparent font-bold outline-none text-brand-text"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 bg-brand-bg text-brand-muted font-bold rounded-lg hover:bg-brand-line transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={clearHistory}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-all shadow-md shadow-red-200 disabled:opacity-50"
                >
                  {isSaving ? 'Clearing...' : 'Clear Date'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Person Management Modal */}
      <AnimatePresence>
        {showPersonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPersonModal(false)}
              className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-card rounded-2xl p-8 w-full max-w-sm relative z-10 shadow-2xl border border-brand-line"
            >
              <h3 className="text-xl font-bold mb-2">Profile Management</h3>
              <p className="text-brand-muted text-sm mb-6">Add or edit people to manage separate ledgers.</p>
              
              <div className="space-y-4 mb-8">
                <div className="p-4 bg-brand-bg rounded-xl border border-brand-line">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest block mb-2">Full Name</label>
                  <input 
                    type="text"
                    value={personNameInput}
                    onChange={(e) => setPersonNameInput(e.target.value)}
                    placeholder="e.g. Employee A or Customer Name"
                    className="w-full bg-transparent font-bold outline-none text-brand-text"
                    autoFocus
                  />
                </div>

                {managedPeople.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest block">Existing Profiles</label>
                    <div className="max-h-[150px] overflow-y-auto space-y-1 custom-scrollbar pr-1">
                      {managedPeople.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 bg-brand-bg rounded-lg border border-brand-line text-xs">
                          <span className="font-bold truncate max-w-[120px]">{p.name}</span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => {
                                setIsEditingPerson(true);
                                setEditingPersonId(p.id);
                                setPersonNameInput(p.name);
                              }}
                              className="text-brand-accent hover:underline px-2 py-1 font-bold"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => setDeletingPersonId(p.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Delete Profile"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setShowPersonModal(false);
                    setIsEditingPerson(false);
                    setEditingPersonId(null);
                    setPersonNameInput('');
                    setDeletingPersonId(null);
                  }}
                  className="flex-1 py-3 bg-brand-bg text-brand-muted font-bold rounded-lg hover:bg-brand-line transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpsertPerson}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-brand-accent text-white font-bold rounded-lg hover:opacity-90 transition-all shadow-md shadow-brand-accent/20"
                >
                  {isSaving ? 'Saving...' : (isEditingPerson ? 'Update' : 'Save')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Global Summary Modal */}
      <AnimatePresence>
        {showGlobalStats && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGlobalStats(false)} className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-brand-card rounded-2xl p-6 md:p-8 w-full max-w-2xl relative z-10 shadow-2xl border border-brand-line flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold">Network Summary</h3>
                  <p className="text-brand-muted text-[10px] md:text-sm">Aggregate data across all managed profiles.</p>
                </div>
                <button onClick={() => { setShowGlobalStats(false); setDeletingPersonId(null); setDeletingWalletId(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-brand-bg p-4 rounded-xl border border-brand-line">
                  <div className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-1">Network Balance</div>
                  <div className="text-lg md:text-xl font-black text-brand-accent">₱{globalStats.totalBalance.toLocaleString()}</div>
                </div>
                <div className="bg-brand-bg p-4 rounded-xl border border-brand-line">
                  <div className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-1">Total Lifetime Profit</div>
                  <div className="text-lg md:text-xl font-bold text-emerald-600">₱{globalStats.allTimeProfit.toLocaleString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-8">
                <div className="bg-brand-bg p-4 rounded-xl border border-brand-line">
                  <div className="text-[8px] font-black text-brand-muted uppercase tracking-widest mb-1">Today's Profit</div>
                  <div className="text-sm font-black">₱{globalStats.globalProfit.toLocaleString()}</div>
                </div>
                <div className="bg-brand-bg p-4 rounded-xl border border-brand-line">
                  <div className="text-[8px] font-black text-brand-muted uppercase tracking-widest mb-1">All-Time Inflow</div>
                  <div className="text-sm font-bold text-blue-600">₱{globalStats.allTimeIn.toLocaleString()}</div>
                </div>
                <div className="bg-brand-bg p-4 rounded-xl border border-brand-line">
                  <div className="text-[8px] font-black text-brand-muted uppercase tracking-widest mb-1">All-Time Outflow</div>
                  <div className="text-sm font-bold text-orange-600">₱{globalStats.allTimeOut.toLocaleString()}</div>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar pr-2 space-y-3">
                 <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 border-b border-brand-line pb-1">Profile Overviews</p>
                 {managedPeople.map(p => (
                   <div key={p.id} className="p-4 bg-brand-bg rounded-xl border border-brand-line flex justify-between items-center">
                     <div>
                       <div className="font-bold text-sm">{p.name}</div>
                     </div>
                     <button onClick={() => { setActivePersonId(p.id); setShowGlobalStats(false); }} className="text-[10px] font-bold text-brand-accent border border-brand-accent px-3 py-1 rounded-full hover:bg-brand-accent hover:text-white transition-all">
                       View Ledger
                     </button>
                   </div>
                 ))}
              </div>

              <div className="mt-8 p-4 bg-slate-900 rounded-xl text-white flex justify-between items-center">
                <div className="text-[10px] font-medium opacity-70 uppercase tracking-widest">Global Status</div>
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> All Systems Online
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payouts View Modal */}
      <AnimatePresence>
        {showPayoutsView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPayoutsView(false)} className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-brand-card rounded-2xl p-6 md:p-8 w-full max-w-lg relative z-10 shadow-2xl border border-brand-line flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter">Unclaimed <span className="text-blue-500">Payouts</span></h3>
                  <p className="text-brand-muted text-[10px] uppercase tracking-widest font-bold">Pending disbursements for {managedPeople.find(p => p.id === activePersonId)?.name}</p>
                </div>
                <button onClick={() => setShowPayoutsView(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {groupedPayouts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ArrowRightLeft className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-brand-muted">No unclaimed payouts found.</p>
                    <p className="text-xs text-brand-muted opacity-60">All cash-ins have been claimed.</p>
                  </div>
                ) : (
                  groupedPayouts.map(([recipientName, records]) => {
                    const isExpanded = expandedRecipients[recipientName];
                    const totalForRecipient = records.reduce((sum, r) => sum + r.amount, 0);
                    
                    return (
                      <div key={recipientName} className="border border-brand-line rounded-xl overflow-hidden shadow-sm">
                        <button 
                          onClick={() => setExpandedRecipients(prev => ({ ...prev, [recipientName]: !prev[recipientName] }))}
                          className={`w-full p-4 flex items-center justify-between transition-colors ${isExpanded ? 'bg-blue-50' : 'bg-brand-bg hover:bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <UserIcon className="w-4 h-4 text-blue-500" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-black uppercase tracking-tight">{recipientName}</div>
                              <div className="text-[10px] text-brand-muted font-bold">{records.length} pending claims</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Total</div>
                              <div className="text-sm font-black">₱{totalForRecipient.toLocaleString()}</div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-brand-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-white border-t border-brand-line"
                            >
                              <div className="p-3 space-y-3">
                                {records.sort((a,b) => b.timestamp - a.timestamp).map(t => {
                                  return (
                                    <div key={t.id} className="p-4 bg-slate-50 rounded-xl border border-brand-line/50 space-y-3 transition-all">
                                      <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                          <div className="text-[9px] font-black uppercase text-brand-muted tracking-widest flex items-center gap-2">
                                            {t.type === 'in' ? 'Incoming Payout' : t.type === 'out' ? 'Outgoing Payout' : 'Misc Payout'} 
                                            <span className="opacity-40">•</span>
                                            {new Date(t.timestamp).toLocaleDateString()}
                                          </div>
                                          <div className="text-xl font-black">₱{t.amount.toLocaleString()}</div>
                                          {t.note && <div className="text-[10px] italic text-brand-muted opacity-80">"{t.note}"</div>}
                                        </div>

                                        <div className="flex flex-col gap-2 scale-90 origin-top-right">
                                          <button 
                                            disabled={isSaving}
                                            onClick={() => handleResolvePayout(t)}
                                            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                          >
                                            Mark as Claimed
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-brand-line flex justify-between items-center px-2">
                <div>
                   <label className="text-[8px] font-black text-brand-muted uppercase tracking-widest block">Total Unclaimed</label>
                   <div className="text-lg font-black text-blue-600">
                     ₱{activeTransactions.filter(t => t.isPayout && t.payoutStatus === 'unclaimed').reduce((sum, t) => sum + (t.amount - (t.claimedAmount || 0)), 0).toLocaleString()}
                   </div>
                </div>
                <div className="text-right">
                   <label className="text-[8px] font-black text-brand-muted uppercase tracking-widest block">Count</label>
                   <div className="text-sm font-bold opacity-60">
                     {activeTransactions.filter(t => t.isPayout && t.payoutStatus === 'unclaimed').length} Records
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDebtsView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDebtsView(false)} className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-brand-card rounded-2xl p-6 md:p-8 w-full max-w-lg relative z-10 shadow-2xl border border-brand-line flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter">Pending <span className="text-red-500">Debts</span></h3>
                  <p className="text-brand-muted text-[10px] uppercase tracking-widest font-bold">Unpaid obligations for {managedPeople.find(p => p.id === activePersonId)?.name}</p>
                </div>
                <button onClick={() => setShowDebtsView(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {groupedDebts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Zap className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-brand-muted">No pending debts found.</p>
                    <p className="text-xs text-brand-muted opacity-60">Everything is clear for this profile.</p>
                  </div>
                ) : (
                  groupedDebts.map(([debtorName, records]) => {
                    const isExpanded = expandedDebtors[debtorName];
                    const totalForDebtor = records.reduce((sum, r) => sum + r.amount, 0);
                    
                    return (
                      <div key={debtorName} className="border border-brand-line rounded-xl overflow-hidden shadow-sm">
                        <button 
                          onClick={() => setExpandedDebtors(prev => ({ ...prev, [debtorName]: !prev[debtorName] }))}
                          className={`w-full p-4 flex items-center justify-between transition-colors ${isExpanded ? 'bg-red-50' : 'bg-brand-bg hover:bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                              <UserIcon className="w-4 h-4 text-red-500" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-black uppercase tracking-tight">{debtorName}</div>
                              <div className="text-[10px] text-brand-muted font-bold">{records.length} pending records</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-[9px] font-black text-red-600 uppercase tracking-widest">Balance</div>
                              <div className="text-sm font-black">₱{totalForDebtor.toLocaleString()}</div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-brand-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-white border-t border-brand-line"
                            >
                              <div className="p-3 space-y-3">
                                {records.sort((a,b) => b.timestamp - a.timestamp).map(t => {
                                  const paid = t.paidAmount || 0;
                                  const remaining = t.amount - paid;
                                  const progress = (paid / t.amount) * 100;
                                  const isPayingPartial = activeDebtIdForPartial === t.id;

                                  return (
                                    <div key={t.id} className="p-4 bg-slate-50 rounded-xl border border-brand-line/50 space-y-3 transition-all">
                                      <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                          <div className="text-[9px] font-black uppercase text-brand-muted tracking-widest flex items-center gap-2">
                                            {t.type === 'in' ? 'Service Credit' : t.type === 'out' ? 'Cash Loan' : 'Misc Debt'} 
                                            <span className="opacity-40">•</span>
                                            {new Date(t.timestamp).toLocaleDateString()}
                                          </div>
                                          <div className="text-xl font-black">₱{t.amount.toLocaleString()}</div>
                                          {t.note && <div className="text-[10px] italic text-brand-muted opacity-80">"{t.note}"</div>}
                                        </div>

                                        <div className="flex flex-col gap-2 scale-90 origin-top-right">
                                          <button 
                                            disabled={isSaving}
                                            onClick={() => handleResolveDebt(t)}
                                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                          >
                                            Mark as Paid
                                          </button>
                                          <button 
                                            disabled={isSaving}
                                            onClick={() => {
                                              setActiveDebtIdForPartial(isPayingPartial ? null : t.id);
                                              setPartialPayAmount('');
                                            }}
                                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50 ${isPayingPartial ? 'bg-slate-200 text-slate-700' : 'bg-white border border-brand-line text-brand-text hover:bg-slate-50'}`}
                                          >
                                            Partial Pay
                                          </button>
                                        </div>
                                      </div>

                                      {/* Progress Section */}
                                      <div className="space-y-1.5 pt-1">
                                        <div className="flex justify-between items-end text-[9px] font-black uppercase tracking-widest">
                                          <span className="text-emerald-600">Paid: ₱{paid.toLocaleString()}</span>
                                          <span className="text-red-600">Remaining: ₱{remaining.toLocaleString()}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                          <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            className={`h-full ${progress > 75 ? 'bg-emerald-500' : progress > 25 ? 'bg-orange-400' : 'bg-red-500'}`}
                                          />
                                        </div>
                                      </div>

                                      {/* Partial Payment Input */}
                                      <AnimatePresence>
                                        {isPayingPartial && (
                                          <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="pt-2 border-t border-brand-line/30 space-y-2 overflow-hidden"
                                          >
                                            <div className="flex gap-2">
                                              <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-muted">₱</span>
                                                <input 
                                                  type="number" 
                                                  value={partialPayAmount}
                                                  onChange={(e) => setPartialPayAmount(e.target.value)}
                                                  placeholder="Amount to pay..."
                                                  className="w-full pl-7 pr-3 py-2 bg-white border border-brand-line rounded-lg text-sm focus:border-brand-accent outline-none font-bold"
                                                />
                                              </div>
                                              <button 
                                                disabled={isSaving || !parseFloat(partialPayAmount)}
                                                onClick={() => handlePartialPayment(t)}
                                                className="px-4 py-2 bg-brand-accent text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-accent/90 disabled:opacity-50"
                                              >
                                                Confirm
                                              </button>
                                            </div>
                                            <p className="text-[8px] text-brand-muted italic px-1 tracking-wider">Note: This will increase your wallet balance and reduce the debt.</p>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-brand-line flex justify-between items-center px-2">
                <div>
                   <label className="text-[8px] font-black text-brand-muted uppercase tracking-widest block">Total Receivable</label>
                   <div className="text-lg font-black text-red-600">
                     ₱{activeTransactions.filter(t => t.isDebt && t.debtStatus === 'unpaid').reduce((sum, t) => sum + (t.amount - (t.paidAmount || 0)), 0).toLocaleString()}
                   </div>
                </div>
                <div className="text-right">
                   <label className="text-[8px] font-black text-brand-muted uppercase tracking-widest block">Count</label>
                   <div className="text-sm font-bold opacity-60">
                     {activeTransactions.filter(t => t.isDebt && t.debtStatus === 'unpaid').length} Records
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Summary / Reports Modal */}
      <AnimatePresence>
        {showSummaryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSummaryModal(false)} className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0.9, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0.9, scale: 0.98 }} className="bg-brand-card rounded-2xl md:rounded-[2rem] p-4 md:p-8 w-full max-w-4xl relative z-10 shadow-2xl border border-brand-line flex flex-col max-h-[95vh] md:max-h-[90vh]">
              <div className="flex flex-col md:flex-row justify-between items-start mb-6 md:mb-8 gap-4">
                <div className="flex flex-col md:flex-row gap-6 items-start w-full md:w-auto">
                  <div>
                    <h3 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic">
                      Financial <span className="text-brand-accent">Report</span>
                    </h3>
                    <p className="text-brand-muted text-[10px] font-mono uppercase tracking-[0.2em] mt-1">Profile: {managedPeople.find(p => p.id === activePersonId)?.name || 'N/A'}</p>
                  </div>

                  {/* Date Picker (Month Selector) */}
                  <div className="flex bg-brand-bg rounded-xl p-1 border border-brand-line w-full md:w-auto justify-between md:justify-start">
                    <button 
                      onClick={() => setSelectedReportMonth('All Time')}
                      className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${selectedReportMonth === 'All Time' ? 'bg-brand-accent text-white shadow-sm' : 'text-brand-muted hover:bg-brand-line'}`}
                    >
                      All Time
                    </button>
                    <select 
                      value={selectedReportMonth !== 'All Time' ? selectedReportMonth : ''}
                      onChange={(e) => setSelectedReportMonth(e.target.value)}
                      className={`bg-transparent outline-none text-[9px] md:text-[10px] font-black uppercase tracking-widest px-3 border-l border-brand-line transition-all cursor-pointer flex-1 md:flex-none ${selectedReportMonth !== 'All Time' ? 'text-brand-accent' : 'text-brand-muted'}`}
                    >
                      <option value="" disabled>Specific Month</option>
                      {monthlyAccountSummary.map(([month]) => (
                        <option key={month} value={month}>{month}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  <button 
                    onClick={() => setShowSharePrompt(true)}
                    disabled={isSharing || isSendingEmail}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-emerald-50 text-emerald-700 rounded-xl md:rounded-2xl border border-emerald-100 hover:bg-emerald-100 transition-all text-[10px] md:text-xs font-bold shadow-sm disabled:opacity-50"
                  >
                    {isSharing || isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share className="w-3 h-3 md:w-4 h-4" />}
                    <span>{isSharing || isSendingEmail ? 'Processing...' : 'Share Report'}</span>
                  </button>
                  <button onClick={() => { 
                    setShowSummaryModal(false); 
                    setSharedReportUrl(null); 
                    setDeletingId(null);
                    setDeletingPersonId(null);
                    setDeletingWalletId(null);
                  }} className="p-2.5 md:p-3 bg-brand-bg hover:bg-brand-line rounded-full border border-brand-line transition-all">
                    <X className="w-4 h-4 md:w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Shared Options Prompt */}
              <AnimatePresence>
                {showSharePrompt && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSharePrompt(false)} className="absolute inset-0 bg-brand-text/40 backdrop-blur-md" />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                      animate={{ opacity: 1, scale: 1, y: 0 }} 
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="bg-brand-card rounded-3xl p-6 md:p-8 w-full max-w-sm relative z-10 shadow-3xl border border-brand-line"
                    >
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
                          <Share className="w-8 h-8" />
                        </div>
                        <h4 className="text-xl font-black uppercase italic tracking-tight">Share <span className="text-emerald-600">Report</span></h4>
                        <p className="text-[10px] text-brand-muted font-bold uppercase tracking-widest mt-1">Select your preferred method</p>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={() => {
                            setShowSharePrompt(false);
                            handleShareReport();
                          }}
                          className="w-full flex items-center justify-between p-4 bg-brand-bg hover:bg-emerald-50 border border-brand-line hover:border-emerald-200 rounded-2xl transition-all group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                              <LinkIcon className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-black uppercase italic leading-none mb-1">Generate Link</div>
                              <div className="text-[9px] text-brand-muted font-bold tracking-tight uppercase">Copy to clipboard</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-brand-muted" />
                        </button>

                        <button 
                          onClick={() => {
                            setShowSharePrompt(false);
                            handleManualTestEmail();
                          }}
                          className="w-full flex items-center justify-between p-4 bg-brand-bg hover:bg-blue-50 border border-brand-line hover:border-blue-200 rounded-2xl transition-all group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                              <Mail className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-black uppercase italic leading-none mb-1">Send to Email</div>
                              <div className="text-[9px] text-brand-muted font-bold tracking-tight uppercase">Bound to account</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-brand-muted" />
                        </button>
                      </div>

                      <button 
                        onClick={() => setShowSharePrompt(false)}
                        className="w-full mt-6 py-3 text-brand-muted hover:text-brand-text font-black uppercase tracking-[0.2em] text-[10px] transition-all"
                      >
                        Cancel
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Share URL Success Alert */}
              <AnimatePresence>
                {sharedReportUrl && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="mb-8 p-4 bg-emerald-600 rounded-2xl text-white shadow-xl flex items-center justify-between gap-4 flex-shrink-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-white/20 rounded-xl flex-shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Share Link Generated</div>
                        <div className="text-xs font-mono truncate">{sharedReportUrl}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(sharedReportUrl);
                      }}
                      className="px-6 py-2 bg-white text-emerald-700 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                    >
                      <Copy className="w-3 h-3" /> Copy Link
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="overflow-y-auto flex-1 custom-scrollbar pr-0 md:pr-4 space-y-6 md:space-y-12">
                {/* Analytics Snapshot Header (only if sharing it) */}
                {selectedReportMonth !== 'All Time' && (
                  <div className="bg-brand-accent/5 rounded-2xl md:rounded-3xl p-5 md:p-8 border border-brand-accent/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                      <div className="text-[10px] font-black text-brand-accent uppercase tracking-[0.3em] mb-1">Detailed Analysis For</div>
                      <div className="text-2xl md:text-4xl font-black italic tracking-tighter uppercase">{selectedReportMonth}</div>
                    </div>
                    <div className="flex gap-4 md:gap-8 w-full md:w-auto">
                       {(() => {
                          const mData = monthlySummary.find(m => m[0] === selectedReportMonth)?.[1] || { in: 0, out: 0, profit: 0 };
                          return (
                            <>
                              <div className="text-left md:text-right flex-1 md:flex-none">
                                <label className="text-[10px] font-black text-brand-muted uppercase block mb-1">Total Month In</label>
                                <span className="text-xl md:text-2xl font-black text-emerald-600">₱{mData.in.toLocaleString()}</span>
                              </div>
                              <div className="text-left md:text-right border-l border-brand-line pl-4 md:pl-8 flex-1 md:flex-none">
                                <label className="text-[10px] font-black text-brand-muted uppercase block mb-1">Total Net Profit</label>
                                <span className="text-xl md:text-2xl font-black text-brand-accent">₱{mData.profit.toLocaleString()}</span>
                              </div>
                            </>
                          )
                       })()}
                    </div>
                  </div>
                )}

                {/* Monthly Account Overviews */}
                {(selectedReportMonth === 'All Time' 
                  ? monthlyAccountSummary 
                  : monthlyAccountSummary.filter(m => m[0] === selectedReportMonth)
                ).map(([month, walletsMap]) => (
                  <section key={month} className="space-y-4 md:space-y-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b-2 border-brand-accent/20 pb-2 gap-2">
                       <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 md:w-5 h-5 text-brand-accent" />
                        <h4 className="text-lg md:text-xl font-black italic tracking-tight uppercase">{month}</h4>
                      </div>
                      <div className="flex gap-4">
                        {(() => {
                          const monthTotals = monthlySummary.find(m => m[0] === month)?.[1] || { in: 0, out: 0, profit: 0 };
                          return (
                            <>
                              <div className="text-right">
                                <label className="text-[8px] font-black text-brand-muted uppercase block leading-none">Monthly In</label>
                                <span className="text-xs font-bold text-emerald-600">₱{monthTotals.in.toLocaleString()}</span>
                              </div>
                              <div className="text-right border-l border-brand-line pl-4">
                                <label className="text-[8px] font-black text-brand-muted uppercase block leading-none">Monthly Profit</label>
                                <span className="text-xs md:text-sm font-black text-brand-accent">₱{monthTotals.profit.toLocaleString()}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="grid gap-2 md:gap-3 pl-3 md:pl-4 border-l-2 border-brand-line/50">
                      {Object.entries(walletsMap as Record<string, any>).map(([wid, stats]: [string, any]) => (
                        <div key={wid} className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center p-3 md:p-4 bg-brand-bg rounded-xl md:rounded-2xl border border-brand-line hover:border-brand-accent/30 transition-all group gap-3">
                          <div className="w-full sm:col-span-1 border-b sm:border-none pb-2 sm:pb-0">
                            <div className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-0.5">{stats.walletName}</div>
                          </div>
                          <div className="flex sm:grid sm:grid-cols-3 sm:col-span-3 w-full justify-between items-center gap-4">
                            <div className="text-left sm:text-center">
                              <label className="text-[9px] font-black text-brand-muted uppercase block">Inflow</label>
                              <span className="text-xs font-bold text-emerald-600">₱{stats.in.toLocaleString()}</span>
                            </div>
                            <div className="text-left sm:text-center">
                              <label className="text-[9px] font-black text-brand-muted uppercase block">Outflow</label>
                              <span className="text-xs font-bold text-orange-600">₱{stats.out.toLocaleString()}</span>
                            </div>
                            <div className="text-right sm:text-right">
                              <label className="text-[9px] font-black text-brand-muted uppercase block">Profit</label>
                              <span className="text-[11px] md:text-sm font-black text-brand-accent">₱{stats.profit.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}

                {monthlyAccountSummary.length === 0 && (
                  <div className="py-20 text-center bg-brand-bg rounded-3xl border border-dashed border-brand-line">
                    <History className="w-12 h-12 text-brand-muted mx-auto mb-4 opacity-20" />
                    <p className="text-brand-muted font-bold">No transaction history found for this profile.</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-between items-center text-[10px] font-black text-brand-muted uppercase tracking-[0.4em]">
                <div>Internal Systems v3.0</div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-accent rounded-full animate-pulse" />
                  Live Sync Active
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettingsModal(false)} className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0.8, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0.8, scale: 0.98 }} className="bg-brand-card rounded-[2rem] p-6 md:p-8 w-full max-w-xl relative z-10 shadow-2xl border border-brand-line flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black tracking-tighter uppercase italic">
                    Store <span className="text-brand-accent">Settings</span>
                  </h3>
                  <p className="text-brand-muted text-[10px] font-mono uppercase tracking-[0.2em] mt-1">Configure Automation & Rates</p>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="p-2 bg-brand-bg hover:bg-brand-line rounded-full border border-brand-line transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto custom-scrollbar pr-2 space-y-8 pb-4">
                {/* Fee Logic Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-accent" />
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Fee Logic Configuration</label>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-brand-muted uppercase ml-1">Fee per ₱1,000</label>
                      <input 
                        type="number" 
                        value={feeBaseIncrement}
                        onChange={(e) => setFeeBaseIncrement(e.target.value)}
                        className="w-full bg-brand-bg border border-brand-line p-3 rounded-xl text-xs font-bold outline-none focus:border-brand-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-brand-muted uppercase ml-1">Mid Threshold</label>
                      <input 
                        type="number" 
                        value={feeMidThreshold}
                        onChange={(e) => setFeeMidThreshold(e.target.value)}
                        className="w-full bg-brand-bg border border-brand-line p-3 rounded-xl text-xs font-bold outline-none focus:border-brand-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-brand-muted uppercase ml-1">Fee below Mid</label>
                      <input 
                        type="number" 
                        value={feeMidAmount}
                        onChange={(e) => setFeeMidAmount(e.target.value)}
                        className="w-full bg-brand-bg border border-brand-line p-3 rounded-xl text-xs font-bold outline-none focus:border-brand-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-brand-muted uppercase ml-1">Fee above Mid</label>
                      <input 
                        type="number" 
                        value={feeFullAmount}
                        onChange={(e) => setFeeFullAmount(e.target.value)}
                        className="w-full bg-brand-bg border border-brand-line p-3 rounded-xl text-xs font-bold outline-none focus:border-brand-accent"
                      />
                    </div>
                  </div>
                </div>

                {/* Service Rate Notes */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-brand-accent" />
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Service Rate Display Notes</label>
                  </div>
                  <div className="relative">
                    <textarea 
                      value={serviceNotesInput}
                      onChange={(e) => setServiceNotesInput(e.target.value)}
                      placeholder="Enter lines as 'Label: Amount'&#10;Ex: Below ₱500: ₱5.00"
                      rows={4}
                      className="w-full bg-brand-bg border border-brand-line p-4 rounded-2xl text-[11px] font-bold focus:border-brand-accent outline-none transition-all custom-scrollbar resize-none"
                    />
                  </div>
                </div>
                {/* Resend Setup Instructions */}
                <div className="p-4 bg-brand-accent/5 rounded-2xl border border-brand-accent/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-brand-accent" />
                    <span className="text-[10px] font-black text-brand-accent uppercase tracking-widest">Setup Email Reports</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] text-brand-text font-bold leading-relaxed">
                      To send real emails, you need an API key from Resend.
                    </p>
                    <div className="flex flex-col gap-1.5 ml-2">
                      <div className="flex items-center gap-2 text-[10px] text-brand-muted font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                        <span>Sign up at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-brand-accent underline">resend.com</a> (Free)</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-brand-muted font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                        <span>Create an API Key and paste it below.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Information Section */}
                <div className="pt-6 border-t border-brand-line space-y-4">
                  <div className="flex items-center gap-2">
                    <WalletIcon className="w-5 h-5 text-brand-accent" />
                    <h4 className="text-sm font-black uppercase tracking-widest italic">Payment Information</h4>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Your GCash Number</label>
                      <div className="relative">
                        <input 
                          type="text"
                          value={gcashNumberInput}
                          onChange={(e) => setGcashNumberInput(e.target.value)}
                          placeholder="e.g. 0917XXXXXXX"
                          className="w-full bg-brand-bg border border-brand-line p-4 rounded-2xl text-sm font-bold focus:border-brand-accent outline-none transition-all pl-12"
                        />
                        <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">GCash QR URL (Optional)</label>
                      <div className="relative">
                        <input 
                          type="text"
                          value={gcashQrUrlInput}
                          onChange={(e) => setGcashQrUrlInput(e.target.value)}
                          placeholder="Paste link to your uploaded QR code image"
                          className="w-full bg-brand-bg border border-brand-line p-4 rounded-2xl text-sm font-bold focus:border-brand-accent outline-none transition-all pl-12"
                        />
                        <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                      </div>
                      <p className="text-[9px] text-brand-muted italic mt-1 px-1">Tip: Upload your QR to a site like PostImages and paste the direct link here.</p>
                    </div>
                  </div>
                </div>

                {/* Email Binding */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-brand-accent" />
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Reporting Email Address</label>
                  </div>
                  <div className="relative">
                    <input 
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="alerts@yourstore.com"
                      className="w-full bg-brand-bg border border-brand-line p-4 rounded-2xl text-sm font-bold focus:border-brand-accent outline-none transition-all pl-12"
                    />
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                  </div>
                </div>

                {/* Resend API Key */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-brand-accent" />
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Resend API Key</label>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      value={resendApiKeyInput}
                      onChange={(e) => setResendApiKeyInput(e.target.value)}
                      placeholder="re_XXXXXXXXXXXXXXXXXXXXX"
                      className="w-full bg-brand-bg border border-brand-line p-4 rounded-2xl text-sm font-bold focus:border-brand-accent outline-none transition-all pl-12"
                    />
                    <Zap className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                  </div>
                </div>

                {/* Automation Toggle */}
                <div className="p-4 bg-brand-bg rounded-2xl border border-brand-line flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black text-brand-text uppercase tracking-widest mb-0.5">Automated Reports</div>
                    <div className="text-[9px] text-brand-muted font-medium">Send summary on the 1st of every month</div>
                  </div>
                  <button 
                    onClick={() => setAutoSendInput(!autoSendInput)}
                    className={`w-12 h-6 rounded-full transition-all relative ${autoSendInput ? 'bg-brand-accent' : 'bg-brand-muted'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoSendInput ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Terminal Security */}
                <div className="pt-6 border-t border-brand-line space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-brand-accent" />
                    <h4 className="text-sm font-black uppercase tracking-widest italic">Terminal Security</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest pl-1">Admin Unlock PIN (4 Digits)</label>
                    <div className="relative">
                      <input 
                        type="text"
                        maxLength={4}
                        value={terminalPassword}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setTerminalPassword(val);
                        }}
                        placeholder="0000"
                        className="w-full bg-brand-bg border border-brand-line p-4 rounded-2xl text-sm font-bold focus:border-brand-accent outline-none transition-all pl-12 font-mono tracking-[0.5em]"
                      />
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                    </div>
                    <p className="text-[9px] text-brand-muted italic mt-1 px-1">This PIN is required for customers to exit Terminal Mode back to Admin View.</p>
                  </div>
                </div>

                {/* Manual Test Trigger */}
                <button 
                  onClick={handleManualTestEmail}
                  disabled={isSendingEmail}
                  className="w-full flex items-center justify-center gap-2 p-4 bg-brand-accent/5 text-brand-accent rounded-2xl border border-brand-accent/20 hover:bg-brand-accent/10 transition-all text-xs font-bold disabled:opacity-50"
                >
                  {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {isSendingEmail ? 'Dispatching...' : 'Send Test Report Now'}
                </button>
              </div>

              <div className="mt-10 flex gap-3">
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-4 bg-brand-bg text-brand-muted font-bold rounded-2xl border border-brand-line hover:bg-brand-line transition-all text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="flex-3 py-4 bg-brand-accent text-white font-black italic rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Configuration
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Investor View Modal (Shared Report) */}
      <AnimatePresence>
        {isViewingShared && viewingSharedReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsViewingShared(false)} className="absolute inset-0 bg-brand-text/50 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-brand-card rounded-2xl md:rounded-[3rem] p-6 md:p-10 w-full max-w-5xl relative z-10 shadow-2xl border border-brand-line overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
              <div className="absolute top-0 right-0 p-4 md:p-8">
                 <button onClick={() => setIsViewingShared(false)} className="p-2.5 md:p-4 bg-brand-bg hover:bg-brand-line rounded-full border border-brand-line transition-all text-brand-muted">
                   <X className="w-5 h-5 md:w-6 h-6" />
                 </button>
              </div>

              <div className="mb-8 md:mb-12">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 mb-2">
                  <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-full">Secure Investor Link</div>
                  <div className="text-[9px] text-brand-muted font-black uppercase tracking-widest">Shared On {new Date(viewingSharedReport.createdAt).toLocaleDateString()}</div>
                </div>
                <h3 className="text-3xl md:text-5xl font-black tracking-tighter uppercase italic leading-none">
                  Investment <span className="text-brand-accent">Portfolio</span>
                </h3>
                <p className="text-brand-muted text-xs md:text-sm uppercase tracking-widest md:tracking-[0.4em] font-medium mt-2">Certified Record for <span className="text-brand-text font-black">{viewingSharedReport.personName}</span></p>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar pr-0 md:pr-4 space-y-10 md:space-y-16">
                 {/* Shared Data Visualization */}
                 {(viewingSharedReport.data as any[]).map((item) => {
                   const { month, wallets: walletsMap } = item;
                   return (
                     <section key={month} className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col md:flex-row items-start md:items-end justify-between border-b pb-4 gap-6">
                          <div>
                             <div className="text-[10px] md:text-[11px] font-black text-brand-muted uppercase tracking-[0.3em] md:tracking-[0.5em] mb-1 md:mb-2">Fiscal Period</div>
                             <h4 className="text-2xl md:text-4xl font-black italic tracking-tighter uppercase text-brand-accent">{month}</h4>
                          </div>
                          <div className="flex gap-8 md:gap-12 w-full md:w-auto">
                             {(() => {
                                const stats = Object.values(walletsMap as Record<string, any>).reduce((acc: any, curr: any) => ({
                                  in: acc.in + curr.in,
                                  out: acc.out + curr.out,
                                  profit: acc.profit + curr.profit
                                }), { in: 0, out: 0, profit: 0 });
                                return (
                                  <>
                                    <div className="flex-1 md:flex-none">
                                      <div className="text-[9px] md:text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] md:tracking-[0.3em] mb-1">Volume Inflow</div>
                                      <div className="text-lg md:text-2xl font-black italic">₱{stats.in.toLocaleString()}</div>
                                    </div>
                                    <div className="border-l border-brand-line pl-8 flex-1 md:flex-none">
                                      <div className="text-[9px] md:text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] md:tracking-[0.3em] mb-1">Total Net Yield</div>
                                      <div className="text-lg md:text-2xl font-black italic text-emerald-600">₱{stats.profit.toLocaleString()}</div>
                                    </div>
                                  </>
                                )
                             })()}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {Object.entries(walletsMap as Record<string, any>).map(([wid, stats]) => (
                             <div key={wid} className="p-5 md:p-6 bg-brand-bg rounded-2xl md:rounded-3xl border border-brand-line flex flex-col justify-between h-36 md:h-40 group hover:border-brand-accent transition-all">
                                <div className="flex justify-between items-start">
                                   <div>
                                     <div className="text-[9px] md:text-[10px] font-black text-brand-muted uppercase tracking-widest">{stats.walletName}</div>
                                     <div className="text-md md:text-lg font-black italic mt-1">Operational Summary</div>
                                   </div>
                                   <WalletIcon className="w-4 h-4 md:w-5 h-5 text-brand-accent/30 group-hover:text-brand-accent transition-colors" />
                                </div>
                                <div className="flex justify-between items-end border-t border-brand-line pt-4">
                                   <div>
                                     <label className="text-[8px] font-black text-brand-muted uppercase block">Periodic Outflow</label>
                                     <span className="text-xs md:text-sm font-bold opacity-60">₱{stats.out.toLocaleString()}</span>
                                   </div>
                                   <div className="text-right">
                                     <label className="text-[8px] font-black text-brand-muted uppercase block text-brand-accent">Periodic Yield</label>
                                     <span className="text-lg md:text-xl font-black italic">₱{stats.profit.toLocaleString()}</span>
                                   </div>
                                </div>
                             </div>
                           ))}
                        </div>
                     </section>
                   );
                 })}
              </div>

              <div className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-brand-line flex flex-col md:flex-row justify-between items-center text-[8px] md:text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] md:tracking-[0.4em] gap-4 md:gap-0">
                 <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 md:w-2 h-2 bg-emerald-500 rounded-full" /> Verified Data Snapshot
                    </div>
                    <div className="hidden md:block w-px h-3 bg-brand-line" />
                    Toolkit Analytics Cloud 2026
                 </div>
                 <button 
                  onClick={() => setIsViewingShared(false)}
                  className="w-full md:w-auto px-6 md:px-8 py-3 bg-brand-text text-white rounded-full hover:opacity-90 transition-all font-bold tracking-widest text-[10px]"
                 >
                   Exit Investor View
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* customer payment portal */}
      <AnimatePresence>
        {showPaymentPortal && portalTransaction && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowPaymentPortal(false)} 
              className="absolute inset-0 bg-brand-text/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: 100, scale: 0.9 }} 
              className="bg-white rounded-[2.5rem] p-6 md:p-10 w-full max-w-lg relative z-10 shadow-2xl border border-brand-line flex flex-col gap-8 max-h-[95vh] overflow-y-auto"
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-20 h-20 bg-brand-accent/10 rounded-3xl flex items-center justify-center mb-4">
                  <WalletIcon className="w-10 h-10 text-brand-accent" />
                </div>
                <h3 className="text-3xl font-black tracking-tighter uppercase italic">
                  Payment <span className="text-brand-accent">Portal</span>
                </h3>
                <p className="text-brand-muted text-[11px] font-black uppercase tracking-[0.3em]">Official Store Checkout</p>
              </div>

              <div className="space-y-6">
                {/* Amount Display */}
                <div className="bg-brand-bg rounded-[2rem] p-8 text-center border-2 border-brand-line/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <TrendingUp className="w-32 h-32" />
                  </div>
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-[0.2em] mb-2 block">Total Amount to Send</label>
                  <div className="text-5xl font-black text-brand-text tracking-tight italic">
                    ₱{(portalTransaction.amount + portalTransaction.fee).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-brand-muted font-bold mt-2">
                    Principal: ₱{portalTransaction.amount.toLocaleString()} + Fee: ₱{portalTransaction.fee.toLocaleString()}
                  </div>
                </div>

                {/* QR Code Section */}
                {userSettings?.gcashQrUrl ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-white border-2 border-brand-line rounded-3xl shadow-sm">
                      <img 
                        src={userSettings.gcashQrUrl} 
                        alt="GCash QR Code" 
                        referrerPolicy="no-referrer"
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Scan with GCash App</p>
                  </div>
                ) : (
                  <div className="p-6 bg-red-50 border border-red-100 rounded-2xl text-center">
                    <p className="text-xs text-red-600 font-bold">QR Code not uploaded. Please scan manually or copy the number below.</p>
                  </div>
                )}

                {/* Merchant Details */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-brand-bg rounded-2xl border border-brand-line">
                    <div>
                      <label className="text-[9px] font-black text-brand-muted uppercase tracking-widest block mb-1">GCash Number</label>
                      <div className="text-sm font-black text-brand-text font-mono tracking-wider">
                        {userSettings?.gcashNumber || 'NOT CONFIGURED'}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        if (userSettings?.gcashNumber) {
                          navigator.clipboard.writeText(userSettings.gcashNumber);
                          alert('Number copied to clipboard!');
                        }
                      }}
                      className="p-2 bg-white text-brand-accent rounded-xl border border-brand-line hover:bg-brand-accent hover:text-white transition-all shadow-sm"
                      title="Copy Number"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Smart Button */}
                  <div className="pt-4 space-y-3">
                    <a 
                      onClick={() => {
                        const amountToPay = (portalTransaction.amount + portalTransaction.fee).toString();
                        const number = userSettings?.gcashNumber || '';
                        const textToCopy = `Amount: ${amountToPay}\nGCash Number: ${number}`;
                        
                        navigator.clipboard.writeText(textToCopy);
                        setShowCopiedToast(true);
                        setTimeout(() => setShowCopiedToast(false), 3000);
                      }}
                      href={`gcash://pay?number=${userSettings?.gcashNumber || ''}&amount=${portalTransaction.amount + portalTransaction.fee}`}
                      className="w-full py-5 bg-brand-accent text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-xl shadow-brand-accent/20 flex items-center justify-center gap-3 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                      {showCopiedToast ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4 fill-white" />}
                      <span className="relative z-10 underline decoration-2 underline-offset-4">
                        {showCopiedToast ? 'Details Copied! Opening...' : 'Smart Pay: Copy & Open GCash'}
                      </span>
                    </a>
                    
                    <button 
                      onClick={() => setShowPaymentPortal(false)}
                      className="w-full py-4 bg-transparent text-brand-muted font-bold text-[10px] uppercase tracking-[0.2em] hover:text-brand-text transition-all"
                    >
                      Dismiss Portal
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-[9px] text-brand-muted font-medium italic opacity-60">
                   Secured by AIS Management Terminal • {new Date().toLocaleDateString()}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Deletion Modal - NEW PROTECTION */}
      <AnimatePresence>
        {(deletingId || deletingPersonId || deletingWalletId || showClearConfirm) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-red-950/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-card rounded-3xl p-8 w-full max-w-md relative z-10 shadow-2xl border-2 border-red-200"
            >
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-6 border-4 border-red-50">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-red-900 uppercase italic tracking-tight mb-2">Destructive Action</h3>
              <p className="text-sm text-brand-muted mb-6 leading-relaxed">
                You are about to permanently delete record(s). This action <strong className="text-red-600">CANNOT</strong> be undone. Your data is stored in the cloud and is not affected by code updates, but manual deletions are final.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-brand-muted mb-2 block">Type "DELETE" to confirm</label>
                  <input 
                    type="text" 
                    autoFocus
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full bg-brand-bg border-2 border-brand-line focus:border-red-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all uppercase"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    disabled={deleteConfirmInput !== 'DELETE' || isSaving}
                    onClick={async () => {
                      if (deletingId) await handleDeleteTransaction();
                      else if (deletingPersonId) await handleDeletePerson(deletingPersonId);
                      else if (deletingWalletId) await handleDeleteWallet(deletingWalletId);
                      else if (showClearConfirm) await clearHistory();
                      setDeleteConfirmInput('');
                    }}
                    className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-30 hover:bg-red-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isSaving ? 'Deleting...' : 'Confirm Deletion'}
                  </button>
                  <button 
                    onClick={() => {
                      setDeletingId(null);
                      setDeletingPersonId(null);
                      setDeletingWalletId(null);
                      setShowClearConfirm(false);
                      setDeleteConfirmInput('');
                    }}
                    className="px-6 py-4 bg-brand-bg text-brand-text border border-brand-line rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-brand-line transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
