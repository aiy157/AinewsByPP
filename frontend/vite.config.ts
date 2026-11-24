import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PLACEHOLDER_MARKERS = [
  'your-project-id',
  'your-supabase-anon-key',
  'your-supabase-publishable-key',
  'your-supabase-secret',
];

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
      if (isKey && (lower.startsWith('sb_secret_') || lower.includes('service_role'))) {
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
