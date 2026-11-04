// Single source of truth for the left nav and the routes.
// Every node has a path; nodes with `children` render as expandable groups.
// `summary` is optional and shown where a page lists its sub-pages.
// Nesting is unbounded — add children at any depth.
export const navTree = [
  { id: 'overview', title: 'Overview', path: '/overview' },
  {
    id: 'technical-design',
    title: 'Technical Design',
    path: '/technical-design',
    children: [
      {
        id: 'requirements',
        title: 'Requirements',
        path: '/technical-design/requirements',
        children: [
          {
            id: 'functional',
            title: 'Functional',
            path: '/technical-design/requirements/functional',
            children: [
              {
                id: 'status-lookup',
                title: 'Refund Status Lookup',
                path: '/technical-design/requirements/functional/status-lookup',
                children: [
                  { id: 'identity', title: 'Identity Verification', path: '/technical-design/requirements/functional/status-lookup/identity' },
                  { id: 'status-states', title: 'Status States', path: '/technical-design/requirements/functional/status-lookup/states' },
                ],
              },
              { id: 'notifications', title: 'Notifications', path: '/technical-design/requirements/functional/notifications' },
            ],
          },
          {
            id: 'non-functional',
            title: 'Non-Functional',
            path: '/technical-design/requirements/non-functional',
            children: [
              { id: 'availability', title: 'Availability & Latency', path: '/technical-design/requirements/non-functional/availability' },
              { id: 'capacity', title: 'Capacity Estimates', path: '/technical-design/requirements/non-functional/capacity' },
              { id: 'security-requirements', title: 'Security', path: '/technical-design/requirements/non-functional/security' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    path: '/architecture',
    children: [
      { id: 'high-level', title: 'High-Level Design', path: '/architecture/high-level' },
      {
        id: 'components',
        title: 'Components',
        path: '/architecture/components',
        children: [
          { id: 'gateway', title: 'API Gateway', path: '/architecture/components/gateway' },
          {
            id: 'status-service',
            title: 'Status Service',
            path: '/architecture/components/status-service',
            children: [
              { id: 'data-model', title: 'Data Model', path: '/architecture/components/status-service/data-model' },
              { id: 'caching', title: 'Caching', path: '/architecture/components/status-service/caching' },
            ],
          },
          { id: 'notification-service', title: 'Notification Service', path: '/architecture/components/notification-service' },
        ],
      },
      {
        id: 'batch-sync',
        title: 'Batch Status Sync',
        path: '/architecture/batch-sync',
        children: [
          {
            id: 'batch-scheduling',
            title: 'Scheduling',
            path: '/architecture/batch-sync/scheduling',
            summary: 'When runs happen, and when each return is due to be checked again.',
          },
          {
            id: 'batch-sharding',
            title: 'Sharding & Scale',
            path: '/architecture/batch-sync/sharding',
            summary: 'Splitting a run across workers, and sizing it for 40 million customers.',
          },
          {
            id: 'batch-agencies',
            title: 'Agency Integration',
            path: '/architecture/batch-sync/agencies',
            summary: 'Bulk status calls, credentials, rate limits, and retries.',
          },
          {
            id: 'batch-failures',
            title: 'Failure Handling',
            path: '/architecture/batch-sync/failures',
            summary: 'What happens when a chunk, a run, or a whole agency fails.',
          },
        ],
      },
      { id: 'prediction', title: 'Refund Time Prediction', path: '/architecture/prediction' },
      { id: 'apis', title: 'API Design', path: '/architecture/apis' },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    path: '/security',
    children: [
      {
        id: 'threat-model',
        title: 'Threat Model',
        path: '/security/threat-model',
        children: [
          { id: 'threat-actors', title: 'Threat Actors', path: '/security/threat-model/actors' },
          {
            id: 'attack-surfaces',
            title: 'Attack Surfaces',
            path: '/security/threat-model/attack-surfaces',
            children: [
              { id: 'enumeration', title: 'Enumeration & Credential Stuffing', path: '/security/threat-model/attack-surfaces/enumeration' },
              { id: 'bots', title: 'Bots & Automated Abuse', path: '/security/threat-model/attack-surfaces/bots' },
              { id: 'insider', title: 'Insider Access', path: '/security/threat-model/attack-surfaces/insider' },
            ],
          },
        ],
      },
      {
        id: 'identity-access',
        title: 'Identity & Access',
        path: '/security/identity-access',
        children: [
          { id: 'taxpayer-verification', title: 'Taxpayer Identity', path: '/security/identity-access/taxpayer' },
          { id: 'support-agents', title: 'Support Agents', path: '/security/identity-access/agents' },
          { id: 'preparers', title: 'Preparers', path: '/security/identity-access/preparers' },
        ],
      },
      { id: 'service-auth', title: 'Service-to-Service Auth', path: '/security/service-auth' },
      {
        id: 'data-protection',
        title: 'Data Protection',
        path: '/security/data-protection',
        children: [
          { id: 'encryption', title: 'Encryption & Key Management', path: '/security/data-protection/encryption' },
          { id: 'minimization', title: 'Minimization & Retention', path: '/security/data-protection/minimization' },
        ],
      },
      {
        id: 'abuse-prevention',
        title: 'Abuse Prevention',
        path: '/security/abuse-prevention',
        children: [
          { id: 'rate-limiting', title: 'Rate Limiting & Lockout', path: '/security/abuse-prevention/rate-limiting' },
          { id: 'bot-defense', title: 'Bot Defense', path: '/security/abuse-prevention/bot-defense' },
        ],
      },
      { id: 'security-monitoring', title: 'Security Monitoring', path: '/security/monitoring' },
      { id: 'audit-response', title: 'Audit & Incident Response', path: '/security/audit-response' },
      { id: 'compliance', title: 'Privacy & Compliance', path: '/security/compliance' },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    path: '/operations',
    children: [
      { id: 'tracing', title: 'Distributed Tracing', path: '/operations/tracing' },
      { id: 'monitoring', title: 'Monitoring & Alerting', path: '/operations/monitoring' },
      {
        id: 'peak-season',
        title: 'Peak Season Readiness',
        path: '/operations/peak-season',
        children: [
          { id: 'extension-deadline', title: 'Extension Deadline', path: '/operations/peak-season/extension-deadline' },
        ],
      },
    ],
  },
  {
    id: 'demo',
    title: 'Demo',
    path: '/demo',
    children: [
      {
        id: 'local-kubernetes',
        title: 'Local Kubernetes',
        path: '/demo/local-kubernetes',
        children: [
          {
            id: 'k8s-setup',
            title: 'Setup',
            path: '/demo/local-kubernetes/setup',
            summary: 'Install the tools, turn on Kubernetes in Docker Desktop, and get the code.',
          },
          {
            id: 'k8s-deploy',
            title: 'Deploy & Access',
            path: '/demo/local-kubernetes/deploy',
            summary: 'What make k8s-deploy does, and how to reach the portal.',
          },
          {
            id: 'k8s-workflow',
            title: 'Try the Workflow',
            path: '/demo/local-kubernetes/workflow',
            summary: 'Sign in, file both returns, watch statuses, and trigger fraud screening.',
          },
          {
            id: 'k8s-operate',
            title: 'Operate & Configure',
            path: '/demo/local-kubernetes/operate',
            summary: 'What is running, batch runs, Jaeger, logs, and changing settings.',
          },
          {
            id: 'k8s-other-clusters',
            title: 'Other Clusters',
            path: '/demo/local-kubernetes/other-clusters',
            summary: 'Run on kind or minikube instead of Docker Desktop.',
          },
          {
            id: 'k8s-troubleshooting',
            title: 'Troubleshooting',
            path: '/demo/local-kubernetes/troubleshooting',
            summary: 'Fixes for image, scheduling, port, and sign-in problems.',
          },
          {
            id: 'k8s-cleanup',
            title: 'Clean Up',
            path: '/demo/local-kubernetes/cleanup',
            summary: 'Remove the deployment, its data, and old images.',
          },
        ],
      },
      { id: 'admin-console', title: 'Admin Console', path: '/demo/admin-console' },
      {
        id: 'local-development',
        title: 'Local Development',
        path: '/demo/local-development',
        children: [
          {
            id: 'dev-setup',
            title: 'Setup',
            path: '/demo/local-development/setup',
            summary: 'Install Go, Node, and Docker, then install dependencies.',
          },
          {
            id: 'dev-run',
            title: 'Run Dev Mode',
            path: '/demo/local-development/run',
            summary: 'Run Postgres, Jaeger, the Go backend, and the portal, together or separately.',
          },
          {
            id: 'dev-debugging',
            title: 'Debugging',
            path: '/demo/local-development/debugging',
            summary: 'Step through the backend in VS Code or GoLand.',
          },
          {
            id: 'dev-testing',
            title: 'Testing',
            path: '/demo/local-development/testing',
            summary: 'Unit tests and the end-to-end smoke test.',
          },
          {
            id: 'dev-integration',
            title: 'Integration Mode',
            path: '/demo/local-development/integration',
            summary: 'Run the same containers Kubernetes uses, in Docker Compose.',
          },
          {
            id: 'dev-database',
            title: 'Database',
            path: '/demo/local-development/database',
            summary: 'Connect with psql, inspect batch runs and the pgvector duplicate check.',
          },
          {
            id: 'dev-changes',
            title: 'Common Changes',
            path: '/demo/local-development/changes',
            summary: 'Schema migrations, demo users, tax math, and resetting data.',
          },
          {
            id: 'dev-configuration',
            title: 'Configuration',
            path: '/demo/local-development/configuration',
            summary: 'Environment variables you are likely to change.',
          },
          {
            id: 'dev-troubleshooting',
            title: 'Troubleshooting',
            path: '/demo/local-development/troubleshooting',
            summary: 'Fixes for port conflicts and a backend that is not reachable.',
          },
        ],
      },
    ],
  },
]

// Flatten the tree into [{ node, ancestors }] for routing and breadcrumbs.
export function flatten(nodes = navTree, ancestors = []) {
  return nodes.flatMap((node) => [
    { node, ancestors },
    ...(node.children ? flatten(node.children, [...ancestors, node]) : []),
  ])
}
