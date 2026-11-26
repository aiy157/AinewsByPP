import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PLACEHOLDER_MARKERS = [
  'your-project-id',
  'your-supabase-anon-key',
  'your-supabase-publishable-key',
  'your-supabase-secret',
];

function isSafeSupabasePublicKey(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower.startsWith('sb_secret_') || lower.includes('service_role')) {
    return false;
  }
  // If key is a legacy JWT, decode its payload and strictly require role === 'anon'
  const parts = raw.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as {
        role?: string;
      };
      return payload.role === 'anon';
    } catch {
      return false;
    }
  }
  // Modern Supabase publishable keys must start with sb_publishable_
  return lower.startsWith('sb_publishable_');
}

function pickSafePublicEnv(
  sources: Array<Record<string, string>>,
  keys: string[],
  isKey = false
): string {
  for (const key of keys) {
    for (const env of sources) {
      const raw = (env[key] ?? '').trim();
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) continue;
      if (isKey && !isSafeSupabasePublicKey(raw)) {
        continue;
      }
      return raw;
    }
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, '.', '');
  const rootEnv = loadEnv(mode, '..', '');
  const sources = [localEnv, rootEnv];

  const publicSupabaseUrl = pickSafePublicEnv(sources, [
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
  ]);
  const publicSupabaseAnonKey = pickSafePublicEnv(
    sources,
    [
      'VITE_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
    ],
    true
  );

  return {
    plugins: [react()],
    envDir: '..',
    define: {
      __AINEWS_SUPABASE_URL__: JSON.stringify(publicSupabaseUrl),
      __AINEWS_SUPABASE_ANON_KEY__: JSON.stringify(publicSupabaseAnonKey),
    },
    server: {
      port: 5173,
      open: false,
    },
  };
});
