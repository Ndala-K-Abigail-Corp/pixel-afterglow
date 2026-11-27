#!/usr/bin/env node
/**
 * Pixel Afterglow — Trusted Administrator Custom Claim Provisioning Script
 *
 * Usage (server-side / local admin terminal ONLY — never bundle into frontend):
 *   1. Download a Firebase Admin SDK service account JSON from Firebase Console
 *      (Project Settings -> Service accounts -> Generate new private key).
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *   3. Install firebase-admin in a separate admin directory or run with npx:
 *        node scripts/setAdminClaim.mjs --email admin@yourdomain.com --grant
 *        node scripts/setAdminClaim.mjs --uid <FIREBASE_UID> --revoke
 *
 * After granting, the administrator must sign out and sign back in (or refresh their
 * Firebase ID token) so the `{ admin: true }` custom claim is active in Firestore rules.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
const uidIdx = args.indexOf('--uid');
const shouldGrant = args.includes('--grant');
const shouldRevoke = args.includes('--revoke');

if ((!shouldGrant && !shouldRevoke) || (emailIdx === -1 && uidIdx === -1)) {
  console.error(
    'Usage: node scripts/setAdminClaim.mjs (--email <email> | --uid <uid>) (--grant | --revoke)'
  );
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();

async function main() {
  const user =
    uidIdx !== -1
      ? await auth.getUser(args[uidIdx + 1])
      : await auth.getUserByEmail(args[emailIdx + 1]);

  if (!user.emailVerified && shouldGrant) {
    console.warn('Warning: Target account email is not verified yet.');
  }

  const existingClaims = user.customClaims ?? {};
  const nextClaims = { ...existingClaims, admin: shouldGrant };
  if (shouldRevoke) {
    delete nextClaims.admin;
  }

  await auth.setCustomUserClaims(user.uid, nextClaims);
  console.log(
    `Success: ${shouldGrant ? 'Granted' : 'Revoked'} admin claim for UID=${user.uid} (${user.email ?? 'no-email'}).`
  );
  console.log('Note: The user must sign out and sign back in to refresh their ID token.');
}

main().catch((err) => {
  console.error('Failed to update admin claim:', err.message);
  process.exit(1);
});
