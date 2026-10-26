# PR Request Gateway --- Implementation Plan

## 1. Objective

Build an internal **PR Request Gateway** that allows all 9 developers to
submit PR requests without requiring each developer to use the Azure
DevOps PR web interface.

### Target model

-   **9 Developers** → use the PR Gateway
-   **5 Basic Azure DevOps users** → review/approve PRs in Azure DevOps
-   **Azure DevOps** remains the source of truth for Git, PRs, branch
    policies, builds, approvals, and merges
-   **No custom PR database**
-   **No separate Git server**
-   **No shared developer Azure DevOps login**

> Important: Before implementation, confirm with the Azure DevOps
> administrator that the chosen service identity can perform the
> required PR API operations under the organization's current licensing
> and access configuration.

------------------------------------------------------------------------

# 2. Simplified Architecture

``` text
             9 DEVELOPERS
                   |
                   v
          +------------------+
          |    PR GATEWAY    |
          |                  |
          | Microsoft Login  |
          | PR Request       |
          | PR Tracking      |
          +--------+---------+
                   |
                   v
          +------------------+
          | Backend / API    |
          |                  |
          | FastAPI           |
          +--------+---------+
                   |
                   v
          +------------------+
          | Azure DevOps API |
          +--------+---------+
                   |
                   v
          +------------------+
          | Azure Repos      |
          | Pull Request     |
          | Branch Policies  |
          | Build Validation |
          +--------+---------+
                   |
                   v
             5 BASIC USERS
              REVIEW/APPROVE
                   |
                   v
                 MERGE
```

------------------------------------------------------------------------

# 3. What the PR Gateway Does

The gateway is **not a replacement for Azure DevOps**.

It provides a controlled entry point for developers to request PRs.

### Gateway responsibilities

-   Microsoft Entra ID login
-   Identify the logged-in developer
-   Show allowed repositories
-   Show source branches
-   Show target branches
-   Validate PR request
-   Create the PR through Azure DevOps API
-   Display PR status
-   Display Azure DevOps PR information
-   Show who requested the PR
-   Redirect/route reviewers to Azure DevOps when detailed code review
    is required

### Azure DevOps remains responsible for

-   Git repositories
-   Commits
-   Branches
-   Pull Requests
-   Code diff
-   Inline code comments
-   Review approvals
-   Build validation
-   Branch policies
-   Merge
-   Merge conflicts
-   Final PR status

------------------------------------------------------------------------

# 4. User Roles

## Developer

The 9 developers can:

-   Login through Microsoft Entra ID
-   View their identity
-   Select repository
-   Select source branch
-   Select target branch
-   Enter PR title
-   Enter description
-   Submit PR request
-   View their submitted PRs/status through the gateway

They cannot:

-   Approve PRs
-   Merge protected branches
-   Modify branch policies
-   Manage users
-   Configure repositories

## Reviewer

The existing 5 Basic users can:

-   Review PRs in Azure DevOps
-   Add comments
-   Request changes
-   Approve PRs
-   Complete/merge PRs if branch policies permit

## Admin

Admin can:

-   Configure repositories
-   Configure allowed branches
-   Configure reviewer mappings
-   Manage gateway users/roles
-   Manage service configuration
-   View system logs
-   Configure Azure DevOps connection

------------------------------------------------------------------------

# 5. Authentication

Use **Microsoft Entra ID**.

Do not create a separate username/password system.

``` text
Developer
    |
    v
Microsoft Entra ID
    |
    v
PR Gateway
    |
    v
Authenticated User
```

The gateway should obtain:

-   Entra Object ID
-   Display Name
-   Email
-   User identity/claims

The application can display:

``` text
Logged in as:
Balamurugan Muthukrishnan

Role:
Developer
```

The Entra Object ID should be used as the stable user identifier.

------------------------------------------------------------------------

# 6. No Custom Database

The gateway will not maintain a PR database.

Do not create:

