export type ReviewActionResult = {
  error: string | null;
  success: string | null;
};

export const initialReviewActionState: ReviewActionResult = {
  error: null,
  success: null,
};