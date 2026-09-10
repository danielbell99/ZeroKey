import { describe, expect, it } from "vitest";
import { ConfigurationError, readConfig } from "../../src/http/config.js";

describe("local server configuration", () => {
  it("defaults to loopback port 3000", () =>
    expect(readConfig({})).toEqual({ hostname: "127.0.0.1", port: 3000 }));
  it("accepts a valid override", () => expect(readConfig({ PORT: "4567" }).port).toBe(4567));
  it.each(["0", "-1", "65536", "3.5", "", " 3000 ", "SECRET_VALUE", "1e3"])(
    "rejects invalid PORT %s without echoing it",
    (PORT) => {
      expect(() => readConfig({ PORT })).toThrow(ConfigurationError);
      expect(() => readConfig({ PORT })).toThrow("PORT must be an integer from 1 to 65535");
    },
  );
});
