import os
import base64
import datetime
from typing import Dict, Any, List, Optional
import httpx


class AzureDevOpsGateway:
    def __init__(
        self,
        org_url: Optional[str] = None,
        project: Optional[str] = None,
        service_pat: Optional[str] = None,
    ):
        self.org_url = (org_url or os.getenv("ADO_ORG_URL", "")).rstrip("/")
        self.project = project or os.getenv("ADO_PROJECT", "")
        self.service_pat = service_pat or os.getenv("ADO_SERVICE_PAT", "")
        self.api_version = "7.1"

    @property
    def base_url(self) -> str:
        if self.org_url.startswith("http://") or self.org_url.startswith("https://"):
            return self.org_url
        return f"https://dev.azure.com/{self.org_url.lstrip('/')}"

    def is_configured(self) -> bool:
        return bool(self.org_url and self.project and self.service_pat)

    def _headers(self) -> Dict[str, str]:
        auth = base64.b64encode(f":{self.service_pat}".encode("ascii")).decode("ascii")
        return {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "RubiOps-FastAPI-Gateway/1.0",
        }

    async def get_repositories(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/{self.project}/_apis/git/repositories?api-version={self.api_version}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()

        allowed_repos = os.getenv("ADO_ALLOWED_REPOS", "*").split(",")
        allowed_repos = [r.strip() for r in allowed_repos if r.strip()]

        result = []
        for repo in data.get("value", []):
            name = repo.get("name", "")
            if "*" in allowed_repos or name in allowed_repos:
                result.append({
                    "id": repo.get("id"),
                    "name": name,
                    "defaultBranch": repo.get("defaultBranch", "refs/heads/main").replace("refs/heads/", ""),
                    "webUrl": repo.get("webUrl", ""),
                })
        return result

    async def get_branches(self, repository: str) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/{self.project}/_apis/git/repositories/{repository}/refs?filter=heads/&api-version={self.api_version}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()

        branches = []
        for ref in data.get("value", []):
            name = ref.get("name", "").replace("refs/heads/", "")
            if name:
                branches.append({
                    "name": name,
                    "objectId": ref.get("objectId"),
                })
        return branches

    async def validate_branch_divergence(
        self, repository: str, source_branch: str, target_branch: str
    ) -> Dict[str, Any]:
        clean_source = source_branch.replace("refs/heads/", "")
        clean_target = target_branch.replace("refs/heads/", "")

        if clean_source == clean_target:
            return {"valid": False, "reason": "Source and target branch cannot be the same."}

        url = (
            f"{self.base_url}/{self.project}/_apis/git/repositories/{repository}/diffs/commits"
            f"?baseVersion={clean_target}&baseVersionType=branch&targetVersion={clean_source}"
            f"&targetVersionType=branch&api-version={self.api_version}"
        )
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url, headers=self._headers())
                if resp.status_code == 200:
                    data = resp.json()
                    ahead = data.get("aheadCount", 0)
                    if ahead == 0:
                        return {
                            "valid": False,
                            "reason": f"Branch '{clean_source}' has 0 commits ahead of target '{clean_target}'.",
                            "aheadCount": 0,
                        }
                    return {"valid": True, "aheadCount": ahead}
            except Exception as e:
                return {"valid": True, "aheadCount": None, "reason": f"Diff check warning: {e}"}

        return {"valid": True}

    async def create_pull_request(
        self,
        repository: str,
        source_branch: str,
        target_branch: str,
        title: str,
        description: str,
        requester_name: str,
        requester_email: str,
        requester_oid: Optional[str] = None,
        work_item_id: Optional[int] = None,
        reviewer_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        source_ref = source_branch if source_branch.startswith("refs/") else f"refs/heads/{source_branch}"
        target_ref = target_branch if target_branch.startswith("refs/") else f"refs/heads/{target_branch}"

        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        audit_stamp = (
            f"> [!NOTE]\n"
            f"> **PR Requested Through:** RubiOps PR Gateway\n"
            f"> **Requested By:** {requester_name} ({requester_email})\n"
            f"> **Requester OID:** `{requester_oid or 'n/a'}`\n"
            f"> **Requested At:** {timestamp}\n"
        )
        if work_item_id:
            audit_stamp += f"> **Linked Work Item:** AB#{work_item_id}\n"
        audit_stamp += "\n---\n\n"

        full_description = audit_stamp + (description or "")

        body: Dict[str, Any] = {
            "sourceRefName": source_ref,
            "targetRefName": target_ref,
            "title": title,
            "description": full_description,
        }

        if work_item_id:
            body["workItemRefs"] = [{"id": str(work_item_id)}]

        if reviewer_id:
            body["reviewers"] = [{"id": str(reviewer_id)}]

        url = f"{self.base_url}/{self.project}/_apis/git/repositories/{repository}/pullrequests?api-version={self.api_version}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=self._headers(), json=body)
            if resp.status_code >= 400:
                err_data = resp.json()
                msg = err_data.get("message", f"Azure DevOps error: {resp.status_code}")
                raise RuntimeError(msg)
            data = resp.json()

        pr_id = data.get("pullRequestId")
        web_url = data.get("_links", {}).get("web", {}).get("href", "")
        if not web_url:
            web_url = f"{self.base_url}/{self.project}/_git/{repository}/pullrequest/{pr_id}"

        return {
            "id": pr_id,
            "pullRequestId": pr_id,
            "title": data.get("title", title),
            "url": web_url,
            "webUrl": web_url,
            "status": data.get("status", "active"),
            "repository": repository,
            "sourceBranch": source_ref.replace("refs/heads/", ""),
            "targetBranch": target_ref.replace("refs/heads/", ""),
            "requestedBy": requester_name,
            "createdAt": data.get("creationDate", timestamp),
        }

    async def get_pull_request(self, repository: str, pull_request_id: int) -> Dict[str, Any]:
        url = f"{self.base_url}/{self.project}/_apis/git/repositories/{repository}/pullrequests/{pull_request_id}?api-version={self.api_version}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()

        reviewers = []
        for r in data.get("reviewers", []):
            vote = r.get("vote", 0)
            vote_label = {
                10: "Approved",
                5: "Approved with suggestions",
                0: "No vote",
                -5: "Waiting for author",
                -10: "Rejected",
            }.get(vote, "No vote")
            reviewers.append({
                "id": r.get("id"),
                "displayName": r.get("displayName"),
                "vote": vote,
                "voteLabel": vote_label,
            })

        return {
            "id": data.get("pullRequestId"),
            "pullRequestId": data.get("pullRequestId"),
            "title": data.get("title"),
            "status": data.get("status"),
            "mergeStatus": data.get("mergeStatus"),
            "sourceBranch": data.get("sourceRefName", "").replace("refs/heads/", ""),
            "targetBranch": data.get("targetRefName", "").replace("refs/heads/", ""),
            "webUrl": data.get("_links", {}).get("web", {}).get("href"),
            "reviewers": reviewers,
        }
