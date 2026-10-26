import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import jwt

from ado_client import AzureDevOpsGateway

load_dotenv()

app = FastAPI(
    title="RubiOps PR Gateway API",
    description="PR Request Gateway connecting developers to Azure DevOps using server-side service credentials",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gateway = AzureDevOpsGateway()


class UserIdentity(BaseModel):
    name: str
    email: str
    oid: str
    role: str = "developer"


class CreatePRRequest(BaseModel):
    repository: str
    sourceBranch: str
    targetBranch: str
    title: str
    description: Optional[str] = ""
    workItemId: Optional[int] = None
    reviewerId: Optional[str] = None


class ValidatePRRequest(BaseModel):
    repository: str
    sourceBranch: str
    targetBranch: str


def get_current_user(authorization: Optional[str] = Header(None)) -> UserIdentity:
    if os.getenv("PR_GATEWAY_DEV_MODE", "false").lower() == "true":
        return UserIdentity(
            name=os.getenv("DEV_USER_NAME", "Developer"),
            email=os.getenv("DEV_USER_EMAIL", "dev@company.com"),
            oid="dev-oid-12345",
            role="developer",
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization Bearer header",
        )

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        name = payload.get("name") or payload.get("preferred_username") or "Developer"
        email = payload.get("preferred_username") or payload.get("email") or payload.get("upn") or ""
        oid = payload.get("oid") or payload.get("sub") or "oid-unknown"
        return UserIdentity(name=name, email=email, oid=oid, role="developer")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "RubiOps PR Gateway (FastAPI)",
        "adoConfigured": gateway.is_configured(),
    }


@app.get("/api/me", response_model=UserIdentity)
def me(user: UserIdentity = Depends(get_current_user)):
    return user


@app.get("/api/repositories")
async def get_repositories(user: UserIdentity = Depends(get_current_user)):
    try:
        repos = await gateway.get_repositories()
        return {"repositories": repos}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/repositories/{repository}/branches")
async def get_branches(repository: str, user: UserIdentity = Depends(get_current_user)):
    try:
        branches = await gateway.get_branches(repository)
        return {"repository": repository, "branches": branches}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/reviewers")
def get_reviewers(user: UserIdentity = Depends(get_current_user)):
    raw = os.getenv("ADO_REVIEWERS", "lead1@company.com,lead2@company.com")
    reviewers = []
    for item in raw.split(","):
        trimmed = item.strip()
        if trimmed:
            reviewers.append({"id": trimmed, "displayName": trimmed, "email": trimmed})
    return {"reviewers": reviewers}


@app.post("/api/validate")
async def validate_pr(req: ValidatePRRequest, user: UserIdentity = Depends(get_current_user)):
    result = await gateway.validate_branch_divergence(req.repository, req.sourceBranch, req.targetBranch)
    return result


@app.post("/api/pr-requests", status_code=201)
async def create_pr(req: CreatePRRequest, user: UserIdentity = Depends(get_current_user)):
    validation = await gateway.validate_branch_divergence(req.repository, req.sourceBranch, req.targetBranch)
    if not validation.get("valid"):
        raise HTTPException(
            status_code=400,
            detail=validation.get("reason", "Branch validation failed"),
        )

    try:
        pr = await gateway.create_pull_request(
            repository=req.repository,
            source_branch=req.sourceBranch,
            target_branch=req.targetBranch,
            title=req.title,
            description=req.description or "",
            requester_name=user.name,
            requester_email=user.email,
            requester_oid=user.oid,
            work_item_id=req.workItemId,
            reviewer_id=req.reviewerId,
        )
        return {
            "success": True,
            "message": "PR created successfully via RubiOps Gateway",
            "pullRequest": pr,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/pr-requests/{repository}/{pr_id}/status")
async def get_pr_status(repository: str, pr_id: int, user: UserIdentity = Depends(get_current_user)):
    try:
        pr = await gateway.get_pull_request(repository, pr_id)
        return {"pullRequest": pr}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
