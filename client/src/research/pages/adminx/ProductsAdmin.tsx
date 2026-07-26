import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import type {
  AdminProductSummary,
  CreateAdminProductInput,
  ProductAdminStatus,
  ProductVisibilityState,
} from "@shared/research/product-admin";
import {
  ResearchDataTable,
  ResearchDrawer,
  ResearchFilterBar,
  ResearchPagination,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import {
  createAdminProduct,
  listAdminProducts,
  newMutationKey,
} from "../../adapters/productAdmin";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

const PAGE_SIZE = 20;

const EMPTY_PRODUCT: CreateAdminProductInput = {
  productCode: "",
  slug: "",
  displayName: "",
  canonicalName: "",
  aliases: [],
  lane: "research_material",
  category: "",
  classification: "research_material",
};

function mutationMessage(result: Awaited<ReturnType<typeof createAdminProduct>>) {
  if (result.kind === "denied" || result.kind === "error") {
    return result.message ?? "The product could not be saved.";
  }
  if (result.kind === "forbidden") {
    return result.message ?? "You do not have permission to create products.";
  }
  if (result.kind === "unavailable") {
    return "Product administration is not available yet.";
  }
  if (result.kind === "unauthorized") return "Sign in again to continue.";
  return null;
}

export default function ProductsAdmin() {
  return (
    <AdminScreen
      title="Products"
      lead="Create, review, publish, and retire the canonical Research catalog without editing source code."
    >
      {(token) => <ProductsBody token={token} />}
    </AdminScreen>
  );
}

function ProductsBody({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] =
    useState<ProductVisibilityState | "">("");
  const [status, setStatus] = useState<ProductAdminStatus | "">("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebounced(search);
  const loader = useCallback(
    (currentToken: string) =>
      listAdminProducts(currentToken, {
        query: debounced || undefined,
        visibility: visibility || undefined,
        status: status || undefined,
        missingInputsOnly: missingOnly || undefined,
      }),
    [debounced, missingOnly, status, visibility],
  );
  const resource = useAdminResource(token, loader);
  const rows = resource.data?.products ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE),
    [clamped, rows],
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ResearchFilterBar>
          <ResearchSearch
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            label="Search products"
            placeholder="Name, product code, or canonical name"
          />
          <label className="body-s">
            <span className="sr-only">Visibility</span>
            <select
              className="input-field"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value as ProductVisibilityState | "");
                setPage(1);
              }}
            >
              <option value="">All visibility</option>
              <option value="hidden">Hidden</option>
              <option value="members_only">Members only</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="body-s">
            <span className="sr-only">Product status</span>
            <select
              className="input-field"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ProductAdminStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="in_review">In review</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="flex items-center gap-2 body-s">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(event) => {
                setMissingOnly(event.target.checked);
                setPage(1);
              }}
            />
            Missing inputs
          </label>
        </ResearchFilterBar>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreateOpen(true)}
        >
          Create product
        </button>
      </div>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="Product administration is not connected."
        unavailableBody="The production route and migration must be integrated before product records can be edited."
      >
        <ResearchDataTable<AdminProductSummary>
          caption="Products"
          columns={[
            {
              key: "name",
              header: "Product",
              render: (product) => (
                <div>
                  <Link
                    href={`${ADMIN_ROUTES.products}/${product.id}`}
                    className="font-700 underline"
                  >
                    {product.displayName}
                  </Link>
                  <p className="mono-label text-ink-mute mt-1">
                    {product.productCode}
                  </p>
                </div>
              ),
            },
            {
              key: "category",
              header: "Category",
              render: (product) => product.category,
            },
            {
              key: "variants",
              header: "Variants",
              render: (product) =>
                `${product.approvedVariantCount}/${product.variantCount} approved`,
            },
            {
              key: "status",
              header: "Status",
              render: (product) => (
                <ResearchStatusBadge
                  label={product.status.replace(/_/g, " ")}
                  tone={product.status === "published" ? "success" : "neutral"}
                />
              ),
            },
            {
              key: "visibility",
              header: "Visibility",
              render: (product) => (
                <ResearchStatusBadge
                  label={product.visibility.replace(/_/g, " ")}
                  tone={product.visibility === "public" ? "info" : "neutral"}
                />
              ),
            },
            {
              key: "inputs",
              header: "Required inputs",
              render: (product) =>
                product.missingInputCount > 0 ? (
                  <ResearchStatusBadge
                    label={`${product.missingInputCount} missing`}
                    tone="warning"
                  />
                ) : (
                  <ResearchStatusBadge label="Complete" tone="success" />
                ),
            },
            {
              key: "updated",
              header: "Updated",
              render: (product) => fmtDate(product.updatedAt),
            },
          ]}
          rows={pageRows}
          rowKey={(product) => product.id}
          empty="No products match these filters."
        />
        <ResearchPagination
          page={clamped}
          pageCount={pageCount}
          onPage={setPage}
        />
      </AdminBoundary>

      <ResearchSecureNotice>
        Creating a product does not make it visible or purchasable. Publishing
        remains server-gated by the canonical required-input system.
      </ResearchSecureNotice>

      <CreateProductDrawer
        token={token}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          resource.reload();
        }}
      />
    </div>
  );
}

