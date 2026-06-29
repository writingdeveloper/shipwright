/**
 * Require an owner-scope helper on every owner-table query.
 *
 * Owner-scoped tables (`task`/`uploadedFile`/`pushSubscription`/`subscription`)
 * must be queried through `ownedBy`/`ownedRow` (or `acrossAllOwners` for a
 * deliberate, role-checked admin read). A `.from`/`.delete`/`.update` on such a
 * table whose statement references none of those helpers is a footgun: a missing
 * `userId` predicate (or a missing WHERE entirely) leaks/over-writes other
 * users' rows but still compiles.
 *
 * Detection is a *presence check* over the enclosing statement's text — robust
 * and low-false-positive — NOT a semantic analysis of the WHERE expression. Its
 * blind spot (the relational `db.query.*` API; an owner table imported under an
 * alias not listed in `tables`) is backstopped by the registry-driven invariant
 * test in `@repo/db`. Configure `tables` with the owner-table identifier names,
 * including any in-repo alias (e.g. `subscriptionTable`).
 *
 * @type {import("eslint").Rule.RuleModule}
 */
const SCOPE_HELPERS = ["ownedBy", "ownedRow", "acrossAllOwners"];
const BUILDER_METHODS = new Set(["from", "delete", "update"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an owner-scope helper (ownedBy/ownedRow/acrossAllOwners) on owner-table queries",
    },
    schema: [
      {
        type: "object",
        properties: { tables: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      unscoped:
        "Owner-scoped table '{{table}}' queried via .{{method}}() without a scope helper. Use ownedBy/ownedRow, or acrossAllOwners for a deliberate admin read.",
    },
  },
  create(context) {
    const owners = new Set(context.options[0]?.tables ?? []);
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Resolve `.from(task)` / `.from(schema.task)` → "task". */
    function tableName(arg) {
      if (!arg) return null;
      if (arg.type === "Identifier") return arg.name;
      if (
        arg.type === "MemberExpression" &&
        arg.property.type === "Identifier"
      ) {
        return arg.property.name;
      }
      return null;
    }

    /** Nearest enclosing statement (or variable declaration). */
    function enclosingStatement(node) {
      let n = node;
      while (
        n.parent &&
        !/Statement$/.test(n.parent.type) &&
        n.parent.type !== "VariableDeclaration"
      ) {
        n = n.parent;
      }
      return n.parent ?? n;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.property.type !== "Identifier" ||
          !BUILDER_METHODS.has(callee.property.name)
        ) {
          return;
        }
        const name = tableName(node.arguments[0]);
        if (!name || !owners.has(name)) return;

        const text = sourceCode.getText(enclosingStatement(node));
        if (SCOPE_HELPERS.some((h) => text.includes(`${h}(`))) return;

        context.report({
          node,
          messageId: "unscoped",
          data: { table: name, method: callee.property.name },
        });
      },
    };
  },
};
