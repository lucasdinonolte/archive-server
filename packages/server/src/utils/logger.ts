import { env } from '@/config/env';

export type Logger = ReturnType<typeof createLogger>;

// eslint-disable-next-line no-console
const createLogger = (verbose = false, transport = console.log) => ({
  log: (...args: Array<any>) => transport(...args),
  info: (...args: Array<any>) =>
    transport('\x1b[94m[Info]\x1b[39m     ', ...args),
  warn: (...args: Array<any>) =>
    transport('\x1b[93m[Warning]\x1b[39m  ', ...args),
  error: (...args: Array<any>) =>
    transport('\x1b[91m[Error]\x1b[39m    ', ...args),
  success: (...args: Array<any>) =>
    transport('\x1b[92m[Success]\x1b[39m  ', ...args),
  debug: (...args: Array<any>) =>
    verbose ? transport('\x1b[2m[Debug]\x1b[22m    ', ...args) : null,
});

export const logger = createLogger(env.VERBOSE);
