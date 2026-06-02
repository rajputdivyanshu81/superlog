import { type AgentRun, type Issue, type IssueSample, db, schema } from "@superlog/db";
import { desc, eq, inArray } from "drizzle-orm";
import { type IncidentSummary, toIncidentSummary } from "./search.js";

export type IssueContext = {
  id: string;
  kind: string;
  service: string | null;
  exceptionType: string;
  title: string;
  message: string | null;
  topFrame: string | null;
  fingerprint: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  /**
   * The representative log/trace shape captured for this issue: trace_id /
   * span_id, stacktrace, and span/log/resource attributes. This is the inline
   * "issue context" — the agent can read it directly, then walk to live
   * telemetry with query_traces / query_logs using the trace_id.
   */
  sample: IssueSample | null;
};

/** Compact, agent-friendly projection of an issue plus its stored telemetry sample. */
export function toIssueContext(issue: Issue): IssueContext {
  return {
    id: issue.id,
    kind: issue.kind,
    service: issue.service,
    exceptionType: issue.exceptionType,
    title: issue.title,
    message: issue.message,
    topFrame: issue.topFrame,
    fingerprint: issue.fingerprint,
    eventCount: issue.eventCount,
    firstSeen: issue.firstSeen.toISOString(),
    lastSeen: issue.lastSeen.toISOString(),
    sample: issue.lastSample ?? null,
  };
}

export type AgentRunPointer = {
  id: string;
  state: string;
  runtime: string;
  selectedRepoFullName: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

function toAgentRunPointer(run: AgentRun): AgentRunPointer {
  return {
    id: run.id,
    state: run.state,
    runtime: run.runtime,
    selectedRepoFullName: run.selectedRepoFullName,
    failureReason: run.failureReason,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
  };
}

export type IncidentDetail = {
  incident: IncidentSummary;
  issues: IssueContext[];
  latestAgentRun: AgentRunPointer | null;
};

/**
 * Load an incident by its (global) id and assemble the full detail an agent
 * needs to answer "what's going on in this incident": the incident summary
 * (with project_id for follow-up telemetry queries), every linked issue with
 * its stored log/trace sample, and a pointer to the latest investigation.
 *
 * Returns null when the incident does not exist. Access control is the
 * caller's responsibility — resolve `incident.projectId` against the session.
 */
export async function getIncidentDetail(incidentId: string): Promise<IncidentDetail | null> {
  const incident = await db.query.incidents.findFirst({
    where: eq(schema.incidents.id, incidentId),
  });
  if (!incident) return null;

  const [links, agentRuns] = await Promise.all([
    db.query.incidentIssues.findMany({
      where: eq(schema.incidentIssues.incidentId, incident.id),
      orderBy: [desc(schema.incidentIssues.createdAt)],
    }),
    db.query.agentRuns.findMany({
      where: eq(schema.agentRuns.incidentId, incident.id),
      orderBy: [desc(schema.agentRuns.createdAt)],
      limit: 1,
    }),
  ]);

  const issues =
    links.length > 0
      ? await db.query.issues.findMany({
          where: inArray(
            schema.issues.id,
            links.map((link) => link.issueId),
          ),
          orderBy: [desc(schema.issues.lastSeen)],
        })
      : [];

  return {
    incident: toIncidentSummary(incident),
    issues: issues.map(toIssueContext),
    latestAgentRun: agentRuns[0] ? toAgentRunPointer(agentRuns[0]) : null,
  };
}
