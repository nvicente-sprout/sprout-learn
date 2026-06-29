function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  get geminiApiKey() { return required('GEMINI_API_KEY'); },
};
