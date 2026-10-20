export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerServerLogging } = await import('./server/startup.mjs');
    await registerServerLogging();
  }
}
