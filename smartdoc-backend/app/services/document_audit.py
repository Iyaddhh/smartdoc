"""Allowlisted metadata only. Commit together with the audited state change."""
from app.models.document_audit import DocumentAudit

ACTIONS = {"uploaded", "renamed", "moved", "saved", "deleted", "process_queued", "process_started", "process_finished"}
CODES = {None, "PROCESS_FAILED", "QUOTA_EXCEEDED", "PROCESS_INTERRUPTED"}


def record_document_activity(db, document, action, *, outcome="success", code=None, system=False):
    if action not in ACTIONS or outcome not in {"success", "failed"} or code not in CODES:
        raise ValueError("Unsupported document audit metadata")
    if document.user_id is None:
        return  # Legacy unowned records cannot create private user activity.
    db.add(DocumentAudit(owner_id=document.user_id, actor_id=None if system else document.user_id,
                         document_id=document.id, action=action, outcome=outcome, code=code))
