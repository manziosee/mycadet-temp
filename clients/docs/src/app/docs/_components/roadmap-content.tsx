import { DocsContent } from "@/app/docs/_components/docs-content";
import { SectionHeading } from "@/app/docs/_components/section-heading";
import { TableOfContents } from "@/app/docs/_components/table-of-contents";
import {
  readRoadmapFlow,
  RoadmapFlowView,
} from "@/app/docs/_components/roadmap-flow";

export function RoadmapContent() {
  const flow = readRoadmapFlow();
  const tocItems = [
    { id: "the-plan", label: "The plan", level: 2 as const },
    ...flow.steps.map((step) => ({
      id: step.id,
      label: step.title,
      level: 2 as const,
    })),
  ];

  return (
    <>
      <DocsContent title="Roadmap" breadcrumb="Docs / Roadmap">
        {/* TODO: This is all content I would've expected in roadmap.md */}
        <p className="mb-2 text-xs text-stone-400 dark:text-stone-500">
          Last updated November 25, 2026{" "}
          {/** TODO: Feels like this should be automatic based on last committed date */}
        </p>
        <p className="mb-8 text-stone-600 dark:text-stone-400">
          This roadmap is the bridge between today&apos;s{" "}
          <a
            href="/docs/architecture"
            className="text-stone-900 underline dark:text-stone-100"
          >
            architecture
          </a>{" "}
          and achieving the Cadet{" "}
          <a
            href="/docs/vision"
            className="text-stone-900 underline dark:text-stone-100"
          >
            Vision.
          </a>{" "}
        </p>

        <section id="the-plan">
          <SectionHeading id="the-plan" level={2}>
            The plan
          </SectionHeading>
          <RoadmapFlowView />
        </section>
      </DocsContent>
      <TableOfContents items={tocItems} />
    </>
  );
}
