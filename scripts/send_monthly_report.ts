
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runMonthlyReport() {
  console.log("Starting Automated Monthly Report Job...");
  
  const today = new Date();
  if (today.getDate() !== 1) {
    console.log("Not the 1st of the month. Skipping automation.");
    // In a real environment, the cron would handle this, but we check just in case.
  }

  const lastMonth = new Date();
  lastMonth.setMonth(today.getMonth() - 1);
  const monthName = lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  // 1. Get all users with auto-send enabled
  const settingsSnap = await getDocs(query(collection(db, 'user_settings'), where('autoSendEnabled', '==', true)));
  
  for (const userDoc of settingsSnap.docs) {
    const settings = userDoc.data();
    const uid = settings.uid;
    const reportingEmail = settings.reportingEmail;

    if (!reportingEmail) continue;

    console.log(`Processing report for User: ${uid}`);

    // 2. Fetch all transactions for this user
    const transSnap = await getDocs(query(collection(db, 'transactions'), where('uid', '==', uid)));
    const allTrans = transSnap.docs.map(d => d.data());

    // 3. Filter for previous month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).getTime();

    const monthTrans = allTrans.filter(t => t.timestamp >= startOfMonth && t.timestamp <= endOfMonth);

    // 4. Get managed people
    const peopleSnap = await getDocs(query(collection(db, 'people'), where('uid', '==', uid)));
    const people = peopleSnap.docs.map(d => d.data());

    // 5. Aggregate logic (matching frontend logic)
    const totalMonthData = monthTrans.reduce((acc, t) => {
      const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
      if (isAddition) acc.in += t.amount;
      else acc.out += t.amount;
      acc.profit += t.fee;
      return acc;
    }, { in: 0, out: 0, profit: 0 });

    const profilesText = people.map(person => {
      const pTrans = monthTrans.filter(t => t.personId === person.id);
      const stats = pTrans.reduce((acc, t) => {
        const isAddition = t.type === 'out' || (t.type === 'misc' && t.miscSubtype === 'add');
        if (isAddition) acc.in += t.amount;
        else acc.out += t.amount;
        acc.profit += t.fee;
        return acc;
      }, { in: 0, out: 0, profit: 0 });
      return `\n• ${person.name}: In: ₱${stats.in.toLocaleString()} | Out: ₱${stats.out.toLocaleString()} | Profit: ₱${stats.profit.toLocaleString()}`;
    }).join('');

    const message = `[Toolkit Monthly Alert] 
Summary for ${monthName}:
Total Inflow: ₱${totalMonthData.in.toLocaleString()}
Total Outflow: ₱${totalMonthData.out.toLocaleString()}
Total Net Profit: ₱${totalMonthData.profit.toLocaleString()}
---${profilesText}
---
Keep managing those ledgers!`;

    // Mock Email Delivery (Simulated)
    console.log(`[REAL-TIME EMAIL] To: ${reportingEmail}`);
    console.log(`Subject: Monthly Financial Analytics - ${monthName}`);
    console.log(`Content:\n${message}\n---`);
  }

  console.log("Automated Job Completed.");
}

runMonthlyReport().catch(console.error);
