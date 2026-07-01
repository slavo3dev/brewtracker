export type UserActionResult = {
  error: string | null;
  success: string | null;
};

export const initialUserActionState: UserActionResult = {
  error: null,
  success: null,
};
