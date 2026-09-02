import {
  useEffect,
  useMemo,
  useState,
} from "react";

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

import {
  useServiceVisit,
} from "./ServiceVisitProvider";

import type {
  ClientInventoryProduct,
} from "./service-visit.types";

type DeliveryRow = {
  product: ClientInventoryProduct;

  reserveBeforeQuantity: number;
  recommendedQuantity: number;
};

type DeliveryValue = {
  issueQuantity: string;
  looseQuantity: string;
};

type DeliveryValues =
  Record<string, DeliveryValue>;

function emptyDeliveryValue(): DeliveryValue {
  return {
    issueQuantity: "",
    looseQuantity: "",
  };
}

function normalizeWholeInput(
  value: string,
): string {
  if (!/^\d*$/.test(value)) {
    return "";
  }

  return value;
}

function normalizeQuantityInput(
  value: string,
): string {
  const normalized =
    value.replace(",", ".");

  if (
    !/^\d*(\.\d{0,3})?$/.test(
      normalized,
    )
  ) {
    return "";
  }

  return normalized;
}

function formatQuantity(
  quantity: number,
): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(3)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
}

export default function RestockDropStep() {
  const {
    activeVisit,
    completeRestockDrop,
  } = useServiceVisit();

  const [products, setProducts] =
    useState<ClientInventoryProduct[]>(
      [],
    );

  const [values, setValues] =
    useState<DeliveryValues>({});

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      if (!activeVisit) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const result =
          await loadClientInventoryProducts(
            activeVisit.clientId,
          );

        if (!cancelled) {
          setProducts(result);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load delivery products.",
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
  }, [
    activeVisit?.clientId,
  ]);

  const reserveBefore =
    activeVisit?.inventoryAudit ?? null;

  const rows =
    useMemo<DeliveryRow[]>(() => {
      if (!reserveBefore) {
        return [];
      }

      const reserveByProductId =
        new Map(
          reserveBefore.items.map(
            (item) => [
              item.productId,
              item,
            ],
          ),
        );

      return products
        .filter((product) =>
          reserveByProductId.has(
            product.productId,
          ),
        )
        .map((product) => {
          const reserve =
            reserveByProductId.get(
              product.productId,
            )!;

          const recommendedQuantity =
            product.parLevel === null
              ? 0
              : Math.max(
                  product.parLevel -
                    reserve.normalizedQuantity,
                  0,
                );

          return {
            product,

            reserveBeforeQuantity:
              reserve.normalizedQuantity,

            recommendedQuantity,
          };
        });
    }, [
      products,
      reserveBefore,
    ]);

  const deliveryRows =
    useMemo(
      () =>
        rows.filter(
          (row) =>
            row.product.parLevel !==
              null &&
            row.recommendedQuantity >
              0,
        ),
      [rows],
    );

  const productsWithoutPar =
    useMemo(
      () =>
        rows.filter(
          (row) =>
            row.product.parLevel ===
            null,
        ),
      [rows],
    );

  /*
   * Pre-fill the recommended quantity using
   * packages + loose units.
   */
  useEffect(() => {
    setValues((current) => {
      const next: DeliveryValues = {};

      for (const row of deliveryRows) {
        const productId =
          row.product.productId;

        if (current[productId]) {
          next[productId] =
            current[productId];

          continue;
        }

        const unitsPerIssue =
          row.product.packaging
            .unitsPerIssueUnit;

        const recommended =
          row.recommendedQuantity;

        const issueQuantity =
          Math.floor(
            recommended /
              unitsPerIssue,
          );

        const looseQuantity =
          recommended -
          issueQuantity *
            unitsPerIssue;

        next[productId] = {
          issueQuantity:
            String(issueQuantity),

          looseQuantity:
            String(looseQuantity),
        };
      }

      return next;
    });
  }, [deliveryRows]);

  function updateValue(
    productId: string,
    field:
      | "issueQuantity"
      | "looseQuantity",
    value: string,
  ) {
    const normalized =
      field === "issueQuantity"
        ? normalizeWholeInput(value)
        : normalizeQuantityInput(
            value,
          );

    if (
      value.length > 0 &&
      normalized === ""
    ) {
      return;
    }

    setValues((current) => ({
      ...current,

      [productId]: {
        ...(current[productId] ??
          emptyDeliveryValue()),

        [field]: normalized,
      },
    }));

    setErrorMessage(null);
  }

  const missingQuantityCount =
    deliveryRows.filter((row) => {
      const value =
        values[
          row.product.productId
        ];

      if (!value) {
        return true;
      }

      return (
        value.issueQuantity.trim() ===
          "" &&
        value.looseQuantity.trim() ===
          ""
      );
    }).length;

  const hasInvalidQuantity =
    deliveryRows.some((row) => {
      const value =
        values[
          row.product.productId
        ];

      if (!value) {
        return false;
      }

      const issueQuantity =
        Number(
          value.issueQuantity || 0,
        );

      const looseQuantity =
        Number(
          value.looseQuantity || 0,
        );

      if (
        !Number.isFinite(
          issueQuantity,
        ) ||
        issueQuantity < 0 ||
        !Number.isInteger(
          issueQuantity,
        )
      ) {
        return true;
      }

      if (
        !Number.isFinite(
          looseQuantity,
        ) ||
        looseQuantity < 0
      ) {
        return true;
      }

      if (
        !row.product.packaging
          .allowsLooseUnits &&
        looseQuantity > 0
      ) {
        return true;
      }

      if (
        !row.product.packaging
          .allowsPartialBaseUnit &&
        !Number.isInteger(
          looseQuantity,
        )
      ) {
        return true;
      }

      return false;
    });

  const canSubmit =
    !loading &&
    !submitting &&
    productsWithoutPar.length === 0 &&
    missingQuantityCount === 0 &&
    !hasInvalidQuantity;

  if (!activeVisit) {
    return null;
  }

  async function handleSubmit() {
    if (
      !canSubmit ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeRestockDrop({
        quantities:
          deliveryRows.map(
            (row) => {
              const value =
                values[
                  row.product
                    .productId
                ] ??
                emptyDeliveryValue();

              return {
                productId:
                  row.product
                    .productId,

                issueQuantity:
                  Number(
                    value.issueQuantity ||
                      0,
                  ),

                looseQuantity:
                  Number(
                    value.looseQuantity ||
                      0,
                  ),
              };
            },
          ),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm the delivery.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View
        style={
          styles.loadingContainer
        }
      >
        <ActivityIndicator />

        <Text
          style={styles.loadingText}
        >
          Loading delivery
          recommendations...
        </Text>
      </View>
    );
  }

  if (!reserveBefore) {
    return (
      <View style={styles.errorCard}>
        <Text
          style={styles.errorText}
        >
          Complete the client reserve
          count before confirming the
          delivery.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          Step 6
        </Text>

        <Text style={styles.title}>
          Client delivery
        </Text>

        <Text
          style={styles.description}
        >
          Confirm what you are actually
          delivering from the van to the
          client's reserve stock.
        </Text>
      </View>

      {productsWithoutPar.length >
      0 ? (
        <View style={styles.errorCard}>
          <Text
            style={styles.errorTitle}
          >
            Missing par level
          </Text>

          <Text
            style={styles.errorText}
          >
            Configure a par level for{" "}
            {productsWithoutPar
              .map(
                (row) =>
                  row.product.name,
              )
              .join(", ")}
            .
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text
            style={styles.errorText}
          >
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {productsWithoutPar.length ===
        0 &&
      deliveryRows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text
            style={styles.emptyCheck}
          >
            ✓
          </Text>

          <Text
            style={styles.emptyTitle}
          >
            No delivery needed
          </Text>

          <Text
            style={styles.emptyText}
          >
            Client reserve is already at
            or above the configured
            level.
          </Text>
        </View>
      ) : null}

      {deliveryRows.map((row) => {
        const productId =
          row.product.productId;

        const value =
          values[productId] ??
          emptyDeliveryValue();

        const actual =
          Number(
            value.issueQuantity || 0,
          ) *
            row.product.packaging
              .unitsPerIssueUnit +
          Number(
            value.looseQuantity || 0,
          );

        return (
          <View
            key={productId}
            style={styles.productCard}
          >
            <Text
              style={styles.productName}
            >
              {row.product.name}
            </Text>

            <Text
              style={styles.productMeta}
            >
              {row.product.packaging
                .packageDescription ??
                `${row.product.packaging.unitsPerIssueUnit} ${row.product.packaging.baseUnit} per ${row.product.packaging.issueUnit}`}
            </Text>

            <View
              style={
                styles.recommendationRow
              }
            >
              <Text
                style={
                  styles.recommendationLabel
                }
              >
                Recommended
              </Text>

              <Text
                style={
                  styles.recommendationValue
                }
              >
                {formatQuantity(
                  row.recommendedQuantity,
                )}{" "}
                {
                  row.product.packaging
                    .baseUnit
                }
              </Text>
            </View>

            <View
              style={
                styles.quantityRow
              }
            >
              <View
                style={
                  styles.quantityField
                }
              >
                <Text
                  style={
                    styles.quantityLabel
                  }
                >
                  {
                    row.product
                      .packaging
                      .issueUnit
                  }
                </Text>

                <TextInput
                  value={
                    value.issueQuantity
                  }
                  editable={!submitting}
                  keyboardType="number-pad"
                  placeholder="0"
                  onChangeText={(text) =>
                    updateValue(
                      productId,
                      "issueQuantity",
                      text,
                    )
                  }
                  style={
                    styles.quantityInput
                  }
                />
              </View>

              {row.product.packaging
                .allowsLooseUnits ? (
                <View
                  style={
                    styles.quantityField
                  }
                >
                  <Text
                    style={
                      styles.quantityLabel
                    }
                  >
                    Loose{" "}
                    {
                      row.product
                        .packaging
                        .baseUnit
                    }
                  </Text>

                  <TextInput
                    value={
                      value.looseQuantity
                    }
                    editable={
                      !submitting
                    }
                    keyboardType={
                      row.product
                        .packaging
                        .allowsPartialBaseUnit
                        ? "decimal-pad"
                        : "number-pad"
                    }
                    placeholder="0"
                    onChangeText={(
                      text,
                    ) =>
                      updateValue(
                        productId,
                        "looseQuantity",
                        text,
                      )
                    }
                    style={
                      styles.quantityInput
                    }
                  />
                </View>
              ) : null}
            </View>

            <Text
              style={styles.actualText}
            >
              Actual delivery:{" "}
              <Text
                style={
                  styles.actualValue
                }
              >
                {formatQuantity(actual)}{" "}
                {
                  row.product.packaging
                    .baseUnit
                }
              </Text>
            </Text>
          </View>
        );
      })}

      <Pressable
        accessibilityRole="button"
        disabled={!canSubmit}
        onPress={() => {
          void handleSubmit();
        }}
        style={({ pressed }) => [
          styles.confirmButton,

          pressed &&
            canSubmit &&
            styles.buttonPressed,

          !canSubmit &&
            styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator
            color="#ffffff"
          />
        ) : (
          <Text
            style={
              styles.confirmButtonText
            }
          >
            Confirm Delivery & Continue
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },

  header: {
    gap: 5,
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
  },

  description: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 19,
  },

  loadingContainer: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },

  loadingText: {
    color: "#75665d",
    fontSize: 14,
  },

  productCard: {
    backgroundColor: "#fffdf8",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  productName: {
    color: "#3d2b1f",
    fontSize: 14,
    fontWeight: "700",
  },

  productMeta: {
    color: "#8a7a70",
    fontSize: 11,
    marginTop: 3,
  },

  recommendationRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 9,
  },

  recommendationLabel: {
    color: "#8a6f53",
    fontSize: 11,
    fontWeight: "600",
  },

  recommendationValue: {
    color: "#b6692b",
    fontSize: 14,
    fontWeight: "800",
  },

  quantityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 9,
  },

  quantityField: {
    flex: 1,
  },

  quantityLabel: {
    color: "#6b5543",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 5,
  },

  quantityInput: {
    backgroundColor: "#ffffff",
    borderColor: "#ddd2c5",
    borderRadius: 9,
    borderWidth: 1,
    color: "#3d2b1f",
    fontSize: 15,
    fontWeight: "700",
    height: 40,
    paddingHorizontal: 10,
    textAlign: "center",
  },

  actualText: {
    color: "#8a6f53",
    fontSize: 11,
    marginTop: 8,
  },

  actualValue: {
    color: "#3d2b1f",
    fontWeight: "700",
  },

  emptyCard: {
    alignItems: "center",
    backgroundColor: "#f6f2ea",
    borderColor: "#e2d4c0",
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },

  emptyCheck: {
    color: "#38734d",
    fontSize: 24,
    fontWeight: "800",
  },

  emptyTitle: {
    color: "#2e1d12",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 5,
  },

  emptyText: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    textAlign: "center",
  },

  errorCard: {
    backgroundColor: "#fff6f3",
    borderColor: "#e7b9aa",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  errorTitle: {
    color: "#8a3324",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },

  errorText: {
    color: "#8a3324",
    fontSize: 13,
    lineHeight: 19,
  },

  confirmButton: {
    alignItems: "center",
    backgroundColor: "#b6692b",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },

  confirmButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.45,
  },
});