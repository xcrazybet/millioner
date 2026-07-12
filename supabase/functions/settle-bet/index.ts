// ╔══════════════════════════════════════════════════════════════╗
// ║  SETTLE-BET EDGE FUNCTION v18.3                             ║
// ║  Handles: Supabase (bets) + Firebase (wallets) atomically   ║
// ╚══════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initializeApp, cert, getApps } from "npm:firebase-admin/app";
import { getFirestore } from "npm:firebase-admin/firestore";

// ── SUPABASE ────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── FIREBASE ────────────────────────────
const FIREBASE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);

if (getApps().length === 0) {
    initializeApp({ credential: cert(FIREBASE_SERVICE_ACCOUNT) });
}
const firestore = getFirestore();

// ╔══════════════════════════════════════════════════════════════╗
// ║  DETERMINE BET RESULT                                       ║
// ╚══════════════════════════════════════════════════════════════╝
function determineResult(betType: string, goals_home: number, goals_away: number): { won: boolean; refund: boolean; reason: string } | null {
    const tg = goals_home + goals_away;
    const map: Record<string, { won: boolean; refund?: boolean; reason: string }> = {
        home: { won: goals_home > goals_away, reason: `${goals_home}-${goals_away} (Home Win)` },
        away: { won: goals_away > goals_home, reason: `${goals_home}-${goals_away} (Away Win)` },
        draw: { won: goals_home === goals_away, reason: `${goals_home}-${goals_away} (Draw)` },
        over05: { won: tg > 0.5, reason: `${goals_home}-${goals_away} (Over 0.5)` },
        under05: { won: tg < 0.5, reason: `${goals_home}-${goals_away} (Under 0.5)` },
        over15: { won: tg > 1.5, reason: `${goals_home}-${goals_away} (Over 1.5)` },
        under15: { won: tg < 1.5, reason: `${goals_home}-${goals_away} (Under 1.5)` },
        over25: { won: tg > 2.5, reason: `${goals_home}-${goals_away} (Over 2.5)` },
        under25: { won: tg < 2.5, reason: `${goals_home}-${goals_away} (Under 2.5)` },
        over35: { won: tg > 3.5, reason: `${goals_home}-${goals_away} (Over 3.5)` },
        under35: { won: tg < 3.5, reason: `${goals_home}-${goals_away} (Under 3.5)` },
        btts_yes: { won: goals_home > 0 && goals_away > 0, reason: `${goals_home}-${goals_away} (BTTS Yes)` },
        btts_no: { won: !(goals_home > 0 && goals_away > 0), reason: `${goals_home}-${goals_away} (BTTS No)` },
        home_dnb: goals_home === goals_away ? { won: true, refund: true, reason: `${goals_home}-${goals_away} (DNB Refund)` } : { won: goals_home > goals_away, reason: `${goals_home}-${goals_away} (Home DNB)` },
        away_dnb: goals_home === goals_away ? { won: true, refund: true, reason: `${goals_home}-${goals_away} (DNB Refund)` } : { won: goals_away > goals_home, reason: `${goals_home}-${goals_away} (Away DNB)` },
        home_over05: { won: goals_home > 0.5, reason: `${goals_home}-${goals_away} (Home O0.5)` },
        away_over05: { won: goals_away > 0.5, reason: `${goals_home}-${goals_away} (Away O0.5)` },
        home_over15: { won: goals_home > 1.5, reason: `${goals_home}-${goals_away} (Home O1.5)` },
        away_over15: { won: goals_away > 1.5, reason: `${goals_home}-${goals_away} (Away O1.5)` },
    };
    const r = map[betType];
    if (!r) return null;
    return { won: r.won, refund: r.refund || false, reason: r.reason };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  FIREBASE WALLET UPDATE                                     ║
// ╚══════════════════════════════════════════════════════════════╝
async function updateFirebaseWallet(userId: string, betId: string, amount: number, profit: number, type: string, reason: string) {
    const walletRef = firestore.collection('wallets').doc(userId);
    const logCollection = type === 'refund' ? 'refund_logs' : 'payout_logs';
    const logRef = firestore.collection(logCollection).doc(type === 'refund' ? `refund_${betId}` : betId);
    
    await firestore.runTransaction(async (txn) => {
        const logDoc = await txn.get(logRef);
        if (logDoc.exists) throw new Error('DUPLICATE');
        
        const walletDoc = await txn.get(walletRef);
        const before = walletDoc.exists ? (walletDoc.data()?.balance || 0) : 0;
        const after = parseFloat((before + amount).toFixed(2));
        
        txn.set(logRef, {
            user_id: userId, bet_id: betId, amount, profit,
            type: type === 'refund' ? 'refund' : 'settlement_payout',
            reason, balance_before: before, balance_after: after,
            timestamp: new Date()
        });
        
        txn.set(walletRef, { balance: after, updated_at: new Date().toISOString() }, { merge: true });
        
        txn.set(firestore.collection('transactions').doc(), {
            user_id: userId, bet_id: betId, amount, profit,
            type: type === 'refund' ? 'refund' : 'settlement_payout',
            balance_before: before, balance_after: after,
            timestamp: new Date()
        });
    });
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  MAIN HANDLER                                               ║
// ╚══════════════════════════════════════════════════════════════╝
serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Idempotency-Key, X-Client-Version", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" }
        });
    }
    
    // Health check
    if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
        return new Response(JSON.stringify({ status: "ok", version: "18.3" }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
    
    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("Missing Authorization");
        
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        if (authError || !user) throw new Error("Unauthorized");
        
        const body = await req.json();
        const { action, idempotencyKey, betId, userId } = body;
        
        if (userId !== user.id) throw new Error("User ID mismatch");
        
        // Idempotency check
        const { data: existing } = await supabase.from("settlement_logs").select("id").eq("idempotency_key", idempotencyKey).single();
        if (existing) {
            return new Response(JSON.stringify({ success: true, data: { already_processed: true } }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }
        
        let result;
        switch (action) {
            case "settle": result = await handleSettlement(supabase, body); break;
            case "cashout": result = await handleCashout(supabase, body); break;
            case "cancel": result = await handleCancellation(supabase, body); break;
            default: throw new Error(`Unknown action: ${action}`);
        }
        
        await supabase.from("settlement_logs").insert({ idempotency_key: idempotencyKey, bet_id: betId, user_id: userId, action, result, created_at: new Date().toISOString() });
        
        return new Response(JSON.stringify({ success: true, data: result }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
});

async function handleSettlement(supabase: any, body: any) {
    const { betId, matchData } = body;
    
    const { data: bet, error } = await supabase.from("bets").select("*").eq("id", betId).eq("status", "active").single();
    if (error || !bet) throw new Error("Bet not found or already settled");
    
    const goals_home = matchData?.goals_home || 0;
    const goals_away = matchData?.goals_away || 0;
    const result = determineResult(bet.bet_type, goals_home, goals_away);
    if (!result) throw new Error(`Unknown bet type: ${bet.bet_type}`);
    
    const stake = parseFloat(bet.amount);
    const odds = parseFloat(bet.odds);
    let newStatus: string, payout: number, profit: number;
    
    if (result.refund) { newStatus = "cancelled"; payout = stake; profit = 0; }
    else if (result.won) { newStatus = "won"; payout = parseFloat((stake * odds).toFixed(2)); profit = parseFloat((payout - stake).toFixed(2)); }
    else { newStatus = "lost"; payout = 0; profit = -stake; }
    
    const settledAt = new Date().toISOString();
    
    // Update Supabase bet
    const { error: updateError } = await supabase.from("bets").update({
        status: newStatus, payout, profit_loss: profit,
        settlement_reason: result.reason, settled_at: settledAt,
        match_score: `${goals_home}-${goals_away}`,
        settled_by: "backend", updated_at: settledAt
    }).eq("id", betId).eq("status", "active");
    
    if (updateError) throw new Error(`Bet update failed: ${updateError.message}`);
    
    // Update Firebase wallet
    if (payout > 0) {
        await updateFirebaseWallet(bet.user_id, betId, payout, profit, "settlement", result.reason);
    }
    
    return { status: newStatus, payout, profit_loss: profit, settlement_reason: result.reason, settled_at: settledAt };
}

async function handleCashout(supabase: any, body: any) {
    const { betId, cashoutAmount, partialPct } = body;
    
    const { data: bet, error } = await supabase.from("bets").select("*").eq("id", betId).eq("status", "active").single();
    if (error || !bet) throw new Error("Bet not found");
    
    const isFull = partialPct === 100;
    const newStatus = isFull ? "cashed-out" : "active";
    const newAmount = isFull ? bet.amount : parseFloat((bet.amount * (1 - partialPct / 100)).toFixed(2));
    
    const updatePayload: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (isFull) { updatePayload.cashout_amount = cashoutAmount; updatePayload.cashed_out_at = new Date().toISOString(); updatePayload.settlement_reason = "Cashed out 100%"; }
    else { updatePayload.amount = newAmount; }
    
    const { error: updateError } = await supabase.from("bets").update(updatePayload).eq("id", betId).eq("status", "active");
    if (updateError) throw new Error(`Cashout update failed: ${updateError.message}`);
    
    const profit = parseFloat((cashoutAmount - parseFloat(bet.amount) * (partialPct / 100)).toFixed(2));
    await updateFirebaseWallet(bet.user_id, betId, cashoutAmount, profit, "cashout", `Cashout ${partialPct}%`);
    
    return { status: newStatus, cashout_amount: cashoutAmount };
}

async function handleCancellation(supabase: any, body: any) {
    const { betId, refundAmount, cancellationFee } = body;
    
    const { data: bet, error } = await supabase.from("bets").select("*").eq("id", betId).eq("status", "active").single();
    if (error || !bet) throw new Error("Bet not found");
    
    const { error: updateError } = await supabase.from("bets").update({
        status: "cancelled", refund_amount: refundAmount,
        cancellation_fee: parseFloat(bet.amount) * cancellationFee,
        cancelled_at: new Date().toISOString(),
        settlement_reason: `Cancelled – ${(cancellationFee * 100).toFixed(0)}% fee`,
        updated_at: new Date().toISOString()
    }).eq("id", betId).eq("status", "active");
    
    if (updateError) throw new Error(`Cancellation failed: ${updateError.message}`);
    
    await updateFirebaseWallet(bet.user_id, betId, refundAmount, 0, "refund", "User cancellation");
    
    return { status: "cancelled", refund_amount: refundAmount };
}
