import { z } from "zod";
import type { InjectedConfig } from "@app/lib/injected-config";

const SelectionStateSchema = z.object({
  assistantSelection: z.object({
    id: z.string().min(1),
    apiBaseUrl: z.string(),
    organizationId: z.string().optional(),
  }),
});
type HostConfig = Pick<InjectedConfig, "cloudUrl" | "organizationId">;

export function assistantSelectionState(id: string, config: HostConfig) {
  return {
    assistantSelection: {
      id,
      apiBaseUrl: config.cloudUrl ?? "/",
      organizationId: config.organizationId,
    },
  };
}

export function selectedAssistantId(
  state: unknown,
  config: HostConfig,
): string | undefined {
  const parsed = SelectionStateSchema.safeParse(state);
  if (!parsed.success) {
    return undefined;
  }
  const selection = parsed.data.assistantSelection;
  return selection.apiBaseUrl === (config.cloudUrl ?? "/") &&
    selection.organizationId === config.organizationId
    ? selection.id
    : undefined;
}
