import { useState } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { CreateAssistantDialog } from "@app/components/create-assistant-dialog";
import { RouteErrorBoundary } from "@app/components/route-error-boundary";
import { RootHydrateFallback } from "@app/components/root-hydrate-fallback";
import { useCadetCommands } from "@app/runtime/cadet-commands";
import { accountRoute } from "@app/domains/account/account-route";
import { AssistantPage } from "@app/shell/assistant-page";

function DesktopChrome() {
  const [createOpen, setCreateOpen] = useState(false);
  useCadetCommands({ createAssistant: () => setCreateOpen(true) });
  return (
    <>
      <CreateAssistantDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter(
  [
    {
      Component: DesktopChrome,
      ErrorBoundary: RouteErrorBoundary,
      HydrateFallback: RootHydrateFallback,
      children: [
        accountRoute,
        { path: "/", Component: () => <Navigate to="/assistant" replace /> },
        { path: "/assistant/*", Component: AssistantPage },
        {
          path: "/logout",
          lazy: {
            Component: () =>
              import("@app/domains/account/pages/logout-page").then(
                (m) => m.LogoutPage,
              ),
          },
        },
      ],
    },
  ],
  { future: { v8_middleware: true } },
);
