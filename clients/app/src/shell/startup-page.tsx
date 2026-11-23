import { Navigate } from "react-router";
import { useAssistantRequest } from "@app/assistant/use-assistant-request";
import { assistantSelectionState } from "@app/assistant/assistant-selection";
import { RootHydrateFallback } from "@app/components/root-hydrate-fallback";
import { WelcomeScreen } from "@app/domains/onboarding/pages/welcome-screen";
import { routes } from "@app/utils/routes";

/** Resume the host's saved assistant; welcome is only for an empty host. */
export function StartupPage() {
  const { state } = useAssistantRequest({});
  if (state.status === "loading") return <RootHydrateFallback />;
  if (state.status === "empty") return <WelcomeScreen />;
  if (state.status === "selection") {
    return <Navigate to={routes.account.selectAssistant} replace />;
  }
  if (state.status === "unauthenticated") {
    return <Navigate to={routes.account.pair} replace />;
  }
  return (
    <Navigate
      to={routes.assistant}
      replace
      state={
        state.status === "ready"
          ? assistantSelectionState(state.assistant.id)
          : undefined
      }
    />
  );
}
