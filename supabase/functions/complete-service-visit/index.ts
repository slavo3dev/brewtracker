import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const SERVICE_EMAIL_FROM =
  Deno.env.get("SERVICE_EMAIL_FROM") ?? "BrewTracker <service@example.com>";

const WEB_APP_URL = Deno.env.get("WEB_APP_URL");

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type CompletionPayload = {
  sourceVisitId: string;

  routeId: string;
  stopId: string;
  clientId: string;
  machineId: string;
  completedBy: string;

  completedAt: string;

  visitSummary: VisitSummary;
};

type VisitSummaryInventoryItem = {
  productId: string;
  sku: string | null;
  name: string;
  actualQuantity: number;
  normalizedUnit: string;
};

type VisitSummaryRestockDrop = {
  items: VisitSummaryInventoryItem[];
} | null;

type VisitSummaryMachineRefill = {
  items: VisitSummaryInventoryItem[];
} | null;

type VisitSummaryReserveAfterItem = {
  productId: string;
  reserveAfterQuantity: number;
  normalizedUnit: string;
};

type VisitSummaryReserveAfter = {
  items: VisitSummaryReserveAfterItem[];
} | null;

type VisitSummary = Record<string, unknown> & {
  restockDrop?: VisitSummaryRestockDrop;
  machineRefill?: VisitSummaryMachineRefill;
  reserveAfter?: VisitSummaryReserveAfter;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatQuantity(
  quantity: number,
  unit: string,
): string {
  const safeUnit = escapeHtml(unit);

  if (quantity === 1) {
    return `1 ${safeUnit}`;
  }

  if (
    unit.endsWith("s") ||
    unit.endsWith("x") ||
    unit.endsWith("ch") ||
    unit.endsWith("sh")
  ) {
    return `${quantity} ${safeUnit}es`;
  }

  return `${quantity} ${safeUnit}s`;
}

function createInventorySummaryHtml(
  visitSummary: VisitSummary,
): string {
  const deliveredItems =
    visitSummary.restockDrop?.items ?? [];

  const machineRefillItems =
    visitSummary.machineRefill?.items ?? [];

  const reserveAfterItems =
    visitSummary.reserveAfter?.items ?? [];

  const productIds = new Set<string>();

  for (const item of deliveredItems) {
    productIds.add(item.productId);
  }

  for (const item of machineRefillItems) {
    productIds.add(item.productId);
  }

  for (const item of reserveAfterItems) {
    productIds.add(item.productId);
  }

  if (productIds.size === 0) {
    return "";
  }

  const productHtml = [...productIds]
    .map((productId) => {
      const delivered = deliveredItems.find(
        (item) => item.productId === productId,
      );

      const machineRefill = machineRefillItems.find(
        (item) => item.productId === productId,
      );

      const reserveAfter = reserveAfterItems.find(
        (item) => item.productId === productId,
      );

      const product =
        delivered ?? machineRefill;

      if (!product) {
        return "";
      }

      const deliveredQuantity =
        delivered?.actualQuantity ?? 0;

      const machineRefillQuantity =
        machineRefill?.actualQuantity ?? 0;

      const normalizedUnit =
        delivered?.normalizedUnit ??
        machineRefill?.normalizedUnit ??
        reserveAfter?.normalizedUnit ??
        "";

      const sku = product.sku
        ? ` · ${escapeHtml(product.sku)}`
        : "";

      return `
        <div style="margin-bottom: 20px;">
          <p style="margin-bottom: 8px;">
            <strong>
              ${escapeHtml(product.name)}${sku}
            </strong>
          </p>

          <p style="margin: 4px 0;">
            Delivered to client:
            <strong>
              ${formatQuantity(
                deliveredQuantity,
                normalizedUnit,
              )}
            </strong>
          </p>

          <p style="margin: 4px 0;">
            Machine refill:
            <strong>
              ${formatQuantity(
                machineRefillQuantity,
                normalizedUnit,
              )}
            </strong>
          </p>

          ${
            reserveAfter
              ? `
                <p style="margin: 4px 0;">
                  Reserve remaining:
                  <strong>
                    ${formatQuantity(
                      reserveAfter.reserveAfterQuantity,
                      reserveAfter.normalizedUnit,
                    )}
                  </strong>
                </p>
              `
              : ""
          }
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!productHtml) {
    return "";
  }

  return `
    <div style="margin-top: 24px;">
      <h2>Inventory summary</h2>

      ${productHtml}
    </div>
  `;
}

async function createPhotoSignedUrl(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from("service-visit-photos")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (error) {
    console.error("Unable to create photo signed URL:", error.message);

    return null;
  }

  return data.signedUrl;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed.",
      },
      405,
    );
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return jsonResponse(
      {
        error: "Authorization required.",
      },
      401,
    );
  }

  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(
      {
        error: "Unable to authenticate user.",
      },
      401,
    );
  }

  const payload = (await request.json()) as CompletionPayload;

  if (payload.completedBy !== user.id) {
    return jsonResponse(
      {
        error: "The authenticated user does not match the service visit.",
      },
      403,
    );
  }

  if (
    !payload.sourceVisitId ||
    !payload.routeId ||
    !payload.stopId ||
    !payload.clientId ||
    !payload.machineId ||
    !payload.completedAt
  ) {
    return jsonResponse(
      {
        error: "Missing completion data.",
      },
      400,
    );
  }

  //--------------------------------------------------
  // Verify stop belongs to driver + route + machine/client
  //--------------------------------------------------

  const { data: stop, error: stopError } = await supabaseAdmin
    .from("stops")
    .select(
      `
        id,
        client_id,
        machine_id,
        route_id,
        status,
        route:routes!inner (
          id,
          driver_id
        )
      `,
    )
    .eq("id", payload.stopId)
    .single();

  if (stopError || !stop) {
    return jsonResponse(
      {
        error: "Service stop could not be found.",
      },
      404,
    );
  }

  if (
    stop.client_id !== payload.clientId ||
    stop.machine_id !== payload.machineId ||
    stop.route_id !== payload.routeId ||
    stop.route.driver_id !== user.id
  ) {
    return jsonResponse(
      {
        error: "The service visit does not match the assigned stop.",
      },
      403,
    );
  }

  //--------------------------------------------------
  // Load assigned machine
  //
  // FLOW-14:
  // No closing QR verification.
  // We still load the machine because its serial number
  // is used in the client completion email.
  //--------------------------------------------------

  const { data: machine, error: machineError } = await supabaseAdmin
    .from("machines")
    .select(
      `
        id,
        serial_number
      `,
    )
    .eq("id", payload.machineId)
    .single();

  if (machineError || !machine) {
    return jsonResponse(
      {
        error: "Assigned machine could not be found.",
      },
      404,
    );
  }

  //--------------------------------------------------
  // Load client
  //--------------------------------------------------

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select(
      `
        id,
        name,
        service_email
      `,
    )
    .eq("id", payload.clientId)
    .single();

  if (clientError || !client) {
    return jsonResponse(
      {
        error: "Client could not be found.",
      },
      404,
    );
  }

  //--------------------------------------------------
  // FLOW-20:
  // Verify required client / manager signature
  //--------------------------------------------------

  const { data: serviceSignature, error: signatureError } = await supabaseAdmin
    .from("service_visit_signatures")
    .select(
      `
        id,
        source_visit_id,
        stop_id,
        client_id,
        machine_id,
        signed_by,
        storage_path,
        signed_at
      `,
    )
    .eq("source_visit_id", payload.sourceVisitId)
    .maybeSingle();

  if (signatureError) {
    console.error("Unable to verify service signature:", signatureError);

    return jsonResponse(
      {
        error: "Unable to verify the client signature.",
      },
      500,
    );
  }

  if (!serviceSignature) {
    return jsonResponse(
      {
        error: "Client signature is required before completing service.",
      },
      400,
    );
  }

  if (
    serviceSignature.stop_id !== payload.stopId ||
    serviceSignature.client_id !== payload.clientId ||
    serviceSignature.machine_id !== payload.machineId ||
    serviceSignature.signed_by !== user.id
  ) {
    return jsonResponse(
      {
        error: "The client signature does not match this service visit.",
      },
      403,
    );
  }

  if (!serviceSignature.storage_path?.trim()) {
    return jsonResponse(
      {
        error: "The client signature has not been stored successfully.",
      },
      400,
    );
  }

  const signedAt = Date.parse(serviceSignature.signed_at);

  const completedAt = Date.parse(payload.completedAt);

  if (
    Number.isNaN(signedAt) ||
    Number.isNaN(completedAt) ||
    signedAt > completedAt
  ) {
    return jsonResponse(
      {
        error: "The client signature timestamp is invalid.",
      },
      400,
    );
  }

  //--------------------------------------------------
  // Idempotent summary upsert
  //--------------------------------------------------

  const { data: summary, error: summaryError } = await supabaseAdmin
    .from("service_visit_summaries")
    .upsert(
      {
        source_visit_id: payload.sourceVisitId,

        stop_id: payload.stopId,

        client_id: payload.clientId,

        machine_id: payload.machineId,

        completed_by: payload.completedBy,

        completed_at: payload.completedAt,

        summary: {
          ...payload.visitSummary,

          clientConfirmation: {
            signatureId: serviceSignature.id,
            storagePath: serviceSignature.storage_path,
            signedAt: serviceSignature.signed_at,
            confirmedAt: serviceSignature.signed_at,
          },
        },

        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "source_visit_id",
      },
    )
    .select(
      `
        id,
        survey_token,
        notification_status,
        email_sent_at
      `,
    )
    .single();

  if (summaryError || !summary) {
    console.error("Unable to save service summary:", summaryError);

    return jsonResponse(
      {
        error: "Unable to save service summary.",
        details: summaryError?.message ?? null,
        code: summaryError?.code ?? null,
      },
      500,
    );
  }

  //--------------------------------------------------
  // Complete stop idempotently
  //--------------------------------------------------

  const { error: stopUpdateError } = await supabaseAdmin
    .from("stops")
    .update({
      status: "completed",
      completed_at: payload.completedAt,
    })
    .eq("id", payload.stopId);

  if (stopUpdateError) {
    console.error("Unable to mark stop completed:", stopUpdateError);

    return jsonResponse(
      {
        error: "Unable to mark stop completed.",
        details: stopUpdateError.message,
        code: stopUpdateError.code,
      },
      500,
    );
  }

  //--------------------------------------------------
  // Don't send duplicate email
  //--------------------------------------------------

  if (summary.notification_status === "sent" && summary.email_sent_at) {
    return jsonResponse({
      summaryId: summary.id,
      surveyToken: summary.survey_token,

      notificationStatus: "sent",

      emailSentAt: summary.email_sent_at,
    });
  }

  //--------------------------------------------------
  // Client may not have notification email
  //--------------------------------------------------

  if (!client.service_email) {
    await supabaseAdmin
      .from("service_visit_summaries")
      .update({
        notification_status: "skipped",

        notification_error: "Client has no service email configured.",

        updated_at: new Date().toISOString(),
      })
      .eq("id", summary.id);

    return jsonResponse({
      summaryId: summary.id,

      surveyToken: summary.survey_token,

      notificationStatus: "skipped",

      emailSentAt: null,
    });
  }

  //--------------------------------------------------
  // Get service photos
  //--------------------------------------------------

  const { data: photos, error: photosError } = await supabaseAdmin
    .from("service_visit_photos")
    .select(
      `
        stage,
        kind,
        storage_path
      `,
    )
    .eq("source_visit_id", payload.sourceVisitId);

  if (photosError) {
    console.error("Unable to load service photos:", photosError.message);
  }

  const photoLinks = await Promise.all(
    (photos ?? []).map(
      async (photo: { stage: string; kind: string; storage_path: string }) => ({
        stage: photo.stage,
        kind: photo.kind,

        url: await createPhotoSignedUrl(photo.storage_path),
      }),
    ),
  );

  const beforePhotos = photoLinks.filter(
    (photo: { stage: string }) => photo.stage === "before",
  );

  const afterPhotos = photoLinks.filter(
    (photo: { stage: string }) => photo.stage === "after",
  );

  //--------------------------------------------------
  // Survey URL
  //--------------------------------------------------

  const surveyUrl = WEB_APP_URL
    ? `${WEB_APP_URL}/survey/${summary.survey_token}`
    : null;

  //--------------------------------------------------
  // Email
  //--------------------------------------------------

  if (!RESEND_API_KEY) {
    await supabaseAdmin
      .from("service_visit_summaries")
      .update({
        notification_status: "failed",

        notification_error: "RESEND_API_KEY is not configured.",

        updated_at: new Date().toISOString(),
      })
      .eq("id", summary.id);

    return jsonResponse({
      summaryId: summary.id,

      surveyToken: summary.survey_token,

      notificationStatus: "failed",

      emailSentAt: null,
    });
  }

  const inventorySummaryHtml =
    createInventorySummaryHtml(payload.visitSummary);

  const photoHtml = [
    ...beforePhotos.map((photo: { kind?: string; url?: string | null }) =>
      photo.url
        ? `<p><a href="${photo.url}">Before photo — ${photo.kind}</a></p>`
        : "",
    ),

    ...afterPhotos.map((photo: { url?: string | null }) =>
      photo.url ? `<p><a href="${photo.url}">After-service photo</a></p>` : "",
    ),
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",

    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,

      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      from: SERVICE_EMAIL_FROM,

      to: [client.service_email],

      subject: `Service completed — ${client.name}`,

      html: `
          <h1>Service completed</h1>

          <p>
            Service for ${client.name}
            was completed successfully.
          </p>

          <p>
            Machine serial:
            ${machine.serial_number ?? "N/A"}
          </p>

          <p>
            Completed:
            ${payload.completedAt}
          </p>

          ${inventorySummaryHtml}

          ${photoHtml}

          ${
            surveyUrl
              ? `
                <p>
                  <a href="${surveyUrl}">
                    Rate this service from 1–5 stars
                  </a>
                </p>
              `
              : ""
          }
        `,
    }),
  });

  if (!response.ok) {
    const failure = await response.text();

    await supabaseAdmin
      .from("service_visit_summaries")
      .update({
        notification_status: "failed",

        notification_error: failure,

        updated_at: new Date().toISOString(),
      })
      .eq("id", summary.id);

    return jsonResponse({
      summaryId: summary.id,

      surveyToken: summary.survey_token,

      notificationStatus: "failed",

      emailSentAt: null,
    });
  }

  const emailSentAt = new Date().toISOString();

  await supabaseAdmin
    .from("service_visit_summaries")
    .update({
      notification_status: "sent",

      notification_error: null,

      email_sent_at: emailSentAt,

      updated_at: emailSentAt,
    })
    .eq("id", summary.id);

  return jsonResponse({
    summaryId: summary.id,

    surveyToken: summary.survey_token,

    notificationStatus: "sent",

    emailSentAt,
  });
});
