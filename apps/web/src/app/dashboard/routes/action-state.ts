export type RouteActionResult = {
  error: string | null;
  success: string | null;
};

export const initialRouteActionState: RouteActionResult = {
  error: null,
  success: null,
};
