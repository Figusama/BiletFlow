from fastapi import APIRouter, Depends

from backend.modules.admin.router import require_admin
from backend.modules.jobs.service import run_all
from backend.modules.users.user_model import users

router = APIRouter(prefix="/admin/jobs", tags=["admin"])


@router.post("/run")
def run_jobs(admin: users = Depends(require_admin)) -> dict:
    return run_all()
