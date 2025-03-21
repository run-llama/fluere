import { describe, expectTypeOf, test } from "vitest";
import { type WorkflowEvent } from "fluere";
import { zodEvent } from "../src/util/zod";
import { z } from "zod";

describe("zod", () => {
  test("basic", () => {
    {
      const event = zodEvent(z.string());
      expectTypeOf(event).toEqualTypeOf<WorkflowEvent<string>>();
    }
    {
      const event = zodEvent(
        z.object({
          a: z.number(),
          b: z.array(z.enum(["c", "d"])),
        }),
      );
      expectTypeOf(event).toEqualTypeOf<
        WorkflowEvent<{
          a: number;
          b: ("c" | "d")[];
        }>
      >();
    }
  });
});
