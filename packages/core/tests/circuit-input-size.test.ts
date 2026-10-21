import {
  assertCircuitInputSize,
  DEFAULT_CIRCUIT_INPUT_LIMITS,
  CIRCUIT_INPUT_TOO_LARGE,
} from "../src/proofs/circuitInputSize";
import { ProofGenerationError } from "../src/core/errors";

function catchError(fn: () => void): ProofGenerationError {
  try {
    fn();
  } catch (error) {
    return error as ProofGenerationError;
  }
  throw new Error("expected assertCircuitInputSize to throw");
}

describe("assertCircuitInputSize", () => {
  it("accepts a typical payroll witness", () => {
    expect(() =>
      assertCircuitInputSize({ recipient: "G".padEnd(56, "A"), amount: "5000", asset: "native" })
    ).not.toThrow();
  });

  it("accepts bigint values and nested arrays within limits", () => {
    expect(() =>
      assertCircuitInputSize({ amount: 10n ** 30n, path: [["1", "2"], ["3"]] })
    ).not.toThrow();
  });

  describe("boundaries", () => {
    it("accepts exactly maxFields fields and rejects one more", () => {
      const build = (n: number) =>
        Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, "1"]));
      const max = DEFAULT_CIRCUIT_INPUT_LIMITS.maxFields;
      expect(() => assertCircuitInputSize(build(max))).not.toThrow();
      const error = catchError(() => assertCircuitInputSize(build(max + 1)));
      expect(error.code).toBe(CIRCUIT_INPUT_TOO_LARGE);
      expect(error.context).toMatchObject({ limit: "maxFields", max, actual: max + 1 });
    });

    it("accepts a string of exactly maxStringLength and rejects one longer", () => {
      const max = DEFAULT_CIRCUIT_INPUT_LIMITS.maxStringLength;
      expect(() => assertCircuitInputSize({ memo: "1".repeat(max) })).not.toThrow();
      const error = catchError(() => assertCircuitInputSize({ memo: "1".repeat(max + 1) }));
      expect(error.context).toMatchObject({ limit: "maxStringLength", field: "memo" });
    });

    it("rejects too many array elements", () => {
      const error = catchError(() =>
        assertCircuitInputSize(
          { leaves: Array.from({ length: 11 }, () => "1") },
          { maxElements: 10 }
        )
      );
      expect(error.context).toMatchObject({ limit: "maxElements", field: "leaves", max: 10 });
    });

    it("rejects arrays nested deeper than maxDepth", () => {
      const error = catchError(() => assertCircuitInputSize({ deep: [[["1"]]] }, { maxDepth: 1 }));
      expect(error.context).toMatchObject({ limit: "maxDepth", field: "deep" });
    });

    it("rejects a witness whose serialized size exceeds maxTotalBytes", () => {
      const error = catchError(() =>
        assertCircuitInputSize({ a: "1".repeat(100), b: "1".repeat(100) }, { maxTotalBytes: 150 })
      );
      expect(error.context).toMatchObject({ limit: "maxTotalBytes", max: 150 });
    });
  });

  it("honours caller overrides without mutating the defaults", () => {
    expect(() => assertCircuitInputSize({ a: "1", b: "2" }, { maxFields: 1 })).toThrow(
      ProofGenerationError
    );
    expect(DEFAULT_CIRCUIT_INPUT_LIMITS.maxFields).toBe(256);
  });

  it("never includes witness values in the message or context", () => {
    const secret = "9".repeat(200);
    const error = catchError(() => assertCircuitInputSize({ amount: secret }));
    expect(error.message).not.toContain("999");
    expect(JSON.stringify(error.context)).not.toContain("999");
    expect(error.message).toMatch(/Reduce the witness size/);
  });
});
