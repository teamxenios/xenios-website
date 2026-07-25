import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  PRODUCT_REQUEST_CATEGORIES,
  PRODUCT_REQUEST_PRIORITIES,
  PRODUCT_REQUEST_STATUSES,
  type AdminProductRequestSummary,
  type ProductRequestAnalytics,
} from "@shared/research/product-requests";
import {
  getProductRequestAnalytics,
  listAdminProductRequests,
} from "../../adapters/productRequests";
import { ADMIN_ROUTES } from "../../lib/routes";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchSearch,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDate, useAdminResource } from "./auth";

export default function ProductRequestsAdmin() {
  return (
    <AdminScreen
      title="Product requests"
      lead="Member demand signals for research-team review. A request never creates a product, order, inventory, price, or commerce state."
    >
      {(token) => <ProductRequestQueue token={token} />}
    </AdminScreen>
  );
}

function ProductRequestQueue({ token }: { token: string }) {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("search") ?? "";
    } catch {
      return "";
    }
  });
  const debouncedSearch = useDebounced(search);
  const loadQueue = useCallback(
    (currentToken: string) =>
      listAdminProductRequests(currentToken, {
        status,
        category,
        priority,
        search: debouncedSearch,
      }),
    [status, category, priority, debouncedSearch],
  );
  const queue = useAdminResource(token, loadQueue);
  const analytics = useAdminResource(
    token,
    useCallback((currentToken: string) => getProductRequestAnalytics(currentToken), []),
  );
  const rows = queue.data?.requests ?? [];

  return (
    <div className="grid gap-6">
      <AdminBoundary
        state={analytics.state}
        message={analytics.message}
        deniedCode={analytics.deniedCode}
        onRetry={analytics.reload}
      >
        {analytics.data?.analytics && (
          <AnalyticsStrip
            analytics={analytics.data.analytics}
            onFilter={setSearch}
            onStatus={setStatus}
            onCategory={setCategory}
          />
        )}
      </AdminBoundary>

      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={setSearch}
          label="Search product requests"
          placeholder="Reference, product, brand, or description"
        />
        <Filter label="Status" value={status} onChange={setStatus}>
          <option value="">All statuses</option>
          {PRODUCT_REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </Filter>
        <Filter label="Category" value={category} onChange={setCategory}>
          <option value="">All categories</option>
          {PRODUCT_REQUEST_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, " ")}
            </option>
          ))}
        </Filter>
        <Filter label="Priority" value={priority} onChange={setPriority}>
          <option value="">All priorities</option>
          {PRODUCT_REQUEST_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Filter>
      </ResearchFilterBar>

      <AdminBoundary
        state={queue.state}
        message={queue.message}
        deniedCode={queue.deniedCode}
        onRetry={queue.reload}
        unavailableTitle="The product-request queue is not connected."
        unavailableBody="No demand or request records are invented while this service is unavailable."
      >
        <ResearchDataTable<AdminProductRequestSummary>
          caption="Product requests"
          columns={[
            {
              key: "reference",
              header: "Request",
              render: (row) => (
                <Link
                  href={ADMIN_ROUTES.productRequest.replace(":id", row.requestId)}
                  className="font-700 underline"
                >
                  {row.reference}
                </Link>
              ),
            },
            { key: "product", header: "Product", render: (row) => row.productName },
            { key: "member", header: "Member", render: (row) => row.memberEmail },
            { key: "category", header: "Category", render: (row) => row.category.replace(/_/g, " ") },
            {
              key: "status",
              header: "Status",
              render: (row) => <ResearchStatusBadge label={row.status.replace(/_/g, " ")} tone={statusTone(row.status)} />,
            },
            { key: "priority", header: "Priority", render: (row) => row.priority },
            { key: "demand", header: "Unique members", render: (row) => String(row.uniqueMemberDemand) },
            { key: "created", header: "Submitted", render: (row) => fmtDate(row.createdAt) },
          ]}
          rows={rows}
          rowKey={(row) => row.requestId}
          empty="No product requests match these filters."
        />
      </AdminBoundary>
    </div>
  );
}

function AnalyticsStrip({
  analytics,
  onFilter,
  onStatus,
  onCategory,
}: {
  analytics: ProductRequestAnalytics;
  onFilter: (search: string) => void;
  onStatus: (status: string) => void;
  onCategory: (category: string) => void;
}) {
  const top = useMemo(() => analytics.topDemand.slice(0, 3), [analytics.topDemand]);
  return (
    <section className="card" aria-label="Product-request analytics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Total requests" value={analytics.total} />
        <Metric label="Unique requesters" value={analytics.uniqueRequesters} />
        <Metric label="Open requests" value={analytics.open} />
        <Metric label="Demand candidates" value={analytics.demandCandidates} />
        <Metric label="Catalog-addition rate" value={`${(analytics.catalogAdditionRate * 100).toFixed(1)}%`} />
      </div>
      <div className="grid gap-5 mt-5 md:grid-cols-2">
        <AnalyticsLinks
          label="Requests by status"
          items={analytics.byStatus.map((item) => ({
            key: item.status,
            label: item.status.replace(/_/g, " "),
            count: item.count,
          }))}
          onChoose={onStatus}
        />
        <AnalyticsLinks
          label="Requests by category"
          items={analytics.byCategory.map((item) => ({
            key: item.category,
            label: item.category.replace(/_/g, " "),
            count: item.count,
          }))}
          onChoose={onCategory}
        />
      </div>
      {top.length > 0 && (
        <div className="mt-5">
          <p className="mono-label text-ink-mute">Top demand by unique members</p>
          <ul className="mt-2 grid gap-2" style={{ paddingLeft: 20 }}>
            {top.map((item) => (
              <li key={item.candidateId} className="body-s">
                <button type="button" className="underline" onClick={() => onFilter(item.normalizedName)}>
                  {item.normalizedName}
                </button>{" "}
                · {item.uniqueMemberCount} unique member{item.uniqueMemberCount === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="mono-label text-ink-mute">{label}</p>
      <p className="display-s mt-1">{value}</p>
    </div>
  );
}

function AnalyticsLinks({
  label,
  items,
  onChoose,
}: {
  label: string;
  items: Array<{ key: string; label: string; count: number }>;
  onChoose: (key: string) => void;
}) {
  return (
    <div>
      <p className="mono-label text-ink-mute">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-2" style={{ listStyle: "none", marginLeft: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" className="btn btn-secondary" onClick={() => onChoose(item.key)}>
              {item.label} ({item.count})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="mono-label text-ink-mute">{label}</span>
      <select className="input-field" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function statusTone(status: string): "pending" | "info" | "warning" | "success" | "neutral" {
  if (status === "added_to_catalog") return "success";
  if (status === "more_information_requested" || status === "currently_unavailable") return "warning";
  if (["under_review", "accepted_for_diligence", "planned"].includes(status)) return "info";
  if (["closed", "withdrawn", "not_moving_forward"].includes(status)) return "neutral";
  return "pending";
}
