import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { loadClientInventoryProducts } from "./inventory-audit.service";

import { useServiceVisit } from "./ServiceVisitProvider";

import type {
  ClientInventoryProduct,
  MachineRefillZeroReason,
} from "./service-visit.types";

type RefillValue = {
  issueQuantity: string;
  looseQuantity: string;
};

type RefillValues = Record<string, RefillValue>;

type ZeroReasonValue = {
  reason: MachineRefillZeroReason | null;
  note: string;
};

type ZeroReasonValues = Record<string, ZeroReasonValue>;

const ZERO_REASON_OPTIONS: {
  value: MachineRefillZeroReason;
  label: string;
}[] = [
  {
    value: "refill_not_required",
    label: "Refill not required",
  },
  {
    value: "product_unavailable",
    label: "Product unavailable",
  },
  {
    value: "machine_issue",
    label: "Machine issue",
  },
  {
    value: "other",
    label: "Other",
  },
];

function emptyValue(): RefillValue {
  return {
    issueQuantity: "",
    looseQuantity: "",
  };
}

function emptyZeroReason(): ZeroReasonValue {
  return {
    reason: null,
    note: "",
  };
}

function normalizeWholeInput(value: string): string {
  return /^\d*$/.test(value) ? value : "";
}

function normalizeQuantityInput(value: string): string {
  const normalized = value.replace(",", ".");

  return /^\d*(\.\d{0,3})?$/.test(normalized) ? normalized : "";
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export default function MachineRefillStep() {
  const { activeVisit, completeMachineRefill } = useServiceVisit();

  const [products, setProducts] = useState<ClientInventoryProduct[]>([]);

  const [values, setValues] = useState<RefillValues>({});

  const [zeroReasons, setZeroReasons] = useState<ZeroReasonValues>({});

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeVisit) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const result = await loadClientInventoryProducts(activeVisit.clientId);

        if (!cancelled) {
          setProducts(result);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load machine refill products.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeVisit?.clientId]);

  /*
   * Use products already participating in the
   * service inventory workflow.
   */
  const refillProducts = useMemo(
    () => products.filter((product) => product.isRequired),
    [products],
  );

  function updateValue(
    productId: string,
    field: "issueQuantity" | "looseQuantity",
    value: string,
  ) {
    const normalized =
      field === "issueQuantity"
        ? normalizeWholeInput(value)
        : normalizeQuantityInput(value);

    if (value.length > 0 && normalized === "") {
      return;
    }

    setValues((current) => ({
      ...current,

      [productId]: {
        ...(current[productId] ?? emptyValue()),

        [field]: normalized,
      },
    }));

    setErrorMessage(null);
  }

  function adjustIssueQuantity(productId: string, delta: number) {
    setValues((current) => {
      const existing = current[productId] ?? emptyValue();

      const currentQuantity = Number(existing.issueQuantity || 0);

      const nextQuantity = Math.max(0, currentQuantity + delta);

      return {
        ...current,

        [productId]: {
          ...existing,

          issueQuantity: String(nextQuantity),
        },
      };
    });

    setErrorMessage(null);
  }

  function adjustLooseQuantity(productId: string, delta: number) {
    setValues((current) => {
      const existing = current[productId] ?? emptyValue();

      const currentQuantity = Number(existing.looseQuantity || 0);

      const nextQuantity = Math.max(0, currentQuantity + delta);

      return {
        ...current,

        [productId]: {
          ...existing,

          looseQuantity: String(nextQuantity),
        },
      };
    });

    setErrorMessage(null);
  }

  function selectZeroReason(
    productId: string,
    reason: MachineRefillZeroReason,
  ) {
    setZeroReasons((current) => {
      const existing = current[productId] ?? emptyZeroReason();

      const isAlreadySelected = existing.reason === reason;

      return {
        ...current,

        [productId]: {
          reason: isAlreadySelected ? null : reason,

          /*
           * Clear the free-text note when
           * Other is deselected.
           */
          note: !isAlreadySelected && reason === "other" ? existing.note : "",
        },
      };
    });

    setErrorMessage(null);
  }

  function updateZeroReasonNote(productId: string, note: string) {
    setZeroReasons((current) => ({
      ...current,

      [productId]: {
        reason: "other",
        note,
      },
    }));

    setErrorMessage(null);
  }

  const hasInvalidQuantity = refillProducts.some((product) => {
    const value = values[product.productId] ?? emptyValue();

    const issueQuantity = Number(value.issueQuantity || 0);

    const looseQuantity = product.packaging.allowsLooseUnits
      ? Number(value.looseQuantity || 0)
      : 0;

    if (!Number.isInteger(issueQuantity) || issueQuantity < 0) {
      return true;
    }

    if (!Number.isFinite(looseQuantity) || looseQuantity < 0) {
      return true;
    }

    if (
      product.packaging.allowsLooseUnits &&
      !product.packaging.allowsPartialBaseUnit &&
      !Number.isInteger(looseQuantity)
    ) {
      return true;
    }

    return false;
  });

  /*
   * Reason selection itself is optional.
   *
   * But once "Other" is explicitly selected,
   * the explanation is required.
   */
  const hasInvalidZeroReason = refillProducts.some((product) => {
    const value = values[product.productId] ?? emptyValue();

    const issueQuantity = Number(value.issueQuantity || 0);

    const looseQuantity = product.packaging.allowsLooseUnits
      ? Number(value.looseQuantity || 0)
      : 0;

    const actualQuantity =
      issueQuantity * product.packaging.unitsPerIssueUnit + looseQuantity;

    if (actualQuantity > 0) {
      return false;
    }

    const zeroReason = zeroReasons[product.productId];

    return zeroReason?.reason === "other" && zeroReason.note.trim() === "";
  });

  const canSubmit =
    !loading && !submitting && !hasInvalidQuantity && !hasInvalidZeroReason;

  if (!activeVisit) {
    return null;
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await completeMachineRefill({
        quantities: refillProducts.map((product) => {
          const value = values[product.productId] ?? emptyValue();

          const issueQuantity = Number(value.issueQuantity || 0);

          const looseQuantity = product.packaging.allowsLooseUnits
            ? Number(value.looseQuantity || 0)
            : 0;

          const actualQuantity =
            issueQuantity * product.packaging.unitsPerIssueUnit + looseQuantity;

          const zeroReason =
            zeroReasons[product.productId] ?? emptyZeroReason();

          return {
            productId: product.productId,

            issueQuantity,

            looseQuantity,

            /*
             * Never send stale zero-reason
             * metadata for a positive refill.
             */
            zeroReason: actualQuantity === 0 ? zeroReason.reason : null,

            zeroReasonNote:
              actualQuantity === 0 && zeroReason.reason === "other"
                ? zeroReason.note.trim() || null
                : null,
          };
        }),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm machine refill.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />

        <Text style={styles.secondaryText}>Loading machine products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Machine refill</Text>

        <Text style={styles.secondaryText}>
          Enter what you actually took from the van and put directly into the
          machine.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          This stock is deducted from your van inventory. It is not deducted
          from the client's reserve stock.
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {refillProducts.map((product) => {
        const value = values[product.productId] ?? emptyValue();

        const issueQuantity = Number(value.issueQuantity || 0);

        const looseQuantity = product.packaging.allowsLooseUnits
          ? Number(value.looseQuantity || 0)
          : 0;

        const actual =
          issueQuantity * product.packaging.unitsPerIssueUnit + looseQuantity;

        const zeroReason = zeroReasons[product.productId] ?? emptyZeroReason();

        return (
          <View key={product.productId} style={styles.productCard}>
            <Text style={styles.productName}>{product.name}</Text>

            <Text style={styles.secondaryText}>
              {product.packaging.packageDescription ??
                `${product.packaging.unitsPerIssueUnit} ${product.packaging.baseUnit} per ${product.packaging.issueUnit}`}
            </Text>

            <View style={styles.quantityRow}>
              <View style={styles.quantityField}>
                <Text style={styles.quantityLabel}>
                  {product.packaging.issueUnit}
                </Text>

                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${product.packaging.issueUnit} quantity for ${product.name}`}
                    disabled={submitting || issueQuantity <= 0}
                    onPress={() => adjustIssueQuantity(product.productId, -1)}
                    style={({ pressed }) => [
                      styles.stepperButton,

                      pressed && !submitting && styles.stepperButtonPressed,

                      (submitting || issueQuantity <= 0) &&
                        styles.stepperButtonDisabled,
                    ]}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </Pressable>

                  <Text style={styles.stepperValue}>
                    {value.issueQuantity || "0"}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${product.packaging.issueUnit} quantity for ${product.name}`}
                    disabled={submitting}
                    onPress={() => adjustIssueQuantity(product.productId, 1)}
                    style={({ pressed }) => [
                      styles.stepperButton,

                      pressed && !submitting && styles.stepperButtonPressed,

                      submitting && styles.stepperButtonDisabled,
                    ]}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>

              {product.packaging.allowsLooseUnits ? (
                product.packaging.allowsPartialBaseUnit ? (
                  <View style={styles.quantityField}>
                    <Text style={styles.quantityLabel}>
                      {product.packaging.baseUnit}
                    </Text>

                    <TextInput
                      value={value.looseQuantity}
                      editable={!submitting}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#a89c8f"
                      onChangeText={(text) =>
                        updateValue(product.productId, "looseQuantity", text)
                      }
                      style={styles.quantityInput}
                    />
                  </View>
                ) : (
                  <View style={styles.quantityField}>
                    <Text style={styles.quantityLabel}>
                      {product.packaging.baseUnit}
                    </Text>

                    <View style={styles.stepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease loose ${product.packaging.baseUnit} quantity for ${product.name}`}
                        disabled={submitting || looseQuantity <= 0}
                        onPress={() =>
                          adjustLooseQuantity(product.productId, -1)
                        }
                        style={({ pressed }) => [
                          styles.stepperButton,
                          pressed && !submitting && styles.stepperButtonPressed,
                          (submitting || looseQuantity <= 0) &&
                            styles.stepperButtonDisabled,
                        ]}
                      >
                        <Text style={styles.stepperButtonText}>−</Text>
                      </Pressable>

                      <Text style={styles.stepperValue}>
                        {value.looseQuantity || "0"}
                      </Text>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Increase loose ${product.packaging.baseUnit} quantity for ${product.name}`}
                        disabled={submitting}
                        onPress={() =>
                          adjustLooseQuantity(product.productId, 1)
                        }
                        style={({ pressed }) => [
                          styles.stepperButton,
                          pressed && !submitting && styles.stepperButtonPressed,
                          submitting && styles.stepperButtonDisabled,
                        ]}
                      >
                        <Text style={styles.stepperButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                )
              ) : null}
            </View>

            <Text style={styles.actual}>
              Total:{" "}
              <Text style={styles.actualValue}>
                {formatQuantity(actual)} {product.packaging.baseUnit}
                {actual === 1 ? "" : "s"}
              </Text>
            </Text>

            {actual === 0 ? (
              <View style={styles.reasonSection}>
                <Text style={styles.reasonTitle}>
                  Reason for no refill (optional)
                </Text>

                <View style={styles.reasonOptions}>
                  {ZERO_REASON_OPTIONS.map((option) => {
                    const selected = zeroReason.reason === option.value;

                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{
                          selected,
                        }}
                        disabled={submitting}
                        onPress={() =>
                          selectZeroReason(product.productId, option.value)
                        }
                        style={({ pressed }) => [
                          styles.reasonOption,

                          selected && styles.reasonOptionSelected,

                          pressed && !submitting && styles.reasonOptionPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.radio,

                            selected && styles.radioSelected,
                          ]}
                        >
                          {selected ? <View style={styles.radioDot} /> : null}
                        </View>

                        <Text style={styles.reasonOptionText}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {zeroReason.reason === "other" ? (
                  <TextInput
                    editable={!submitting}
                    multiline
                    onChangeText={(text) =>
                      updateZeroReasonNote(product.productId, text)
                    }
                    placeholder="Enter reason..."
                    placeholderTextColor="#a89c8f"
                    style={styles.reasonInput}
                    value={zeroReason.note}
                  />
                ) : null}
              </View>
            ) : null}
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
          styles.button,

          pressed && canSubmit && styles.buttonPressed,

          !canSubmit && styles.buttonDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>
            Confirm Machine Refill & Continue
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

  title: {
    color: "#2e1d12",
    fontSize: 22,
    fontWeight: "700",
  },

  secondaryText: {
    color: "#8a6f53",
    fontSize: 13,
    lineHeight: 19,
  },

  loadingContainer: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },

  infoCard: {
    backgroundColor: "#f6f2ea",
    borderColor: "#e2d4c0",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  infoText: {
    color: "#6b5543",
    fontSize: 12,
    lineHeight: 18,
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
    marginBottom: 3,
  },

  quantityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
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

  actual: {
    color: "#8a6f53",
    fontSize: 11,
    marginTop: 8,
  },

  actualValue: {
    color: "#3d2b1f",
    fontWeight: "700",
  },

  reasonSection: {
    borderTopColor: "#efe6d8",
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },

  reasonTitle: {
    color: "#6b5543",
    fontSize: 12,
    fontWeight: "600",
  },

  reasonOptions: {
    gap: 4,
    marginTop: 8,
  },

  reasonOption: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 9,
    minHeight: 38,
    paddingHorizontal: 4,
  },

  reasonOptionSelected: {
    opacity: 1,
  },

  reasonOptionPressed: {
    backgroundColor: "#f6efe6",
  },

  radio: {
    alignItems: "center",
    borderColor: "#b9a996",
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },

  radioSelected: {
    borderColor: "#7a3f2c",
  },

  radioDot: {
    backgroundColor: "#7a3f2c",
    borderRadius: 5,
    height: 10,
    width: 10,
  },

  reasonOptionText: {
    color: "#4a382c",
    fontSize: 13,
  },

  reasonInput: {
    backgroundColor: "#faf6f0",
    borderColor: "#d8c7b0",
    borderRadius: 9,
    borderWidth: 1,
    color: "#2e1d12",
    fontSize: 13,
    marginTop: 8,
    minHeight: 72,
    padding: 10,
    textAlignVertical: "top",
  },

  errorCard: {
    backgroundColor: "#fff6f3",
    borderColor: "#e7b9aa",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  errorText: {
    color: "#8a3324",
    fontSize: 13,
    lineHeight: 19,
  },

  button: {
    alignItems: "center",
    backgroundColor: "#b6692b",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.45,
  },

  stepper: {
    alignItems: "center",
    backgroundColor: "#faf6f0",
    borderColor: "#d8c7b0",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    height: 40,
    justifyContent: "space-between",
    overflow: "hidden",
  },

  stepperButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },

  stepperButtonText: {
    color: "#7a3f2c",
    fontSize: 20,
    fontWeight: "700",
  },

  stepperValue: {
    color: "#2e1d12",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  stepperButtonPressed: {
    backgroundColor: "#efe3d5",
  },

  stepperButtonDisabled: {
    opacity: 0.35,
  },
});
