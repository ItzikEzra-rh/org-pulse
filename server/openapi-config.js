const swaggerJsdoc = require('swagger-jsdoc');

function createOpenApiSpec() {
  const options = {
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'Org Pulse API',
        version: '1.0.0',
        description:
          'API for the AI Platform Org Pulse application.\n\n' +
          '**Authentication:** Use a Bearer token (`tt_` prefix) for API access — ' +
          'generate one from the web UI at Settings → API Tokens. When using tokens, ' +
          'send requests to the **API server** (first entry in the server list above), ' +
          'not the main application URL which requires browser-based OAuth.\n\n' +
          '**Legacy path aliases:** Many Org Pulse module routes are also accessible at ' +
          'legacy paths (e.g., `/api/roster` forwards to `/api/modules/team-tracker/roster`). ' +
          'These aliases are not documented separately.\n\n' +
          '**Demo mode:** When `DEMO_MODE=true`, all POST refresh endpoints return a ' +
          'stub response and external API calls are disabled.'
      },
      servers: process.env.API_PUBLIC_URL
        ? [
            { url: process.env.API_PUBLIC_URL, description: 'API server' },
            { url: '/', description: 'Application root' }
          ]
        : [{ url: '/', description: 'Application root' }],
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Auth', description: 'Authentication, user info, and API tokens' },
        { name: 'Allowlist', description: 'Email allowlist management (admin)' },
        { name: 'Git-Static Modules', description: 'Git-static module management' },
        { name: 'Built-in Modules', description: 'Built-in module state management' },
        { name: 'Export', description: 'Data export endpoints' },
        { name: 'TT: Roster', description: 'Org Pulse roster and person data' },
        { name: 'TT: Metrics', description: 'Org Pulse Jira metrics' },
        { name: 'TT: GitHub', description: 'Org Pulse GitHub contribution data' },
        { name: 'TT: GitLab', description: 'Org Pulse GitLab contribution data' },
        { name: 'TT: Trends', description: 'Org Pulse trend data' },
        { name: 'TT: Sprints', description: 'Org Pulse sprint and board data' },
        { name: 'TT: Snapshots', description: 'Org Pulse monthly snapshots' },
        { name: 'TT: Admin', description: 'Org Pulse admin configuration' },
        { name: 'OR: Teams', description: 'Org Roster team data' },
        { name: 'OR: People', description: 'Org Roster people data' },
        { name: 'OR: RFE', description: 'Org Roster RFE backlog data' },
        { name: 'OR: Sync', description: 'Org Roster sync operations' },
        { name: 'OR: Config', description: 'Org Roster configuration' }
      ],
      components: {
        securitySchemes: {
          forwardedEmail: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Forwarded-Email',
            description: 'Email address set by the OpenShift OAuth proxy'
          },
          bearerToken: {
            type: 'http',
            scheme: 'bearer',
            description: 'API token (prefix: tt_). Generate at /api-tokens.'
          }
        },
        schemas: {
          ErrorResponse: {
            type: 'object',
            properties: {
              error: { type: 'string', description: 'Error message' }
            },
            example: { error: 'Something went wrong' }
          },
          Person: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              jiraDisplayName: { type: 'string' },
              uid: { type: 'string' },
              email: { type: 'string' },
              title: { type: 'string' },
              manager: { type: 'string', nullable: true },
              githubUsername: { type: 'string', nullable: true },
              gitlabUsername: { type: 'string', nullable: true },
              geo: { type: 'string', nullable: true },
              location: { type: 'string', nullable: true },
              country: { type: 'string', nullable: true },
              city: { type: 'string', nullable: true },
              customFields: { type: 'object' }
            }
          },
          PersonMetrics: {
            type: 'object',
            properties: {
              jiraDisplayName: { type: 'string' },
              jiraAccountId: { type: 'string' },
              fetchedAt: { type: 'string', format: 'date-time' },
              lookbackDays: { type: 'integer' },
              resolved: {
                type: 'object',
                properties: {
                  count: { type: 'integer' },
                  storyPoints: { type: 'integer' },
                  issues: { type: 'array', items: { $ref: '#/components/schemas/JiraIssue' } }
                }
              },
              inProgress: {
                type: 'object',
                properties: {
                  count: { type: 'integer' },
                  storyPoints: { type: 'integer' },
                  issues: { type: 'array', items: { $ref: '#/components/schemas/JiraIssue' } }
                }
              },
              cycleTime: {
                type: 'object',
                properties: {
                  avgDays: { type: 'number', nullable: true },
                  medianDays: { type: 'number', nullable: true }
                }
              }
            }
          },
          JiraIssue: {
            type: 'object',
            properties: {
              key: { type: 'string', example: 'PROJ-1234' },
              summary: { type: 'string' },
              status: { type: 'string' },
              storyPoints: { type: 'integer', nullable: true },
              resolutionDate: { type: 'string', nullable: true },
              cycleTimeDays: { type: 'number', nullable: true }
            }
          },
          TeamMetrics: {
            type: 'object',
            properties: {
              teamKey: { type: 'string' },
              displayName: { type: 'string' },
              memberCount: { type: 'integer' },
              aggregate: {
                type: 'object',
                properties: {
                  resolvedCount: { type: 'integer' },
                  resolvedPoints: { type: 'integer' },
                  inProgressCount: { type: 'integer' },
                  avgCycleTimeDays: { type: 'number', nullable: true }
                }
              },
              members: { type: 'array', items: { type: 'object' } },
              resolvedIssues: { type: 'array', items: { $ref: '#/components/schemas/JiraIssue' } }
            }
          },
          RosterResponse: {
            type: 'object',
            properties: {
              vp: { type: 'string', nullable: true },
              orgs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    displayName: { type: 'string' },
                    leader: { type: 'object' },
                    teams: { type: 'object' }
                  }
                }
              },
              visibleFields: { type: 'array', items: { type: 'object' } },
              primaryDisplayField: { type: 'string', nullable: true },
              managerNames: {
                type: 'object',
                additionalProperties: { type: 'string' },
                description: 'UID-to-display-name lookup for referenced managers, used for manager rendering'
              }
            }
          },
          ProjectPeopleTeamsResponse: {
            type: 'object',
            description: 'Normalized project-qualified People & Teams read model; identity is (projectId, accountId) and (projectId, teamId).',
            properties: {
              projectId: { type: 'string' },
              availability: { type: 'string', enum: ['available', 'empty', 'unavailable'] },
              reason: { type: 'string', nullable: true },
              publicationState: { type: 'string', nullable: true },
              generatedAt: { type: 'string', nullable: true, format: 'date-time' },
              teams: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    projectId: { type: 'string' },
                    id: { type: 'string' },
                    displayName: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    state: { type: 'string', nullable: true },
                    teamType: { type: 'string', nullable: true },
                    memberAccountIds: { type: 'array', items: { type: 'string' } }
                  }
                }
              },
              people: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    projectId: { type: 'string' },
                    accountId: { type: 'string' },
                    displayName: { type: 'string' },
                    active: { type: 'boolean' },
                    email: { type: 'string', nullable: true },
                    teamIds: { type: 'array', items: { type: 'string' } },
                    title: { type: 'string', nullable: true },
                    manager: { type: 'object', nullable: true, description: 'Always null; kept for response compatibility with the pre-enrichment contract. See managerRef.' },
                    geo: { type: 'string', nullable: true },
                    identities: {
                      type: 'object',
                      description: 'Populated from roster-enrichment when a matched join exists; {} otherwise',
                      properties: {
                        github: { type: 'object', nullable: true, properties: { username: { type: 'string' }, source: { type: 'string' } } },
                        gitlab: { type: 'object', nullable: true, properties: { username: { type: 'string' }, source: { type: 'string' } } }
                      }
                    },
                    managerRef: {
                      type: 'object',
                      nullable: true,
                      description: 'Typed, opaque passthrough from roster-enrichment; not resolved, not RBAC input',
                      properties: {
                        kind: { type: 'string', enum: ['roster', 'external', 'unresolved'] },
                        accountId: { type: 'string' },
                        ldapUid: { type: 'string' },
                        reason: { type: 'string' }
                      }
                    }
                  }
                }
              },
              enrichment: {
                type: 'object',
                nullable: true,
                description: 'Present only when a roster-enrichment publication was read for this project',
                properties: {
                  state: { type: 'string', enum: ['fresh', 'stale', 'partial', 'absent'] },
                  partial: { type: 'boolean', description: 'True when the publication is missing records, independent of `state` (e.g. a stale last-known-good republish can also be partial)' },
                  generatedAt: { type: 'string', nullable: true, format: 'date-time' }
                }
              },
              auxiliaryManagers: {
                type: 'object',
                nullable: true,
                description: 'Off-roster managers from roster-enrichment, keyed by ldapUid; present only alongside `enrichment`',
                additionalProperties: { type: 'object' }
              }
            }
          },
          ProjectContributionsResponse: {
            type: 'object',
            description: 'Project-qualified GitHub contributions joined by (projectId, accountId). github=null means unavailable (never zero); gitlab is always null.',
            properties: {
              projectId: { type: 'string' },
              availability: { type: 'string', enum: ['available', 'empty', 'unavailable'] },
              reason: { type: 'string', nullable: true },
              publicationState: { type: 'string', nullable: true },
              freshness: { type: 'string', enum: ['fresh', 'stale', 'unknown'] },
              partial: { type: 'boolean' },
              generatedAt: { type: 'string', nullable: true, format: 'date-time' },
              fetchedAt: { type: 'string', nullable: true, format: 'date-time' },
              metric: { type: 'object', nullable: true },
              people: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    projectId: { type: 'string' },
                    accountId: { type: 'string' },
                    displayName: { type: 'string' },
                    active: { type: 'boolean' },
                    teamIds: { type: 'array', items: { type: 'string' } },
                    github: {
                      type: 'object',
                      nullable: true,
                      description: 'Null when unavailable or the identity is conflicted; never fabricated as zero.',
                      properties: {
                        username: { type: 'string' },
                        totalContributions: { type: 'integer', nullable: true, description: 'Null when unavailable; a genuine zero stays zero.' },
                        months: { type: 'object', additionalProperties: { type: 'integer' } },
                        fetchedAt: { type: 'string', nullable: true, format: 'date-time' }
                      }
                    },
                    gitlab: { type: 'object', nullable: true, description: 'Always null; GitLab is unpublished by this collector.' },
                    contributionStatus: { type: 'string', enum: ['collected', 'carried-forward', 'failed', 'unresolved', 'conflicted'] }
                  }
                }
              },
              diagnostics: { type: 'object', nullable: true },
              publicationError: { type: 'object', nullable: true }
            }
          },
          GitHubContributions: {
            type: 'object',
            properties: {
              users: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    totalContributions: { type: 'integer' },
                    months: { type: 'object' },
                    fetchedAt: { type: 'string', format: 'date-time' },
                    username: { type: 'string' }
                  }
                }
              },
              fetchedAt: { type: 'string', format: 'date-time', nullable: true }
            }
          },
          GitLabContributions: {
            type: 'object',
            properties: {
              users: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    totalContributions: { type: 'integer' },
                    months: { type: 'object' },
                    fetchedAt: { type: 'string', format: 'date-time' },
                    source: { type: 'string' },
                    username: { type: 'string' }
                  }
                }
              },
              fetchedAt: { type: 'string', format: 'date-time', nullable: true }
            }
          },
          Snapshot: {
            type: 'object',
            properties: {
              periodStart: { type: 'string', format: 'date' },
              periodEnd: { type: 'string', format: 'date' },
              generatedAt: { type: 'string', format: 'date-time' },
              team: {
                type: 'object',
                properties: {
                  resolvedCount: { type: 'integer' },
                  resolvedPoints: { type: 'integer' },
                  avgCycleTimeDays: { type: 'number', nullable: true },
                  githubContributions: { type: 'integer' },
                  gitlabContributions: { type: 'integer' }
                }
              },
              members: { type: 'object' }
            }
          },
          RefreshRequest: {
            type: 'object',
            required: ['scope'],
            properties: {
              scope: { type: 'string', enum: ['person', 'team', 'org', 'all'] },
              name: { type: 'string', description: 'Person name (required for scope=person)' },
              teamKey: { type: 'string', description: 'Team key (required for scope=team)' },
              orgKey: { type: 'string', description: 'Org key (required for scope=org)' },
              force: { type: 'boolean', default: false },
              sources: {
                type: 'object',
                properties: {
                  jira: { type: 'boolean', default: true },
                  github: { type: 'boolean', default: true },
                  gitlab: { type: 'boolean', default: true }
                }
              }
            }
          },
          ApiToken: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              tokenPrefix: { type: 'string', example: 'tt_a1b2c3d4' },
              ownerEmail: { type: 'string', format: 'email' },
              createdAt: { type: 'string', format: 'date-time' },
              expiresAt: { type: 'string', format: 'date-time', nullable: true },
              lastUsedAt: { type: 'string', format: 'date-time', nullable: true }
            }
          },
          AllowlistResponse: {
            type: 'object',
            properties: {
              emails: { type: 'array', items: { type: 'string', format: 'email' } }
            }
          }
        },
        responses: {
          ServerError: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          Forbidden: {
            description: 'Forbidden - admin access required',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Admin access required' }
              }
            }
          },
          NotFound: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      },
      security: [{ forwardedEmail: [] }, { bearerToken: [] }]
    },
    apis: ['server/dev-server.js', 'modules/*/server/**/*.js']
  };

  return swaggerJsdoc(options);
}

module.exports = { createOpenApiSpec };
