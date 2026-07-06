import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Do NOT swallow server-function RPC errors into an HTML page — the
    // client can't parse HTML as a serialized error and the user gets a
    // useless generic message. Let them propagate so the real message
    // reaches the caller.
    try {
      const req = getRequest();
      if (req?.url && new URL(req.url).pathname.startsWith("/_serverFn/")) {
        throw error;
      }
    } catch { /* fall through to HTML fallback */ }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
