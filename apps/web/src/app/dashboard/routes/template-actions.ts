"use server";

import { revalidatePath } from "next/cache";

import { requireRouteManager } from "@/lib/auth/require-route-manager";
import {
  addRouteTemplateStop,
  createRouteTemplate,
  deleteRouteTemplate,
  deleteRouteTemplateStop,
  setRouteTemplateActive,
  updateRouteTemplate,
} from "@/lib/routes/route-template-service";

import type { RouteActionResult } from "./action-state";

const ROUTES_PATH = "/dashboard/routes";
const ROUTE_TEMPLATES_PATH =
  "/dashboard/routes/templates";

function getRequiredText(
  formData: FormData,
  name: string,
): string {
  return String(formData.get(name) ?? "").trim();
}

function getOptionalText(
  formData: FormData,
  name: string,
): string | null {
  const value = getRequiredText(formData, name);

  return value || null;
}

function getCheckbox(
  formData: FormData,
  name: string,
): boolean {
  return formData.get(name) === "on";
}

function revalidateRoutePages(): void {
  revalidatePath(ROUTES_PATH);
  revalidatePath(ROUTE_TEMPLATES_PATH);
}

export async function createRouteTemplateAction(
  _previousState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  const profile = await requireRouteManager();

  const name = getRequiredText(
    formData,
    "name",
  );

  const driverId = getRequiredText(
    formData,
    "driverId",
  );

  const warehouseId = getRequiredText(
    formData,
    "warehouseId",
  );

  if (!name) {
    return {
      error: "Template name is required.",
      success: null,
    };
  }

  if (!driverId) {
    return {
      error: "Select a driver.",
      success: null,
    };
  }

  if (!warehouseId) {
    return {
      error: "Select a warehouse.",
      success: null,
    };
  }

  try {
    await createRouteTemplate({
      name,
      driverId,
      warehouseId,

      monday: getCheckbox(
        formData,
        "monday",
      ),

      tuesday: getCheckbox(
        formData,
        "tuesday",
      ),

      wednesday: getCheckbox(
        formData,
        "wednesday",
      ),

      thursday: getCheckbox(
        formData,
        "thursday",
      ),

      friday: getCheckbox(
        formData,
        "friday",
      ),

      saturday: getCheckbox(
        formData,
        "saturday",
      ),

      sunday: getCheckbox(
        formData,
        "sunday",
      ),

      notes: getOptionalText(
        formData,
        "notes",
      ),

      createdBy: profile.id,
    });

    revalidateRoutePages();

    return {
      error: null,
      success:
        "Route template created. Add at least one stop before activating it.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to create route template.",

      success: null,
    };
  }
}

export async function updateRouteTemplateAction(
  _previousState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const id = getRequiredText(
    formData,
    "templateId",
  );

  const name = getRequiredText(
    formData,
    "name",
  );

  const driverId = getRequiredText(
    formData,
    "driverId",
  );

  const warehouseId = getRequiredText(
    formData,
    "warehouseId",
  );

  if (!id) {
    return {
      error: "Route template is required.",
      success: null,
    };
  }

  if (!name) {
    return {
      error: "Template name is required.",
      success: null,
    };
  }

  if (!driverId) {
    return {
      error: "Select a driver.",
      success: null,
    };
  }

  if (!warehouseId) {
    return {
      error: "Select a warehouse.",
      success: null,
    };
  }

  try {
    await updateRouteTemplate({
      id,
      name,
      driverId,
      warehouseId,

      monday: getCheckbox(
        formData,
        "monday",
      ),

      tuesday: getCheckbox(
        formData,
        "tuesday",
      ),

      wednesday: getCheckbox(
        formData,
        "wednesday",
      ),

      thursday: getCheckbox(
        formData,
        "thursday",
      ),

      friday: getCheckbox(
        formData,
        "friday",
      ),

      saturday: getCheckbox(
        formData,
        "saturday",
      ),

      sunday: getCheckbox(
        formData,
        "sunday",
      ),

      notes: getOptionalText(
        formData,
        "notes",
      ),
    });

    revalidateRoutePages();

    return {
      error: null,
      success: "Route template updated.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update route template.",

      success: null,
    };
  }
}

export async function addRouteTemplateStopAction(
  _previousState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const routeTemplateId = getRequiredText(
    formData,
    "templateId",
  );

  const clientId = getRequiredText(
    formData,
    "clientId",
  );

  const machineId = getOptionalText(
    formData,
    "machineId",
  );

  if (!routeTemplateId) {
    return {
      error: "Route template is required.",
      success: null,
    };
  }

  if (!clientId) {
    return {
      error: "Select a client.",
      success: null,
    };
  }

  try {
    await addRouteTemplateStop({
      routeTemplateId,
      clientId,
      machineId,

      scheduledStartTime:
        getOptionalText(
          formData,
          "scheduledStartTime",
        ),

      scheduledEndTime:
        getOptionalText(
          formData,
          "scheduledEndTime",
        ),

      drinkCountRequired:
        getCheckbox(
          formData,
          "drinkCountRequired",
        ),

      notes: getOptionalText(
        formData,
        "notes",
      ),
    });

    revalidateRoutePages();

    return {
      error: null,
      success: "Stop added to route template.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to add route template stop.",

      success: null,
    };
  }
}

export async function deleteRouteTemplateStopAction(
  _previousState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const stopId = getRequiredText(
    formData,
    "stopId",
  );

  if (!stopId) {
    return {
      error: "Route template stop is required.",
      success: null,
    };
  }

  try {
    await deleteRouteTemplateStop(
      stopId,
    );

    revalidateRoutePages();

    return {
      error: null,
      success: "Stop removed from route template.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove route template stop.",

      success: null,
    };
  }
}

export async function setRouteTemplateActiveAction(
  _previousState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const templateId = getRequiredText(
    formData,
    "templateId",
  );

  const isActive =
    getRequiredText(
      formData,
      "isActive",
    ) === "true";

  if (!templateId) {
    return {
      error: "Route template is required.",
      success: null,
    };
  }

  try {
    await setRouteTemplateActive(
      templateId,
      isActive,
    );

    revalidateRoutePages();

    return {
      error: null,
      success: isActive
        ? "Route template activated."
        : "Route template deactivated.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update route template status.",

      success: null,
    };
  }
}

export async function deleteRouteTemplateAction(
  _previousState: RouteActionResult,
  formData: FormData,
): Promise<RouteActionResult> {
  await requireRouteManager();

  const templateId = getRequiredText(
    formData,
    "templateId",
  );

  if (!templateId) {
    return {
      error: "Route template is required.",
      success: null,
    };
  }

  try {
    await deleteRouteTemplate(
      templateId,
    );

    revalidateRoutePages();

    return {
      error: null,
      success: "Route template deleted.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to delete route template.",

      success: null,
    };
  }
}