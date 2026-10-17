import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Post, Req, Module, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { configureBodyParsers } from './body-parsers';

// Decorators applied by hand: test files sit outside tsconfig.app.json.
class EchoController {
  echo(req: any) {
    return { body: req.body ?? null, raw: req.rawBody ? req.rawBody.toString() : null };
  }
}
Post('echo')(EchoController.prototype, 'echo', Object.getOwnPropertyDescriptor(EchoController.prototype, 'echo')!);
Req()(EchoController.prototype, 'echo', 0);
Controller()(EchoController);
class TestModule {}
Module({ controllers: [EchoController] })(TestModule);

let app: INestApplication;
let base: string;

beforeAll(async () => {
  app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
  configureBodyParsers(app);
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(() => app.close());

const post = (body: string, type: string) =>
  fetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': type }, body }).then((r) => r.json());

describe('configureBodyParsers', () => {
  it('parses JSON and keeps the raw body for webhook signatures', async () => {
    expect(await post('{"a":1}', 'application/json')).toEqual({ body: { a: 1 }, raw: '{"a":1}' });
  });

  // An HTML form on another site can only send urlencoded, multipart or
  // text/plain bodies. The API never accepts urlencoded, so such a form can't
  // produce a request body any handler understands.
  it('does not parse form-encoded bodies', async () => {
    const res = await post('scope[]=transactions&scope[]=bankAccounts', 'application/x-www-form-urlencoded');
    expect(res.body?.scope).toBeUndefined();
  });
});
