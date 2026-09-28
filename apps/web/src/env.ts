import { WebEnvironmentSchema } from "@new/shared";

const result = WebEnvironmentSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
});

if (!result.success) {
  const fields = result.error.issues.map((issue) =>
    issue.path.map(String).join(".")
  );

  throw new Error(`INVALID_WEB_ENV: ${fields.join(", ")}`);
}

export const apiUrl = result.data.NEXT_PUBLIC_API_URL;