-   users table
-   repositories table
-   PR requests table
-   PR event table
-   audit table
-   PR history table

Instead, use the existing systems as the source of truth.

``` text
User
  -> Microsoft Entra ID

Repository
  -> Azure DevOps

Branch
  -> Azure DevOps

Pull Request
  -> Azure DevOps

PR Status
  -> Azure DevOps
```

The gateway fetches current information from Azure DevOps APIs whenever
required.

------------------------------------------------------------------------

# 7. PR Identity

There are two identities to distinguish.

## Human requester

Example:

``` text
Requested By:
Balamurugan Muthukrishnan
```

This comes from Microsoft Entra ID.

## Azure DevOps API actor

The Azure DevOps API may see the configured service identity as the
actor that creates the PR.

Do not hide this distinction.

The PR description can include:

``` text
PR Requested Through:
PR Gateway

Requested By:
Balamurugan Muthukrishnan
```

This gives the team a clear human audit trail without maintaining a
separate PR database.

------------------------------------------------------------------------

# 8. Developer Workflow

## Step 1 --- Developer logs in

``` text
PR Gateway

Logged in:
Balamurugan Muthukrishnan

Role:
Developer
```

## Step 2 --- Developer creates PR request

Example form:

``` text
Repository
[ CoreService ]

Source Branch
[ feature/payment-update ]

Target Branch
[ dev ]

PR Title
[ Payment integration update ]

Description
[ Added Razorpay payment handling ]

Reviewer
[ Team Lead ]

[ Submit PR Request ]
```

## Step 3 --- Backend validates

The backend checks:

``` text
✓ User is authenticated
✓ User is authorized
✓ Repository exists
✓ Source branch exists
✓ Target branch exists
✓ Source != target
✓ Source branch contains changes
✓ Target branch is allowed
✓ Reviewer is valid
```

## Step 4 --- Backend creates Azure DevOps PR

The backend calls the Azure DevOps REST API.

## Step 5 --- Gateway displays result

``` text
PR Created Successfully

Repository:
CoreService

Azure PR:
#245

Requested By:
Balamurugan Muthukrishnan

Status:
Waiting for Review
```

------------------------------------------------------------------------

# 9. Reviewer Workflow

The reviewer continues using Azure DevOps for the actual code review.

``` text
Azure DevOps
     |
     v
PR #245
     |
     +--> Review code
     |
     +--> Add comments
     |
     +--> Request changes
     |
     +--> Approve
     |
     +--> Build validation
     |
     +--> Merge
```

The gateway does not need to reproduce the Azure DevOps code-review UI.

------------------------------------------------------------------------

# 10. Branch Protection

The gateway should not be the only protection mechanism.

Azure DevOps branch policies must protect important branches.

Example:

``` text
feature/*
    |
    | Developer can push
    v
dev
    |
    | PR + approval required
    v
stage
    |
    | PR + approval required
    v
preprod
    |
    | PR + approval required
    v
prod
```

Recommended controls:

### dev

-   Minimum 1 reviewer
-   Direct push restricted
-   Build validation if required
-   Comment resolution if required

### stage

-   Minimum 1 reviewer
-   Build validation
-   Direct push restricted

### preprod

-   Minimum 1 or 2 reviewers
-   Build validation
-   Direct push restricted

### prod

-   Required reviewers
-   Build validation
-   Direct push restricted
-   No bypass for normal developers

The exact rules should be confirmed with your existing DevOps process.

------------------------------------------------------------------------

# 11. Automatic Reviewer Assignment

Initial MVP can allow the developer to select a reviewer.

Later, automate it.

Example:

``` text
CorePlatform
 |
 +-- Flutter changes
 |       -> Flutter TL
 |
 +-- Backend changes
 |       -> Backend reviewer
 |
 +-- Database changes
 |       -> DB reviewer
 |
 +-- Security changes
         -> Security reviewer
```

Path-based reviewer rules can also be implemented using Azure DevOps
policies where appropriate.

