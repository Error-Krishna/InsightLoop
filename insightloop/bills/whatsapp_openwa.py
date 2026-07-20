"""TEMPORARY OpenWA bridge for WhatsApp bill sharing.

===========================================================================
THIS ENTIRE MODULE IS A STAND-IN, NOT THE REAL IMPLEMENTATION.
===========================================================================
Real Meta WhatsApp Business Cloud API credentials aren't available yet
(see bills/whatsapp.py, which IS the real, permanent implementation and
should be left untouched). Until Meta credentials are added, bill-sharing
is routed through a self-hosted OpenWA server so the feature can be tested
end-to-end with an actual WhatsApp account.

To remove this once real Meta credentials are available, see the removal
checklist in the WHATSAPP_PROVIDER comment block in insightloop/settings.py.

Confirmed contract for this specific OpenWA server (captured directly from
its own dashboard's Network tab -- see conversation history for how this was
derived, since the generic open-wa/wa-automate REST contract this module
originally assumed turned out to be wrong for this server):

  Auth:            x-api-key header (NOT a query parameter)
  List sessions:   GET  {base_url}/api/sessions
                   -> [{"id": "<uuid>", "status": "ready", ...}, ...]
                   The session id ROTATES every time the WhatsApp connection
                   is restarted, so it must be looked up fresh on every
                   send rather than cached/hardcoded.
  Send document:   POST {base_url}/api/sessions/<session_id>/messages/send-document
                   JSON body: {"chatId": "<digits>@lid", "base64": "<raw base64,
                               NO data-URI prefix>", "filename": "...",
                               "mimetype": "application/pdf"}
  Send text:       POST {base_url}/api/sessions/<session_id>/messages/send-text
                   JSON body: {"chatId": "<digits>@lid", "text": "..."}
                   (not used here, but confirmed working the same way)

Chat id suffix: use "@c.us" for sending to an arbitrary customer phone
number -- this is the standard WhatsApp-Web-protocol format for
phone-number-based chat ids, and is what every other bridge (including
Meta's own numbering) uses. "@lid" (WhatsApp's internal "linked ID"
namespace) was tried first based on what the OpenWA dashboard's own
message tester produced when testing against the connected account's own
number, but that turned out to only reliably resolve within that same
session's own contact space -- sending a bill to a real customer number
with "@lid" was actually being delivered back to the connected WhatsApp
account itself instead of the customer. "@c.us" is the correct format for
an arbitrary destination number.
"""
import base64
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class OpenWANotConfigured(Exception):
    """Raised when OPENWA_API_KEY isn't set."""


class OpenWASendError(Exception):
    """Raised when the OpenWA server rejects or fails to send a message."""


def _require_configured():
    if not settings.OPENWA_ENABLED:
        raise OpenWANotConfigured(
            "OpenWA is not configured (this is the TEMPORARY WhatsApp bridge used until real "
            "Meta credentials are available). Set OPENWA_API_KEY in your environment, and make "
            "sure your OpenWA server is running at OPENWA_BASE_URL "
            f"(currently {settings.OPENWA_BASE_URL})."
        )


def _headers():
    return {"x-api-key": settings.OPENWA_API_KEY, "Content-Type": "application/json"}


