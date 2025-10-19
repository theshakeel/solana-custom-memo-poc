// solanaHelpers.js
import crypto from "crypto";

/**
 * Canonicalize an object (sort keys recursively)
 */
export function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const out = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

/**
 * Generate SHA-256 hash of canonicalized object with random salt
 */
export function hashWithSalt(obj) {
  const canonical = JSON.stringify(canonicalize(obj));
  const salt = crypto.randomBytes(16);
  const hashHex = crypto.createHash("sha256").update(canonical).update(salt).digest("hex");
  return { saltHex: salt.toString("hex"), hashHex };
}

/**
 * Wait for a Solana transaction to confirm with timeout
 */
export function waitForConfirmation(connection, signature, timeoutMs) {
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
          // ignore & retry
        }
        await new Promise(r => setTimeout(r, 700));
      }
    })();
  });
}
