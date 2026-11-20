import { db } from "@/prisma/db";
import { describe, it, expect, afterAll } from "vitest";

describe("Prisma Database Connection", () => {
  afterAll(async () => {
    await db.close();
  });

  it("should successfully ping the PostgreSQL database", async () => {
    const plan = db.raw.sql`SELECT 1 as ping`
      .returnsRow({ ping: "pg/int4@1" })
      .build();

    const rows = await db.query(plan);

    expect(rows).toEqual([{ ping: 1 }]);
  });
});