def normalize_phone_number(raw_phone):
    """Strip formatting to digits only and ensure an Indian country code
    (91) prefix. The chat id suffix (@c.us / @lid) is applied separately in
    share_bill_pdf, not here, since this function just normalizes the
    number itself.

    Handles the common real-world input shapes for an Indian mobile number:
      "9876543210"     -> "919876543210" (bare 10-digit number, prepend 91)
      "+919876543210"  -> "919876543210" (already has +91, just strip the +)
      "919876543210"   -> "919876543210" (already has 91, left as-is)
      "09876543210"    -> "919876543210" (leading trunk 0, replaced with 91)

    This assumes Indian numbers specifically (matching the business this
    app is built for); if InsightLoop ever supports customers outside
    India, this would need the buyer's country to decide the prefix rather
    than always defaulting to 91.
    """
    digits = "".join(ch for ch in (raw_phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("91") and len(digits) == 12:
        return digits
    if digits.startswith("0") and len(digits) == 11:
        # Leading trunk prefix (common in domestic dialing) -- drop it and
        # add the country code instead of stacking both.
        return "91" + digits[1:]
    if len(digits) == 10:
        return "91" + digits
    # Anything else (already has a different country code, or an unusual
    # length) is passed through as-is rather than guessed at further.
    return digits


def _get_active_session_id():
    """Look up the currently connected session id. This rotates every time
    the WhatsApp connection is restarted, so it's never cached -- each send
    looks it up fresh. Picks the first session with status "ready"; raises
    a clear error if none is connected (e.g. WhatsApp was never linked via
    the OpenWA dashboard, or got disconnected).
    """
    url = f"{settings.OPENWA_BASE_URL.rstrip('/')}/api/sessions"
    try:
        response = requests.get(url, headers=_headers(), timeout=15)
    except requests.RequestException as exc:
        logger.error("OpenWA session lookup network error: %s", exc)
        raise OpenWASendError(
            f"Could not reach the OpenWA server at {settings.OPENWA_BASE_URL}. Is it running? ({exc})"
        ) from exc

    if not response.ok:
        logger.error("OpenWA session lookup failed: %s", response.text)
        raise OpenWASendError(f"Could not look up the WhatsApp session: {response.text}")

    try:
        sessions = response.json()
    except ValueError as exc:
        raise OpenWASendError("OpenWA returned an unexpected response while listing sessions.") from exc

    ready_sessions = [s for s in sessions if s.get("status") == "ready"]
    if not ready_sessions:
        raise OpenWASendError(
            "No WhatsApp session is currently connected on the OpenWA server. "
            "Open the OpenWA dashboard and reconnect (scan the QR code) before sharing a bill."
        )
    return ready_sessions[0]["id"]


def _send_document_request(session_id, chat_id, pdf_bytes, filename, caption=None):
    url = f"{settings.OPENWA_BASE_URL.rstrip('/')}/api/sessions/{session_id}/messages/send-document"
    payload = {
        "chatId": chat_id,
        "base64": base64.b64encode(pdf_bytes).decode("ascii"),
        "filename": filename,
        "mimetype": "application/pdf",
    }
    if caption:
        payload["caption"] = caption
    try:
        response = requests.post(url, headers=_headers(), json=payload, timeout=30)
    except requests.RequestException as exc:
        logger.error("OpenWA send-document network error: %s", exc)
        raise OpenWASendError(
            f"Could not reach the OpenWA server at {settings.OPENWA_BASE_URL}. Is it running? ({exc})"
        ) from exc

    if not response.ok:
        logger.error("OpenWA send-document failed: %s", response.text)
        raise OpenWASendError(f"OpenWA server rejected the message: {response.text}")

    try:
        return response.json()
    except ValueError:
        return {"detail": "Message accepted by OpenWA (no structured response body)."}


def share_bill_pdf(phone_number, pdf_bytes, invoice_number, company_name=None):
    """Send a bill PDF over WhatsApp via the temporary OpenWA bridge.

    Same signature as bills/whatsapp.py's share_bill_pdf, so bills/views.py
    can call whichever provider WHATSAPP_PROVIDER selects without branching
    on anything except which module to import.

    company_name is included in the message caption because WhatsApp itself
    shows the recipient whatever name is saved for the sending number in
    their own phone contacts (or "Unknown" if it isn't saved) -- there's no
    way to override that display name per-message, so putting the business
    name directly in the caption is the reliable way to make sure the
    recipient knows who the bill is from.

    Tries "@c.us" first (the correct format for an arbitrary customer
    number). If the server rejects that outright, falls back to "@lid" as
    a second attempt, purely as a safety net in case this particular
    server instance genuinely requires it for some numbers -- but "@c.us"
    should be the one that actually reaches the customer rather than
    looping back to the connected account.
    """
    _require_configured()
    digits = normalize_phone_number(phone_number)
    if not digits:
        raise OpenWASendError("Customer phone number is missing or invalid.")
    session_id = _get_active_session_id()
    filename = f"{invoice_number}.pdf"
    caption = (
        f"Invoice {invoice_number} from {company_name}\n\nDeveloped and managed by Udhyog Saathi"
        if company_name
        else f"Invoice {invoice_number}\n\nDeveloped and managed by Udhyog Saathi"
    )

    try:
        return _send_document_request(session_id, f"{digits}@c.us", pdf_bytes, filename, caption)
    except OpenWASendError as primary_error:
        logger.warning("OpenWA send with @c.us failed, retrying with @lid: %s", primary_error)
        try:
            return _send_document_request(session_id, f"{digits}@lid", pdf_bytes, filename, caption)
        except OpenWASendError:
            # Surface the original @c.us error, since that's the format
            # that should be correct -- the @lid retry is a fallback, not
            # the primary path, so its failure isn't the useful one to show.
            raise primary_error
