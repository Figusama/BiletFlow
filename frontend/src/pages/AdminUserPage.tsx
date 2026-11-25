import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import type { RootState } from "../app/store";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import StatusBadge from "../components/ui/StatusBadge";
import {
  adminUsersKey,
  setUserSuspended,
  useAdminUser,
  useAdminUserOrders,
  type AdminUser,
} from "../features/admin/api";
import { formatDateTime } from "../features/organizer/changes";
import { ApiError } from "../shared/api/client";
import { useLanguage } from "../shared/i18n/language";
import { formatKzt } from "../shared/lib/money";
import { getInitials } from "../shared/lib/initials";

const TIME_ZONE = "Asia/Almaty";

const AdminUserPage = () => {
  const { t } = useLanguage();
  const { publicId } = useParams();
  const { data: user, isPending, isError } = useAdminUser(publicId);

  if (isPending)
    return <div className="h-64 animate-pulse rounded-2xl bg-surface-sunk" />;
  if (isError || !user)
    return <p className="text-muted">{t.admin.users.notFound}</p>;

  return <Profile key={user.id} user={user} />;
};

const Profile = ({ user }: { user: AdminUser }) => {
  const { t } = useLanguage();
  const texts = t.admin.users;
  const queryClient = useQueryClient();
  const myUserId = useSelector((state: RootState) => state.auth.user?.id);
  const { data: orders = [], isPending: ordersPending } = useAdminUserOrders(
    user.public_id,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user.personal_role === "PLATFORM_ADMIN";
  const isMe = user.id === myUserId;
  const canChange = !isAdmin && !isMe;

  const toggle = async () => {
    setIsBusy(true);
    setError("");
    try {
      await setUserSuspended(user.id, !user.is_suspended);
      await queryClient.invalidateQueries({ queryKey: adminUsersKey });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? texts.cannotSuspendSelf
          : texts.actionFailed,
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="chevron-left" className="size-4" />
        {texts.allUsers}
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-accent-foreground">
          {getInitials(user.full_name ?? user.email)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {user.full_name ?? user.email}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user.email}, {user.phone ? `${user.phone}, ` : ""}
            <span className="font-mono text-xs">{user.public_id}</span>,{" "}
            {texts.joinedOn(formatDateTime(user.created_at, TIME_ZONE, t))}
          </p>
        </div>
        {user.is_suspended ? (
          <StatusBadge tone="danger" icon="x-circle">
            {texts.suspended}
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" icon="check-circle">
            {texts.active}
          </StatusBadge>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold text-foreground">
            {texts.recentOrders}
          </h2>
          {ordersPending ? (
            <div className="mt-4 h-24 animate-pulse rounded-2xl bg-surface-sunk" />
          ) : orders.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{texts.noOrders}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-widest text-muted uppercase">
                    <th className="py-2 pr-4 font-semibold">
                      {texts.orderColumns.order}
                    </th>
                    <th className="py-2 pr-4 font-semibold">
                      {texts.orderColumns.event}
                    </th>
                    <th className="py-2 pr-4 font-semibold">
                      {texts.orderColumns.status}
                    </th>
                    <th className="py-2 text-right font-semibold">
                      {texts.orderColumns.total}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {order.order_number}
                      </td>
                      <td className="py-3 pr-4 text-foreground">
                        {order.event_title}
                      </td>
                      <td className="py-3 pr-4 text-foreground">
                        {t.organizerOrders.status[order.status]}
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">
                        {formatKzt(order.total_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-bold text-foreground">
              {texts.eventRoles}
            </h2>
            {user.event_roles.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{texts.noEventRoles}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {user.event_roles.map((eventRole) => (
                  <li
                    key={`${eventRole.event_id}-${eventRole.role}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <Link
                      to={`/admin/events/${eventRole.event_public_id}`}
                      className="font-medium text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {eventRole.event_title}
                    </Link>
                    <span className="text-muted">
                      {texts.eventRoleNames[eventRole.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-bold text-foreground">
              {user.is_suspended ? texts.restoreTitle : texts.suspendTitle}
            </h2>
            {canChange ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  {user.is_suspended ? texts.restoreHint : texts.suspendHint}
                </p>
                <Button
                  className="mt-4"
                  shape="pill"
                  variant={user.is_suspended ? "primary" : "secondary"}
                  disabled={isBusy}
                  onClick={toggle}
                >
                  {user.is_suspended ? texts.restore : texts.suspend}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {isMe ? texts.cannotSuspendSelf : texts.cannotSuspendAdmin}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-error">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminUserPage;
