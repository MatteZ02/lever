// Edit password (EDT-1): PBKDF2-SHA-256 via Web Crypto. It keeps members from
// changing the layout by accident; it is not a security boundary (the file
// can be edited by hand).
import {PasswordHash} from '../../../model/project';

const ITERATIONS = 100000;

const toBase64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const derive = async (
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    {name: 'PBKDF2', hash: 'SHA-256', salt, iterations},
    key,
    256,
  );
};

export const hashPassword = async (password: string): Promise<PasswordHash> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return {salt: toBase64(salt), hash: toBase64(hash), iterations: ITERATIONS};
};

export const checkPassword = async (
  password: string,
  stored: PasswordHash,
): Promise<boolean> =>
  toBase64(
    await derive(password, fromBase64(stored.salt), stored.iterations),
  ) === stored.hash;
