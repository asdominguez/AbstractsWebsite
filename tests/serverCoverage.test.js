const request = require('supertest');

function loadServer({ nodeEnv = 'test', dbUri = '' } = {}) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  if (dbUri) process.env.DB_URI = dbUri; else delete process.env.DB_URI;
  process.env.SESSION_SECRET = 'secret';

  const sessionMw = jest.fn((req, res, next) => next());
  const sessionFactory = jest.fn(() => sessionMw);
  const mongoCreate = jest.fn(() => ({ kind: 'store' }));
  const connect = jest.fn().mockResolvedValue();
  const ensureAdminExists = jest.fn().mockResolvedValue();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});

  jest.doMock('express-session', () => sessionFactory);
  jest.doMock('connect-mongo', () => ({ create: mongoCreate }));
  jest.doMock('../config/db', () => ({ connect }));
  jest.doMock('../model/accountDao', () => ({ ensureAdminExists }));
  jest.doMock('../routes/htmlRoutes', () => {
    const express = require('express');
    const router = express.Router();
    router.get('/ok', (req, res) => res.status(200).send('route ok'));
    router.get('/boom', (req, res, next) => next(new Error('kaboom')));
    return router;
  });

  const app = require('../server');
  return { app, sessionFactory, sessionMw, mongoCreate, connect, ensureAdminExists, warn, log, error };
}

describe('server coverage', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('test mode skips mongo session store and DB bootstrap', async () => {
    const { app, sessionFactory, mongoCreate, connect, ensureAdminExists, warn, log, error } = loadServer({ nodeEnv: 'test' });

    const okRes = await request(app).get('/ok');
    expect(okRes.statusCode).toBe(200);
    expect(okRes.text).toBe('route ok');

    const errRes = await request(app).get('/boom');
    expect(errRes.statusCode).toBe(500);
    expect(errRes.text).toBe('Server error');

    const missRes = await request(app).get('/missing');
    expect(missRes.statusCode).toBe(404);
    expect(missRes.text).toBe('Not Found');

    expect(sessionFactory).toHaveBeenCalled();
    expect(mongoCreate).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(ensureAdminExists).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('[error]', expect.any(Error));

    warn.mockRestore();
    log.mockRestore();
    error.mockRestore();
    error.mockRestore();
    error.mockRestore();
  });

  test('non-test mode initializes mongo session store and DB bootstrap', async () => {
    const { app, mongoCreate, connect, ensureAdminExists, warn, log, error } = loadServer({ nodeEnv: 'development', dbUri: 'mongodb://example/testdb' });

    await new Promise((resolve) => setImmediate(resolve));

    const res = await request(app).get('/ok');
    expect(res.statusCode).toBe(200);
    expect(mongoCreate).toHaveBeenCalledWith(expect.objectContaining({
      mongoUrl: 'mongodb://example/testdb',
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 7
    }));
    expect(connect).toHaveBeenCalled();
    expect(ensureAdminExists).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[startup] DB connected and default admin ensured.');
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
    log.mockRestore();
  });

  test('falls back when mongo store setup throws and warns when bootstrap fails', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.DB_URI = 'mongodb://example/faildb';

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const sessionMw = jest.fn((req, res, next) => next());
    jest.doMock('express-session', () => jest.fn(() => sessionMw));
    jest.doMock('connect-mongo', () => ({ create: jest.fn(() => { throw new Error('store failed'); }) }));
    jest.doMock('../config/db', () => ({ connect: jest.fn().mockRejectedValue(new Error('db down')) }));
    jest.doMock('../model/accountDao', () => ({ ensureAdminExists: jest.fn() }));
    jest.doMock('../routes/htmlRoutes', () => {
      const express = require('express');
      const router = express.Router();
      router.get('/ok', (req, res) => res.status(200).send('route ok'));
      return router;
    });

    const app = require('../server');
    await new Promise((resolve) => setImmediate(resolve));

    const res = await request(app).get('/ok');
    expect(res.statusCode).toBe(200);
    expect(warn).toHaveBeenCalledWith('[startup] Session store init failed (falling back to memory):', 'store failed');
    expect(warn).toHaveBeenCalledWith('[startup] DB/admin init failed:', 'db down');
    expect(log).not.toHaveBeenCalledWith('[startup] DB connected and default admin ensured.');

    warn.mockRestore();
    log.mockRestore();
  });
});
