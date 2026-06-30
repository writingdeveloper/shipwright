import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@repo/auth/server";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

import { requireAdminSession } from "../../lib/admin-actions";
import {
  banUserAction,
  setUserRole,
  unbanUserAction,
} from "../../lib/user-actions";
import { DeleteUserButton } from "./delete-user-button";

const PAGE_SIZE = 20;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireAdminSession();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { users, total } = await auth.api.listUsers({
    query: {
      limit: PAGE_SIZE,
      offset,
      ...(q
        ? { searchValue: q, searchField: "email", searchOperator: "contains" }
        : {}),
    },
    headers: await headers(),
  });

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main id="main" className="bg-background min-h-svh p-6">
      <nav className="mb-4 text-sm">
        <Link href="/" className="underline">
          ← Dashboard
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">Users</h1>

      <form method="get" className="mt-4 flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by email"
          aria-label="Search users by email"
        />
        <Button type="submit">Search</Button>
      </form>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === session.user.id;
            const isAdmin = u.role === "admin";
            const isBanned = Boolean(u.banned);
            return (
              <tr
                key={u.id}
                data-testid={`user-row-${u.email}`}
                className="border-b"
              >
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{isAdmin ? "admin" : "user"}</td>
                <td className="py-2 pr-4">
                  {isBanned ? (
                    <span className="text-destructive">banned</span>
                  ) : (
                    <span className="text-muted-foreground">active</span>
                  )}
                </td>
                <td className="flex flex-wrap gap-2 py-2">
                  <form action={setUserRole}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input
                      type="hidden"
                      name="role"
                      value={isAdmin ? "user" : "admin"}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={isSelf}
                    >
                      {isAdmin ? "Make user" : "Make admin"}
                    </Button>
                  </form>
                  <form action={isBanned ? unbanUserAction : banUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={isSelf}
                    >
                      {isBanned ? "Unban" : "Ban"}
                    </Button>
                  </form>
                  <DeleteUserButton userId={u.id} disabled={isSelf} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="text-muted-foreground mt-4 flex items-center gap-4 text-sm">
        <span>
          Page {page} of {lastPage} · {total} users
        </span>
        {page > 1 ? (
          <Link
            className="underline"
            href={`/users?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            ← Prev
          </Link>
        ) : null}
        {page < lastPage ? (
          <Link
            className="underline"
            href={`/users?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            Next →
          </Link>
        ) : null}
      </div>
    </main>
  );
}
