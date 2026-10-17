/**
 * `pnpm triggers:vapid`: generates a VAPID keypair for Web Push and prints it as .env lines.
 * If keys are already configured it prints only the public key (pass --force for a new pair; every
 * existing browser subscription then has to re-subscribe). This is the ONLY place a private key is
 * ever printed, to stdout, on explicit request.
 */
import webpush from 'web-push';
import { envGetter } from './config';

const get = envGetter();
const force = process.argv.includes('--force');
const existing = get('TRIGGERS_VAPID_PUBLIC');

if (existing && get('TRIGGERS_VAPID_PRIVATE') && !force) {
  console.log('VAPID keys are already configured (private key not shown).');
  console.log(`TRIGGERS_VAPID_PUBLIC=${existing}`);
  console.log('Run with --force to generate a new pair (existing push subscriptions stop working).');
} else {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  console.log('# Add to .env (or your host\'s env). Keep TRIGGERS_VAPID_PRIVATE secret; never commit it.');
  console.log(`TRIGGERS_VAPID_PUBLIC=${publicKey}`);
  console.log(`TRIGGERS_VAPID_PRIVATE=${privateKey}`);
  console.log(`TRIGGERS_VAPID_SUBJECT=${get('TRIGGERS_VAPID_SUBJECT') || 'mailto:you@example.com'}`);
}
