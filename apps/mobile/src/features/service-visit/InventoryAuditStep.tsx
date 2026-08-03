import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  loadClientInventoryProducts,
} from "./inventory-audit.service";
import { useServiceVisit } from "./ServiceVisitProvider";
import type {
  ClientInventoryProduct,
  InventoryProductCategory,
} from "./service-visit.types";

const CATEGORY_LABELS: Record<
  InventoryProductCategory,
  string
> = {
  coffee: "Coffee",
  powders: "Powders",
  sweeteners_stirrers: "Sweeteners & Stirrers",
  cups_lids: "Cups & Lids",
  creamers: "Creamers",
  cleaning: "Cleaning",
};

type CountValues = Record<string, string>;

function normalizeQuantityInput(value: string): string {
  const normalized = value.replace(",", ".");

  if (!/^\d*(\.\d{0,3})?$/.test(normalized)) {
    return "";
  }

  return normalized;
}

export default function InventoryAuditStep() {
  const {
    activeVisit,
    completeInventoryAudit,
  } = useServiceVisit();

  const [products, setProducts] =
    useState<ClientInventoryProduct[]>([]);

  const [counts, setCounts] =
    useState<CountValues>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const clientId = activeVisit?.clientId ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadProducts(): Promise<void> {
      if (!clientId) {
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const result =
          await loadClientInventoryProducts(clientId);

        if (!cancelled) {
          setProducts(result);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the inventory list.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<
      InventoryProductCategory,
      ClientInventoryProduct[]
    >();

    for (const product of products) {
      const categoryProducts =
        groups.get(product.category) ?? [];

      categoryProducts.push(product);
      groups.set(product.category, categoryProducts);
    }

    return Array.from(groups.entries());
  }, [products]);

  if (!activeVisit) {
    return null;
  }

  const missingRequiredCount = products.filter(
    (product) =>
      product.isRequired &&
      counts[product.productId]?.trim() === "",
  ).length;

  const hasInvalidQuantity = products.some((product) => {
    const value = counts[product.productId];

    if (value === undefined || value.trim() === "") {
      return false;
    }

    const quantity = Number(value);

    return !Number.isFinite(quantity) || quantity < 0;
  });

  const canSubmit =
    !loading &&
    !submitting &&
    products.length > 0 &&
    missingRequiredCount === 0 &&
    !hasInvalidQuantity;

  function updateCount(
    productId: string,
    value: string,
  ): void {
    const normalized = normalizeQuantityInput(value);

    if (value.length > 0 && normalized === "") {
      return;
    }

    setCounts((current) => ({
      ...current,
      [productId]: normalized,
    }));

    setErrorMessage(null);
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeInventoryAudit({
        counts: products.map((product) => ({
          productId: product.productId,
          quantity: Number(
            counts[product.productId] ?? "0",
          ),
        })),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the inventory audit.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator />

        <Text style={styles.loadingText}>
          Loading expected client stock…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Step 5</Text>

      <Text style={styles.title}>
        Count current inventory
      </Text>

      <Text style={styles.description}>
        Enter what is physically remaining at this location before adding
        new stock. Use decimals for partial units, for example 0.5 gallon.
      </Text>

      <View style={styles.clientCard}>
        <Text style={styles.clientLabel}>Location</Text>

        <Text style={styles.clientName}>
          {activeVisit.target.clientName}
        </Text>
      </View>

      {products.length === 0 ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            No inventory products are configured for this client. A manager
            must configure the expected product list before this step can be
            completed.
          </Text>
        </View>
      ) : null}

      {groupedProducts.map(
        ([category, categoryProducts]) => (
          <View key={category} style={styles.category}>
            <Text style={styles.categoryTitle}>
              {CATEGORY_LABELS[category]}
            </Text>

            {categoryProducts.map((product) => (
              <View
                key={product.productId}
                style={styles.productRow}
              >
                <View style={styles.productContent}>
                  <Text style={styles.productName}>
                    {product.name}
                  </Text>

                  <Text style={styles.productDetail}>
                    {product.sku
                      ? `SKU ${product.sku} · `
                      : ""}
                    Counted in {product.unitLabel}s
                  </Text>
                </View>

                <TextInput
                  accessibilityLabel={`Quantity for ${product.name}`}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => {
                    updateCount(product.productId, value);
                  }}
                  placeholder="0"
                  placeholderTextColor="#a89c8f"
                  style={styles.quantityInput}
                  value={counts[product.productId] ?? ""}
                />
              </View>
            ))}
          </View>
        ),
      )}

      {missingRequiredCount > 0 &&
      products.length > 0 ? (
        <Text style={styles.helperText}>
          Enter a quantity for all {missingRequiredCount} remaining required{" "}
          {missingRequiredCount === 1 ? "product" : "products"}. Enter 0 when
          none remains.
        </Text>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && canSubmit && styles.buttonPressed,
          !canSubmit && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            Save Inventory and Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdfa",
    borderColor: "#e2d4c0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  eyebrow: {
    color: "#9c5621",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 7,
  },
  description: {
    color: "#8a6f53",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  clientCard: {
    backgroundColor: "#f7eadc",
    borderRadius: 12,
    marginTop: 16,
    padding: 14,
  },
  clientLabel: {
    color: "#9c5621",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  clientName: {
    color: "#4a2c1a",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  loadingText: {
    color: "#8a6f53",
    marginTop: 10,
    textAlign: "center",
  },
  warningCard: {
    backgroundColor: "#fff3d8",
    borderColor: "#e8cd86",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  warningText: {
    color: "#7a5414",
    fontSize: 13,
    lineHeight: 19,
  },
  category: {
    marginTop: 22,
  },
  categoryTitle: {
    color: "#4a2c1a",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  productRow: {
    alignItems: "center",
    borderBottomColor: "#efe6d8",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 12,
  },
  productContent: {
    flex: 1,
    paddingRight: 12,
  },
  productName: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  productDetail: {
    color: "#8c8076",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  quantityInput: {
    backgroundColor: "#faf6f0",
    borderColor: "#d8c7b0",
    borderRadius: 10,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 16,
    fontWeight: "700",
    minHeight: 44,
    paddingHorizontal: 10,
    textAlign: "center",
    width: 76,
  },
  helperText: {
    color: "#8a6f53",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
  },
  errorCard: {
    backgroundColor: "#f8e4e1",
    borderColor: "#e6bab4",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  errorText: {
    color: "#9f302d",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7a3f2c",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});