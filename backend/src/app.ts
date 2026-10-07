import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { DestinationStream } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createRolesRouter } from './modules/roles/roles.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';

export interface AppOptions {
  /** Where logs go. Defaults to stdout; tests pass a stream to inspect what is logged. */
  logDestination?: DestinationStream;
}

export function createApp(env: Env, options: AppOptions = {}) {
  const logger = createLogger(env.LOG_LEVEL, options.logDestination);

  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy the socket address is the proxy's, so per-client rate limits need its
  // X-Forwarded-For. Believed only when the operator says how many proxies there are.
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Never log request bodies: auth routes carry passwords.
      serializers: {
        req: (req: IncomingMessage & { id?: unknown }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Liveness check, intentionally outside /api/v1.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/auth', createAuthRouter(env));
  app.use('/api/v1/users', createUsersRouter());
  app.use('/api/v1/roles', createRolesRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
