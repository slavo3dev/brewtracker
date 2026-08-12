import { createClient } from "@supabase/supabase-js";

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

  closingVerification: {
    scannedValue: string;
    expectedQrCode: string;
    machineId: string;
    verifiedAt: string;
  };

  visitSummary: Record<string, unknown>;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,

    headers: {
      "Content-Type": "application/json",
    },
  });
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

Deno.serve(async (request) => {
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
    !payload.stopId ||
    !payload.clientId ||
    !payload.machineId
  ) {
    return jsonResponse(
      {
        error: "Missing completion data.",
      },
      400,
    );
  }

  //--------------------------------------------------
  // Verify stop belongs to driver + machine/client
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
  // Verify machine QR server-side too
  //--------------------------------------------------

  const { data: machine, error: machineError } = await supabaseAdmin
    .from("machines")
    .select(
      `
      id,
      qr_code,
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

  if (payload.closingVerification.scannedValue !== machine.qr_code) {
    return jsonResponse(
      {
        error: "Closing QR verification failed.",
      },
      400,
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

        closing_scanned_value: payload.closingVerification.scannedValue,

        closing_verified_at: payload.closingVerification.verifiedAt,

        completed_at: payload.completedAt,

        summary: payload.visitSummary,

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
    console.error(summaryError);

    return jsonResponse(
      {
        error: "Unable to save service summary.",
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
    return jsonResponse(
      {
        error: "Unable to mark stop completed.",
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
  // Client may not yet have notification email
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
  // Get photos
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
    console.error(photosError.message);
  }

  const photoLinks = await Promise.all(
    (photos ?? []).map(async (photo) => ({
      stage: photo.stage,

      kind: photo.kind,

      url: await createPhotoSignedUrl(photo.storage_path),
    })),
  );

  const beforePhotos = photoLinks.filter((photo) => photo.stage === "before");

  const afterPhotos = photoLinks.filter((photo) => photo.stage === "after");

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

  const photoHtml = [
    ...beforePhotos.map((photo) =>
      photo.url
        ? `<p><a href="${photo.url}">Before photo — ${photo.kind}</a></p>`
        : "",
    ),

    ...afterPhotos.map((photo) =>
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