function CreateProductDrawer({
  token,
  open,
  onClose,
  onCreated,
}: {
  token: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateAdminProductInput>(EMPTY_PRODUCT);
  const [aliases, setAliases] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CreateAdminProductInput>(
    key: K,
    value: CreateAdminProductInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const ready =
    form.productCode.trim() &&
    form.slug.trim() &&
    form.displayName.trim() &&
    form.canonicalName.trim() &&
    form.category.trim() &&
    form.classification.trim();

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const result = await createAdminProduct(
      token,
      {
        ...form,
        aliases: aliases
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      },
      newMutationKey("create-product"),
    );
    setBusy(false);
    if (result.kind === "ok") {
      setForm(EMPTY_PRODUCT);
      setAliases("");
      onCreated();
      return;
    }
    setError(mutationMessage(result));
  }

  return (
    <ResearchDrawer open={open} title="Create product" onClose={onClose}>
      <p className="body-s text-ink-2">
        Start with the product identity. Variants, prices, media, content, and
        release review are added after the draft exists.
      </p>
      <div className="grid gap-4 mt-5">
        {(
          [
            ["displayName", "Product name"],
            ["canonicalName", "Canonical name"],
            ["productCode", "Product code"],
            ["slug", "URL slug"],
            ["category", "Category"],
            ["classification", "Product classification"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="form-label" htmlFor={`product-create-${key}`}>
              {label}
            </label>
            <input
              id={`product-create-${key}`}
              className="input-field"
              value={form[key]}
              onChange={(event) => set(key, event.target.value)}
              required
            />
          </div>
        ))}
        <div>
          <label className="form-label" htmlFor="product-create-aliases">
            Search aliases
          </label>
          <input
            id="product-create-aliases"
            className="input-field"
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="Comma separated"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="product-create-lane">
            Research lane
          </label>
          <select
            id="product-create-lane"
            className="input-field"
            value={form.lane}
            onChange={(event) =>
              set("lane", event.target.value as CreateAdminProductInput["lane"])
            }
          >
            <option value="research_material">Research material</option>
            <option value="supplement">Supplement</option>
            <option value="quantum">Quantum</option>
            <option value="non_product_program">Program</option>
            <option value="future_clinical">
              Future clinical — catalog state only
            </option>
          </select>
        </div>
        {form.lane === "future_clinical" ? (
          <p className="body-s text-ink-2" role="status">
            This lane remains non-transactional and does not create prescribing,
            dosing, eligibility, or treatment workflows.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="body-s" style={{ color: "var(--error)" }}>
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Creating..." : "Create draft"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </ResearchDrawer>
  );
}