------------------------------------------------------------------------

# 12. Backend Architecture

Recommended technology:

-   Python
-   FastAPI
-   Azure DevOps REST API
-   Microsoft Entra ID
-   HTTPS

Example structure:

``` text
backend/
|
+-- app/
|   |
|   +-- auth/
|   +-- azure_devops/
|   +-- repositories/
|   +-- branches/
|   +-- pull_requests/
|   +-- users/
|   +-- permissions/
|   +-- config/
|   +-- main.py
|
+-- tests/
|
+-- requirements.txt
```

------------------------------------------------------------------------

# 13. Frontend Architecture

Recommended:

-   Next.js
-   TypeScript
-   Microsoft Entra authentication
-   Responsive web UI

Example:

``` text
frontend/
|
+-- app/
|   |
|   +-- login/
|   +-- dashboard/
|   +-- pr/
|   +-- repositories/
|   +-- profile/
|   +-- admin/
|
+-- components/
+-- services/
+-- types/
```

------------------------------------------------------------------------

# 14. Main Screens

## Login

``` text
+--------------------------------+
|          PR Gateway            |
|                                |
|      [ Sign in with Microsoft ]|
|                                |
+--------------------------------+
```

## Developer Dashboard

``` text
+------------------------------------------------+
| PR Gateway                     Bala ▼           |
+------------------------------------------------+
|                                                |
| My PR Requests                                 |
|                                                |
| PR #245    CoreService     feature/payment   REVIEW |
| PR #246    Backend         feature/login     APPROVED|
| PR #247    CoreService     feature/invoice   CHANGES |
|                                                |
|              [ Create PR Request ]             |
+------------------------------------------------+
```

## Create PR

``` text
+-----------------------------------------------+
| Create PR Request                             |
+-----------------------------------------------+
| Repository                                    |
| [ CoreService                            ▼ ]  |
|                                               |
| Source Branch                                 |
| [ feature/payment-update                 ▼ ]  |
|                                               |
| Target Branch                                 |
| [ dev                                     ▼ ] |
|                                               |
| Title                                         |
| [ Payment integration update              ]  |
|                                               |
| Description                                   |
| [                                         ]   |
|                                               |
| Reviewer                                      |
| [ Team Lead                               ▼ ] |
|                                               |
|             [ Submit PR Request ]              |
+-----------------------------------------------+
```

## PR Details

``` text
PRREQ / Azure PR #245

Requested By:
Balamurugan Muthukrishnan

Repository:
CoreService

Source:
feature/payment-update

Target:
dev

Status:
Waiting for Review

Azure DevOps:
[ Open PR ]
```

------------------------------------------------------------------------

# 15. API Design

## Gateway APIs

``` text
GET  /api/me

GET  /api/repositories

GET  /api/repositories/{id}/branches

GET  /api/reviewers

POST /api/pr-requests

GET  /api/pr-requests

GET  /api/pr-requests/{id}

GET  /api/pr-requests/{id}/status
```

Optional:

``` text
POST /api/pr-requests/{id}/retry
POST /api/pr-requests/{id}/cancel
```

## Azure DevOps integration

The backend should have functions such as:

``` text
get_repositories()

get_repository()

get_branches()

validate_branch()

create_pull_request()

get_pull_request()

get_pull_request_status()

get_pull_request_reviewers()

get_pull_request_threads()
```

------------------------------------------------------------------------

# 16. Azure DevOps Service Identity

The gateway needs an Azure DevOps identity/credential capable of
performing the required API operations.

Important:

**Do not put the Azure DevOps credential in the browser.**

Correct:

``` text
Browser
   |
   v
FastAPI
   |
   v
Secret Store / Server-side credential
   |
   v
Azure DevOps API
```

Incorrect:

``` text
Browser
   |
   v
PAT / Azure DevOps secret
   |
   v
Azure DevOps
```

The service credential should never be exposed to developers.

------------------------------------------------------------------------

