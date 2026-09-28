import type { INestApplication } from '@nestjs/common';
import * as express from 'express';

/**
 * JSON only. The web app and the Plaid/Stripe webhooks all send JSON; an HTML
 * form on another site can't, so not parsing urlencoded bodies means a
 * cross-site form can't produce a request body any handler acts on.
 * rawBody is kept for webhook signature checks.
 */
export function configureBodyParsers(app: INestApplication): void {
  app.use(
    express.json({
      limit: '5mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
}
