export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerServerLogging } = await import('./server/startup.mjs');
    await registerServerLogging();
  }
}

export const onRequestError: import('next').Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { log, newRequestContext, requestContext } = await import('./server/logger.mjs');
  const current = requestContext.getStore() ?? newRequestContext(request.method, context.routePath);
  requestContext.run(current, () => log('error', 'framework.error', { error, routeType: context.routeType }));
};
