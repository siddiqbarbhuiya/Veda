import { describe, expect, it } from "vitest";
import { addRequirement, parseRequirements, requirementName, validatePipSpec } from "../pip";

describe("validatePipSpec", () => {
  it("accepts names, extras and version clauses", () => {
    for (const ok of ["requests", "numpy==1.26.4", "rich>=13,<14", "Pillow", "scikit-learn", "pkg_name.v2", "httpx[http2]", "attrs~=23.1", "a"]) {
      expect(validatePipSpec(ok), ok).toEqual({ ok: true, value: ok });
    }
  });
  it("trims the input", () => {
    expect(validatePipSpec("  requests ")).toEqual({ ok: true, value: "requests" });
  });
  it("refuses empty input, options, urls, paths, vcs specs and spaces", () => {
    for (const bad of ["", "   ", "-r other.txt", "--index-url", "https://x.example/p.whl", "git+https://github.com/a/b", "../local", "./pkg", "name @ https://x", "a b", "req;rm -rf", "name==", "==1.0", "bad name", "x".repeat(201)]) {
      expect(validatePipSpec(bad).ok, bad).toBe(false);
    }
  });
});

describe("requirementName", () => {
  it("normalises like pip", () => {
    expect(requirementName("Scikit_Learn==1.0")).toBe("scikit-learn");
    expect(requirementName("zope.interface>=5")).toBe("zope-interface");
    expect(requirementName("httpx[http2]")).toBe("httpx");
  });
});

describe("parseRequirements", () => {
  it("reads valid lines and skips comments, blanks, options and bad lines", () => {
    const text = "# tools\nrequests==2.31.0\n\n  numpy  # fast\n-r base.txt\n--index-url x\nhttps://bad\nrich>=13\r\n";
    expect(parseRequirements(text)).toEqual(["requests==2.31.0", "numpy", "rich>=13"]);
  });
  it("is empty for no text", () => {
    expect(parseRequirements(undefined)).toEqual([]);
    expect(parseRequirements("")).toEqual([]);
  });
});

describe("addRequirement", () => {
  it("creates the file text for the first package", () => {
    expect(addRequirement(undefined, "requests")).toBe("requests\n");
  });
  it("appends a new package and keeps the other lines", () => {
    expect(addRequirement("# libs\nnumpy\n", "requests")).toBe("# libs\nnumpy\nrequests\n");
  });
  it("replaces a package that is listed, matching names like pip", () => {
    expect(addRequirement("Scikit_Learn==1.0\nnumpy\n", "scikit-learn==1.4")).toBe("scikit-learn==1.4\nnumpy\n");
  });
  it("does not repeat the same package", () => {
    expect(addRequirement("requests\n", "requests")).toBe("requests\n");
  });
  it("keeps option lines untouched", () => {
    expect(addRequirement("-r base.txt\n", "rich")).toBe("-r base.txt\nrich\n");
  });
});
