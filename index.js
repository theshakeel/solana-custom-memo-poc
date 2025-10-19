import crypto from "crypto";
import bs58 from "bs58";
import {
  Connection,  Keypair, LAMPORTS_PER_SOL,PublicKey,Transaction,TransactionInstruction,sendAndConfirmTransaction,clusterApiUrl,
} from "@solana/web3.js";
//solflare/solana wallet private key
const arr = [];

const base58 = bs58.encode(Uint8Array.from(arr));
const PRIVATE_KEY_BASE58 = base58;
const RPC_URL = clusterApiUrl("devnet");
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const TX_CONFIRM_TIMEOUT_MS = 30_000;
const exampleEvent = {
  event_type: "deferral_change",
  amount: 1000.0,
  timestamp: "2025-10-18T14:00:00Z",
};

function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonicalize(obj[k]);
  return out;
}

function hashWithSalt(obj) {
  const canonical = JSON.stringify(canonicalize(obj));
  const salt = crypto.randomBytes(16);
  const hashHex = crypto.createHash("sha256").update(canonical).update(salt).digest("hex");
  return { saltHex: salt.toString("hex"), hashHex };
}

function waitForConfirmation(connection, signature, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(false); }
    }, timeoutMs);

    (async () => {
      while (!done) {
        try {
          const resp = await connection.getSignatureStatuses([signature]);
          const info = resp && resp.value && resp.value[0];
          if (info && (info.confirmations === null || info.confirmationStatus === "confirmed" || info.confirmationStatus === "finalized")) {
            if (!done) { done = true; clearTimeout(timer); resolve(true); }
            return;
          }
        } catch (err) {
          // ignore and retry
        }
        await new Promise(r => setTimeout(r, 700));
      }
    })();
  });
}
async function main() {
  if (!PRIVATE_KEY_BASE58 || PRIVATE_KEY_BASE58.includes("PASTE_YOUR_BASE58_SECRET_HERE")) {
    console.error("ERROR: Please edit index.js and set PRIVATE_KEY_BASE58 to your base58 secret (devnet only).");
    process.exit(1);
  }
  let secret;
  try {
    secret = bs58.decode(PRIVATE_KEY_BASE58);
  } catch (e) {
    console.error("Invalid base58 secret. Make sure you pasted the base58 secret key correctly.");
    process.exit(1);
  }

  let keypair;
  try {
    keypair = Keypair.fromSecretKey(secret);
  } catch (e) {
    console.error("Failed to construct Keypair from secret. Ensure it's a valid secret key (64 bytes).", e.message || e);
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  console.log("Using wallet:", keypair.publicKey.toBase58());
  console.log("RPC:", RPC_URL);
  const { saltHex, hashHex } = hashWithSalt(exampleEvent);
  console.log("Local hash (hex):", hashHex);
  console.log("Local salt (hex, keep this private):", saltHex);
  const lamports = await connection.getBalance(keypair.publicKey, "confirmed");
  const solBal = lamports / LAMPORTS_PER_SOL;
  console.log("Balance (devnet):", solBal, "SOL");
  if (solBal < 0.0005) {
    console.warn("Balance may be too low to pay fees. Add devnet SOL from faucet.solana.com if needed.");
  }
  const memoText = `POC_HASH:${hashHex}`;
  const memoIx = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText),
  });
  const tx = new Transaction().add(memoIx);
  tx.feePayer = keypair.publicKey;
  const latest = await connection.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed", preflightCommitment: "confirmed" });
    const confirmed = await waitForConfirmation(connection, sig, TX_CONFIRM_TIMEOUT_MS);
    if (!confirmed) {
      console.warn("Transaction not confirmed within timeout, signature:", sig);
    }
    console.log("✅ Memo tx signature:", sig);
    console.log("🔗 Solscan (devnet): https://solscan.io/tx/" + sig + "?cluster=devnet");
    console.log("Note: only the hash is on-chain; salt kept local for verification.");
  } catch (err) {
    console.error("Transaction failed:", err.message || err);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