# 17. Licensing Verification --- Must Be Done First

Before writing production code, ask your Azure DevOps administrator to
confirm:

1.  We currently have 5 Basic users. Can we create a service identity
    for the PR Gateway?
2.  What access level does the service identity require?
3.  Can the service identity create Azure DevOps pull requests through
    REST API?
4.  Does the service identity consume one of our paid Basic seats?
5.  Does our organization have Visual Studio subscriptions that already
    provide Basic access to any of the 9 developers?
6.  Does any developer have GitHub Enterprise licensing that grants
    Basic access?
7.  Are there organization-specific licensing restrictions?

Do not proceed assuming that the gateway automatically bypasses Azure
DevOps licensing.

------------------------------------------------------------------------

# 18. Repository Questions

Collect these details from the team:

``` text
1. Azure DevOps organization name
2. Project name
3. Repository names
4. Repository IDs
5. Default branch
6. Developer branch naming convention
7. Protected branches
8. Current branch policies
9. Current repository permissions
10. Current reviewers
```

Example:

``` text
Organization:
company

Project:
CorePlatform

Repositories:
CoreService
Backend
Database

Protected:
dev
stage
preprod
prod
```

------------------------------------------------------------------------

# 19. Team Questions

Collect:

``` text
Developer list:
1. Developer A
2. Developer B
3. Developer C
4. Developer D
5. Developer E
6. Developer F
7. Developer G
8. Developer H
9. Developer I

Reviewer list:
1. Reviewer A
2. Reviewer B
3. Reviewer C
4. Reviewer D
5. Reviewer E
```

For each user, confirm:

-   Name
-   Company email
-   Entra account
-   Current Azure DevOps access level
-   Repository access
-   Role

------------------------------------------------------------------------

# 20. PR Policy Questions

Confirm:

1.  Minimum number of reviewers?
2.  Can the PR creator approve their own PR?
3.  Should approval reset after new commits?
4.  Is build validation mandatory?
5.  Is comment resolution mandatory?
6.  Who can bypass policies?
7.  Who can complete a PR?
8.  Should the gateway automatically select reviewers?
9.  Can developers cancel PR requests?
10. Should abandoned PRs be allowed?

------------------------------------------------------------------------

# 21. Failure Handling

The gateway must handle Azure DevOps failures safely.

Example:

``` text
Developer clicks:
[ Submit PR Request ]

Azure DevOps API fails

Gateway:

PR creation failed.

Reason:
Azure DevOps service unavailable.

[ Retry ]
```

Avoid duplicate PR creation if the user clicks Submit multiple times.

Use an idempotency/request identifier internally for each submission.

------------------------------------------------------------------------

# 22. Security

Minimum requirements:

### Authentication

-   Microsoft Entra ID
-   HTTPS only

### Authorization

``` text
ADMIN
REVIEWER
DEVELOPER
```

### Backend security

-   Validate all input
-   Validate repository access
-   Validate branch access
-   CORS restrictions
-   Rate limiting
-   Secure headers
-   Server-side Azure DevOps credentials
-   No secrets in Git
-   No secrets in frontend

### Audit visibility

Because there is no custom database, important requester information
should be retained in the Azure DevOps PR itself, for example:

``` text
PR Requested Through:
PR Gateway

Requested By:
Balamurugan Muthukrishnan

Requested At:
2026-09-30 20:45 IST
```

------------------------------------------------------------------------

# 23. MVP Scope

Do not build a large system initially.

## Phase 1 --- MVP

``` text
[ ] Microsoft Entra login
[ ] Developer role
[ ] Reviewer role
[ ] Admin role
[ ] Repository list
[ ] Branch list
[ ] Create PR request
[ ] Azure DevOps PR creation
[ ] PR status
[ ] Requested-by identity
[ ] Basic dashboard
[ ] Error handling
```

No custom database.

------------------------------------------------------------------------

# 24. Phase 2

After MVP validation:

