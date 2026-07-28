function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  get geminiApiKey() { return required('GEMINI_API_KEY'); },
  // Public by design (same values shipped client-side in public/js/config.js) — not a secret, RLS enforces access control.
  supabaseUrl: 'https://jwdumjludmjuufqhzysk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ZHVtamx1ZG1qdXVmcWh6eXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTMzNjcsImV4cCI6MjA4OTM4OTM2N30.kPXVHsFBBOvYgiDAP-LatzX4oiM4huhHyMFN1YKcfCk',
  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(',').map(origin => origin.trim());
  },
};
