import { RuleTester } from "eslint";
import { test } from "node:test";

import rule from "./no-unscoped-owner-table.js";

const ruleTester = new RuleTester();

test("no-unscoped-owner-table", () => {
  ruleTester.run("no-unscoped-owner-table", rule, {
    valid: [
      // Scoped reads/mutations via the helpers.
      {
        code: "db.select().from(task).where(ownedBy(task, userId))",
        options: [{ tables: ["task"] }],
      },
      {
        code: "db.delete(task).where(ownedRow(task, userId, id))",
        options: [{ tables: ["task"] }],
      },
      {
        code: "db.update(task).set(x).where(ownedRow(task, userId, id))",
        options: [{ tables: ["task"] }],
      },
      // Deliberate admin span.
      {
        code: "db.select().from(task).where(acrossAllOwners())",
        options: [{ tables: ["task"] }],
      },
      // schema.X member form + alias both recognised.
      {
        code: "db.delete(schema.pushSubscription).where(and(ownedBy(schema.pushSubscription, userId), eq(x, y)))",
        options: [{ tables: ["pushSubscription"] }],
      },
      {
        code: "db.update(subscriptionTable).set(x).where(ownedBy(subscriptionTable, userId))",
        options: [{ tables: ["subscriptionTable"] }],
      },
      // Non-owner tables are untouched.
      {
        code: "db.delete(processedStripeEvent).where(eq(processedStripeEvent.id, id))",
        options: [{ tables: ["task"] }],
      },
      {
        code: "db.select().from(user)",
        options: [{ tables: ["task"] }],
      },
      // Two scoped owner queries batched in one statement — each chain has its
      // own helper, so both are fine (chain-scoped check).
      {
        code: "const [a, b] = await Promise.all([db.select().from(task).where(ownedBy(task, u)), db.delete(subscription).where(ownedRow(subscription, u, id))])",
        options: [{ tables: ["task", "subscription"] }],
      },
    ],
    invalid: [
      // Whole-WHERE omission.
      {
        code: "db.delete(task)",
        options: [{ tables: ["task"] }],
        errors: [{ messageId: "unscoped" }],
      },
      // WHERE present but no scope helper.
      {
        code: "db.select().from(task).where(eq(task.id, id))",
        options: [{ tables: ["task"] }],
        errors: [{ messageId: "unscoped" }],
      },
      {
        code: "db.update(task).set(x).where(eq(task.id, id))",
        options: [{ tables: ["task"] }],
        errors: [{ messageId: "unscoped" }],
      },
      // schema.X member form flagged too.
      {
        code: "db.delete(schema.pushSubscription).where(inArray(schema.pushSubscription.endpoint, eps))",
        options: [{ tables: ["pushSubscription"] }],
        errors: [{ messageId: "unscoped" }],
      },
      // One scoped + one UNSCOPED owner query in the SAME statement: the
      // unscoped sibling must still be flagged (it used to be whitelisted by the
      // scoped sibling's helper when the whole statement was scanned).
      {
        code: "const [a, b] = await Promise.all([db.select().from(task).where(ownedBy(task, u)), db.select().from(subscription)])",
        options: [{ tables: ["task", "subscription"] }],
        errors: [{ messageId: "unscoped" }],
      },
    ],
  });
});
