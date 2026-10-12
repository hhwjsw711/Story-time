import { describe, expect, test } from "vitest";
import { isPrivateIp, isPublicWebUrl, readPublicPage, type WebFetch, type WebResponse } from "../lib/publicWeb";

function page(html: string, status = 200, headers?: HeadersInit, url = ""): WebResponse {
  const response = new Response(html, { status, headers });
  return {
    status: response.status,
    ok: response.ok,
    url,
    headers: response.headers,
    body: response.body,
  };
}

describe("isPrivateIp", () => {
  test("private, local, and unreadable addresses are refused, and public ones are not", () => {
    const privateAddresses = [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "100.127.255.1",
      "192.0.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "2002:0a00:0001::",
      "64:ff9b::10.0.0.1",
      "not-an-ip",
      "",
    ];
    for (const address of privateAddresses) expect(isPrivateIp(address), address).toBe(true);

    const publicAddresses = [
      "8.8.8.8",
      "1.1.1.1",
      "172.15.0.1",
      "172.32.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "192.0.1.1",
      "198.20.0.1",
      "2606:4700:4700::1111",
      "::ffff:8.8.8.8",
      "2002:0808:0808::",
      "64:ff9b::8.8.8.8",
    ];
    for (const address of publicAddresses) expect(isPrivateIp(address), address).toBe(false);
  });
});

describe("readPublicPage", () => {
  test("a hostname that resolves to a private address is never fetched", async () => {
    const fetched: string[] = [];
    const fetchPage: WebFetch = (url) => {
      fetched.push(url.href);
      return Promise.resolve(page("<title>no</title>"));
    };
    const read = await readPublicPage("https://rebind.test/secret", 1024, {
      resolve: () => Promise.resolve(["10.0.0.1"]),
      fetch: fetchPage,
    });
    expect(read).toBeNull();
    expect(fetched).toEqual([]);
  });

  test("a lookup that fails or returns nothing is not fetched", async () => {
    const fetched: string[] = [];
    const fetchPage: WebFetch = (url) => {
      fetched.push(url.href);
      return Promise.resolve(page("<title>no</title>"));
    };
    expect(
      await readPublicPage("https://missing.test/", 1024, {
        resolve: () => Promise.reject(new Error("ENOTFOUND")),
        fetch: fetchPage,
      }),
    ).toBeNull();
    expect(
      await readPublicPage("https://empty.test/", 1024, {
        resolve: () => Promise.resolve([]),
        fetch: fetchPage,
      }),
    ).toBeNull();
    expect(fetched).toEqual([]);
  });

  test("one private address among public ones is enough to refuse", async () => {
    const fetched: string[] = [];
    const read = await readPublicPage("https://mixed.test/", 1024, {
      resolve: () => Promise.resolve(["1.1.1.1", "192.168.0.1"]),
      fetch: (url) => {
        fetched.push(url.href);
        return Promise.resolve(page("<title>no</title>"));
      },
    });
    expect(read).toBeNull();
    expect(fetched).toEqual([]);
  });

  test("a public address is read, and a redirect onto a private address stops", async () => {
    const fetched: string[] = [];
    const fetchPage: WebFetch = (url) => {
      fetched.push(url.href);
      if (url.hostname === "ok.test") {
        return Promise.resolve(page("", 302, { location: "http://127.0.0.1/latest" }));
      }
      return Promise.resolve(page("<title>Hello</title>", 200, undefined, url.href));
    };
    const resolve = (host: string) => Promise.resolve(host === "ok.test" || host === "good.test" ? ["1.1.1.1"] : ["10.0.0.1"]);

    const read = await readPublicPage("https://good.test/day", 1024, { resolve, fetch: fetchPage });
    expect(read).toEqual({ html: "<title>Hello</title>", url: "https://good.test/day" });

    expect(await readPublicPage("https://ok.test/go", 1024, { resolve, fetch: fetchPage })).toBeNull();
    expect(fetched).toEqual(["https://good.test/day", "https://ok.test/go"]);
  });

  test("a redirect to a name that resolves privately is not followed", async () => {
    const fetched: string[] = [];
    const read = await readPublicPage("https://start.test/", 1024, {
      resolve: (host) => Promise.resolve(host === "evil.test" ? ["10.1.1.1"] : ["8.8.8.8"]),
      fetch: (url) => {
        fetched.push(url.href);
        return Promise.resolve(page("", 302, { location: "https://evil.test/admin" }));
      },
    });
    expect(read).toBeNull();
    expect(fetched).toEqual(["https://start.test/"]);
  });

  test("a response that lands on a private address is dropped", async () => {
    const read = await readPublicPage("https://start.test/", 1024, {
      resolve: () => Promise.resolve(["1.1.1.1"]),
      fetch: () => Promise.resolve(page("<title>secret</title>", 200, undefined, "http://127.0.0.1/secret")),
    });
    expect(read).toBeNull();
  });

  test("only the first bytes of a page are kept", async () => {
    const read = await readPublicPage("https://good.test/", 4, {
      resolve: () => Promise.resolve(["1.1.1.1"]),
      fetch: () => Promise.resolve(page("abcdef")),
    });
    expect(read?.html).toBe("abcd");
  });
});

describe("isPublicWebUrl shapes that used to slip through", () => {
  test("trailing dots and numeric spellings are not public names", () => {
    expect(isPublicWebUrl(new URL("http://localhost./"))).toBe(false);
    expect(isPublicWebUrl(new URL("http://127.1/"))).toBe(false);
    expect(isPublicWebUrl(new URL("https://example.com./path"))).toBe(true);
  });
});