``` text
[ ] Automatic reviewer assignment
[ ] Teams/email notifications
[ ] Azure PR status synchronization
[ ] Build status
[ ] PR comments/status summary
[ ] Retry management
[ ] Better dashboard
[ ] Admin configuration
```

------------------------------------------------------------------------

# 25. Phase 3

Optional advanced features:

``` text
[ ] Multiple repositories
[ ] Path-based reviewer assignment
[ ] Repository-specific rules
[ ] Approval escalation
[ ] PR cycle-time analytics
[ ] SLA tracking
[ ] Team reports
[ ] Release-flow dashboard
```

------------------------------------------------------------------------

# 26. Testing Plan

Test at least:

### Authentication

``` text
[ ] Valid developer login
[ ] Valid reviewer login
[ ] Valid admin login
[ ] Unauthorized account
[ ] Disabled user
```

### PR creation

``` text
[ ] Valid branch
[ ] Invalid branch
[ ] Source == target
[ ] No changes
[ ] Valid repository
[ ] Invalid repository
[ ] Duplicate submit
[ ] Azure DevOps API failure
```

### Workflow

``` text
[ ] PR created
[ ] Reviewer assigned
[ ] Approval
[ ] Changes requested
[ ] New commit after approval
[ ] Build failure
[ ] Build success
[ ] Merge
[ ] Abandon PR
```

### Security

``` text
[ ] Developer cannot approve
[ ] Developer cannot merge protected branch
[ ] Developer cannot access admin
[ ] Developer cannot modify another user's configuration
[ ] Azure DevOps secret is never exposed
```

------------------------------------------------------------------------

# 27. Deployment

Recommended:

``` text
Internet / Internal Network
          |
          v
     Reverse Proxy
          |
          v
     Next.js Frontend
          |
          v
       FastAPI
          |
          v
    Azure DevOps API
```

Possible hosting:

-   Azure App Service
-   Azure Container Apps
-   Internal VM
-   Docker
-   Kubernetes, if already used by the company

For your first version, avoid unnecessary infrastructure.

A simple Docker deployment is sufficient if your company infrastructure
supports it.

------------------------------------------------------------------------

# 28. Recommended Technology Stack

``` text
Frontend:
Next.js + TypeScript

Authentication:
Microsoft Entra ID

Backend:
Python + FastAPI

Database:
NONE for MVP

Git / PR:
Azure DevOps

Integration:
Azure DevOps REST API

Secrets:
Azure Key Vault or approved company secret manager

Deployment:
Docker

Monitoring:
Company-approved monitoring/logging platform
```

------------------------------------------------------------------------

# 29. Final Workflow

``` text
                    9 DEVELOPERS
                         |
                         v
                +----------------+
                | Microsoft Login|
                +-------+--------+
                        |
                        v
                +----------------+
                |  PR GATEWAY    |
                |                |
                | Create Request |
                | Validate       |
                | Track Status   |
                +-------+--------+
                        |
                        v
                +----------------+
                |    FastAPI     |
                +-------+--------+
                        |
                        v
                +----------------+
                | Azure DevOps   |
                | REST API       |
                +-------+--------+
                        |
                        v
                +----------------+
                | Azure Repos    |
                | Pull Request   |
                +-------+--------+
                        |
                        v
                 5 BASIC USERS
                   REVIEW CODE
                        |
                        v
                 Branch Policies
                        |
                        v
                     MERGE
```

------------------------------------------------------------------------

# 30. Key Principle

The gateway should **not attempt to replace Azure DevOps**.

It should solve exactly one problem:

> **Allow all 9 developers to initiate and track the PR workflow through
> an internal authenticated interface while Azure DevOps remains the
> authoritative system for repositories, pull requests, reviews, branch
> policies, builds, and merges.**

The biggest item to validate before development is the **Azure DevOps
service identity's access/licensing requirement**. Once that is
confirmed, the MVP can be implemented without a custom database.
