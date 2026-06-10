// Placeholder until FOUND-2 (database schema) is built.
//
// Once your Supabase schema exists, regenerate this file with:
//   npx supabase gen types typescript --project-id <your-project-id> > packages/types/src/database.ts
//
// Then update the export below to point at the generated file.

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
