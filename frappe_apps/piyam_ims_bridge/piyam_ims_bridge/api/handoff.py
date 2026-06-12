import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import frappe
from werkzeug.exceptions import abort
from werkzeug.utils import redirect

HANDOFF_ISSUER = "pt-portal"
HANDOFF_AUDIENCE = "frappe-hrms"
MAX_CLOCK_SKEW_SECONDS = 30
DEFAULT_TARGET_PATH = "/hrms"


class HandoffError(Exception):
    pass


def _ims_base_url():
    return str(frappe.conf.get("ims_base_url") or "https://ims.piyamtravel.com").rstrip("/")


def _handoff_secret():
    secret = frappe.conf.get("ims_handoff_secret")
    if not secret:
        raise HandoffError("ims_handoff_secret is not configured")
    return str(secret)


def _bool_config(key):
    value = frappe.conf.get(key)
    return str(value).lower() in {"1", "true", "yes", "on"}


def _base64url_decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode()).decode()


def _base64url_encode(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _sign(payload_b64, secret):
    digest = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return _base64url_encode(digest)


def _decode_token(token):
    if not token or "." not in token:
        raise HandoffError("Invalid handoff token")

    payload_b64, signature = token.split(".", 1)
    expected = _sign(payload_b64, _handoff_secret())
    if not hmac.compare_digest(signature, expected):
        raise HandoffError("Invalid handoff signature")

    payload = json.loads(_base64url_decode(payload_b64))
    now = int(time.time())

    if payload.get("v") != 1:
        raise HandoffError("Unsupported handoff version")
    if payload.get("iss") != HANDOFF_ISSUER or payload.get("aud") != HANDOFF_AUDIENCE:
        raise HandoffError("Invalid handoff audience")
    if int(payload.get("iat") or 0) > now + MAX_CLOCK_SKEW_SECONDS:
        raise HandoffError("Handoff token is not active yet")
    if int(payload.get("exp") or 0) < now - MAX_CLOCK_SKEW_SECONDS:
        raise HandoffError("Handoff token expired")
    if not payload.get("email"):
        raise HandoffError("Handoff token has no email")

    return payload


def _safe_target(target):
    target = str(target or DEFAULT_TARGET_PATH)
    if not target.startswith("/") or target.startswith("//"):
        return DEFAULT_TARGET_PATH
    if target.startswith(("/api/", "/assets/", "/files/")):
        return DEFAULT_TARGET_PATH
    return target


def _resolve_user(payload):
    user_id = payload.get("frappe_user_id") or payload.get("email")
    if not user_id or not frappe.db.exists("User", user_id):
        raise HandoffError("Frappe user does not exist")

    user = frappe.get_cached_doc("User", user_id)
    if not user.enabled:
        raise HandoffError("Frappe user is disabled")

    return user.name


def _ims_redirect(reason, message=None):
    query = {"handoff": reason}
    if message:
        query["message"] = str(message)[:180]
    return f"{_ims_base_url()}/dashboard/frappe-transfer?{urlencode(query)}"


def _frappe_redirect(location):
    frappe.local.response["type"] = "redirect"
    frappe.local.response["location"] = location


@frappe.whitelist(allow_guest=True)
def consume(token=None):
    try:
        payload = _decode_token(token)
        user = _resolve_user(payload)

        if not hasattr(frappe.local, "login_manager"):
            from frappe.auth import LoginManager

            frappe.local.login_manager = LoginManager()

        frappe.local.login_manager.login_as(user)
        frappe.db.commit()
        _frappe_redirect(_safe_target(payload.get("target")))
    except Exception as exc:
        frappe.log_error(frappe.get_traceback(), "IMS handoff failed")
        _frappe_redirect(_ims_redirect("failed", exc))


def _is_handoff_consume_path(path):
    return path.startswith("/api/method/piyam_ims_bridge.api.handoff.consume")


def _is_direct_login_api(path):
    return path in {
        "/api/method/login",
        "/api/method/frappe.auth.login",
    }


def _should_guard_path(path):
    if _is_handoff_consume_path(path):
        return False
    if path.startswith(("/assets/", "/files/", "/private/files/", "/socket.io")):
        return False
    if path in {
        "/favicon.ico",
        "/manifest.json",
        "/manifest.webmanifest",
        "/website_script.js",
        "/hrms/manifest.json",
        "/hrms/manifest.webmanifest",
        "/hrms/sw.js",
    }:
        return False
    if path.startswith("/api/") and not _is_direct_login_api(path):
        return False
    return True


def guard_direct_access():
    if not _bool_config("ims_enforce_handoff"):
        return

    request = getattr(frappe.local, "request", None)
    path = getattr(request, "path", "") or "/"
    if not _should_guard_path(path):
        return

    if getattr(frappe.session, "user", "Guest") != "Guest":
        return

    abort(redirect(_ims_redirect("required")))
