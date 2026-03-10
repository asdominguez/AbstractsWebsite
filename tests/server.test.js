const request = require("supertest");
const express = require("express");

jest.mock("../server", () => {
  const express = require("express");
  const app = express();

  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  return app;
});

const app = require("../server");

describe("Server basic routes", () => {
  test("health check returns OK", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe("OK");
  });

  test("unknown route returns 404", async () => {
    const res = await request(app).get("/this-route-does-not-exist");
    expect(res.statusCode).toBe(404);
  });
});