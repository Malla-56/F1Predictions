import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api } from './api';

// Set once any account on this device has a passkey, so the login screen can lead with it.
const ANY_KEY = 'passkey:any';
const enrolledKey   = uid => `passkey:enrolled:${uid}`;
const dismissedKey  = uid => `passkey:dismissed:${uid}`;

function store(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {}
}
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// True when the device has a built-in biometric/PIN authenticator (Face ID, Touch ID, Windows Hello…).
export async function passkeySupported() {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function biometricLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Face ID';
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? 'Face ID' : 'Touch ID';
  if (/Android/.test(ua)) return 'fingerprint';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'passkey';
}

// The user dismissed the system sheet — not worth showing an error for.
export function isCancel(err) {
  return err?.name === 'NotAllowedError' || err?.name === 'AbortError';
}

export const hasAnyPasskey   = () => read(ANY_KEY) === '1';
export const isEnrolled      = uid => read(enrolledKey(uid)) === '1';
export const isDismissed     = uid => read(dismissedKey(uid)) === '1';
export const dismissPrompt   = uid => store(dismissedKey(uid), '1');

function markEnrolled(uid) {
  store(enrolledKey(uid), '1');
  store(ANY_KEY, '1');
}

export async function enrollPasskey(uid) {
  const { options, challengeToken } = await api.auth.passkeyRegisterOptions();
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    // This device already holds a passkey for this account.
    if (err?.name === 'InvalidStateError') { markEnrolled(uid); return; }
    throw err;
  }
  await api.auth.passkeyRegister(response, challengeToken);
  markEnrolled(uid);
}

export async function signInWithPasskey() {
  const { options, challengeToken } = await api.auth.passkeyLoginOptions();
  const response = await startAuthentication({ optionsJSON: options });
  const result = await api.auth.passkeyLogin(response, challengeToken);
  markEnrolled(result.user.id);
  return result;
}
