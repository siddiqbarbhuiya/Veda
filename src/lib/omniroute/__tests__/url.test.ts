// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn() } }));
import dns from "node:dns/promises";
import { assertPublicHost, isPrivateIp, parseBaseUrl } from "../url";
import { decodeConfig, encodeConfig, omniFetch } from "../config";

const prod = { allowLocal: false };

afterEach(() => vi.unstubAllGlobals());

describe("parseBaseUrl", () => {
  it("keeps only the origin of a public https address", () => {
    expect(parseBaseUrl("https://router.example.com/some/path?x=1#h", prod)).toEqual({ ok: true, url: "https://router.example.com" });
    expect(parseBaseUrl(" https://router.example.com:8443/ ", prod)).toEqual({ ok: true, url: "https://router.example.com:8443" });
  });
  it("refuses http and other schemes outside localhost", () => {
    for (const u of ["http://router.example.com", "ftp://router.example.com", "file:///etc/passwd", "javascript:alert(1)"]) {
      expect(parseBaseUrl(u, prod).ok, u).toBe(false);
    }
  });
  it("refuses private, loopback, metadata and single-label hosts in production", () => {
    for (const u of [
      "https://localhost", "https://127.0.0.1", "https://[::1]", "https://10.0.0.5", "https://172.16.9.1", "https://172.31.255.1",
      "https://192.168.1.10", "https://169.254.169.254", "https://100.64.0.1", "https://0.0.0.0", "https://[fd00::1]", "https://[::ffff:10.0.0.1]",
      "https://intranet", "https://db.internal", "https://printer.local", "https://x.localhost",
    ]) {
      expect(parseBaseUrl(u, prod).ok, u).toBe(false);
    }
  });
  it("allows 172.15 and 172.32 (public), because only 172.16 to 172.31 is private", () => {
    expect(parseBaseUrl("https://172.15.0.1", prod).ok).toBe(true);
    expect(parseBaseUrl("https://172.32.0.1", prod).ok).toBe(true);
  });
  it("refuses credentials in the address and garbage", () => {
    expect(parseBaseUrl("https://user:pass@router.example.com", prod).ok).toBe(false);
    expect(parseBaseUrl("not a url", prod).ok).toBe(false);
    expect(parseBaseUrl("", prod).ok).toBe(false);
  });
  it("allows http localhost in development only, and nothing else private", () => {
    expect(parseBaseUrl("http://localhost:20128", { allowLocal: true })).toEqual({ ok: true, url: "http://localhost:20128" });
    expect(parseBaseUrl("http://127.0.0.1:20128", { allowLocal: true }).ok).toBe(true);
    expect(parseBaseUrl("http://localhost:20128", prod).ok).toBe(false);
    expect(parseBaseUrl("http://192.168.1.10:20128", { allowLocal: true }).ok).toBe(false);
  });
});

describe("isPrivateIp", () => {
  it("knows public and private ranges", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
    // IPv4 hidden inside IPv6, in every spelling Node can produce
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:a00:1")).toBe(true);
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIp("::ffff:a9fe:a9fe")).toBe(true);
    expect(isPrivateIp("64:ff9b::a00:1")).toBe(true);
    expect(isPrivateIp("::ffff:808:808")).toBe(false);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("febf::1")).toBe(true);
    expect(isPrivateIp("fec0::1")).toBe(false);
  });
});

describe("assertPublicHost", () => {
  it("refuses a public name that resolves to a private address", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "10.1.2.3", family: 4 }] as never);
    await expect(assertPublicHost("https://evil.example.com", prod)).rejects.toThrow(/not public/);
  });
  it("refuses when any one of several addresses is private", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ] as never);
    await expect(assertPublicHost("https://mixed.example.com", prod)).rejects.toThrow();
  });
  it("accepts a name with only public addresses, and loopback in development", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }] as never);
    await expect(assertPublicHost("https://ok.example.com", prod)).resolves.toBeUndefined();
    await expect(assertPublicHost("http://localhost:20128", { allowLocal: true })).resolves.toBeUndefined();
    await expect(assertPublicHost("http://localhost:20128", prod)).rejects.toThrow();
  });
});

describe("config", () => {
  it("round-trips, and refuses broken or unsafe stored text", () => {
    const text = encodeConfig({ baseUrl: "http://localhost:20128", apiKey: "k" });
    expect(decodeConfig(text)).toEqual({ baseUrl: "http://localhost:20128", apiKey: "k" });
    expect(decodeConfig("not json")).toBeNull();
    expect(decodeConfig(JSON.stringify({ baseUrl: "http://10.0.0.1", apiKey: "k" }))).toBeNull();
    expect(decodeConfig(JSON.stringify({ baseUrl: "http://localhost:20128", apiKey: "" }))).toBeNull();
  });
  it("omniFetch does not follow redirects and calls the saved address", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 302 }));
    vi.stubGlobal("fetch", f);
    await omniFetch({ baseUrl: "http://localhost:20128", apiKey: "k" }, "/v1/models");
    expect(f.mock.calls[0][0]).toBe("http://localhost:20128/v1/models");
    expect(f.mock.calls[0][1].redirect).toBe("manual");
  });
});
