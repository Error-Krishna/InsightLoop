"""WhatsApp Business Cloud API client for sharing generated bill PDFs.

This module is entirely env-driven (see WHATSAPP_* settings). Until real
Meta credentials are configured, WHATSAPP_ENABLED is False and every public
function here raises WhatsAppNotConfigured immediately, before making any
network call -- so the feature fails fast and clearly rather than sending
requests to Meta's API with placeholder credentials.

Meta's Cloud API requires an approved message *template* to start a new
conversation with a customer who hasn't messaged your business number in
the last 24 hours (a hard platform rule, not a choice made here). The flow
implemented is:

  1. Upload the generated PDF to Meta's Media endpoint -> get a media id.
  2. Send a template message referencing that media id as a document
     header parameter, plus the invoice number as a body parameter.

Before this will work you must, in Meta Business Manager:
  - Create/approve a message template (name matches WHATSAPP_BILL_TEMPLATE_NAME,
    default "bill_share") with a DOCUMENT header variable and one body text
    variable (e.g. "Your invoice {{1}} is attached.").
  - Have a verified WhatsApp Business phone number.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class WhatsAppNotConfigured(Exception):
    """Raised when WhatsApp credentials are still placeholders."""


class WhatsAppSendError(Exception):
    """Raised when Meta's API rejects a request (bad number, template, etc.)."""


def _require_configured():
    if not settings.WHATSAPP_ENABLED:
        raise WhatsAppNotConfigured(
            "WhatsApp sharing is not configured yet. Set WHATSAPP_PHONE_NUMBER_ID and "
            "WHATSAPP_ACCESS_TOKEN (and WHATSAPP_BUSINESS_ACCOUNT_ID) in your environment "
            "with real Meta credentials to enable this feature."
        )


def _graph_url(path):
    return f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{path}"


def _auth_headers():
    return {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}


def normalize_phone_number(raw_phone):
    """Strip formatting and ensure an Indian country code (91) prefix,
    returning digits only (E.164 without the '+').

    Meta's API expects the recipient number as digits only, including
    country code, e.g. "919876543210" for an Indian number -- a bare
    10-digit number without a country code will be silently rejected or
    misrouted, so this normalizes the common real-world input shapes:
      "9876543210"     -> "919876543210" (bare 10-digit number, prepend 91)
      "+919876543210"  -> "919876543210" (already has +91, just strip the +)
      "919876543210"   -> "919876543210" (already has 91, left as-is)
      "09876543210"    -> "919876543210" (leading trunk 0, replaced with 91)

    This assumes Indian numbers specifically (matching the business this
    app is built for); supporting customers outside India would need the
    buyer's country to decide the prefix rather than always defaulting to 91.
    """
    digits = "".join(ch for ch in (raw_phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("91") and len(digits) == 12:
        return digits
    if digits.startswith("0") and len(digits) == 11:
        return "91" + digits[1:]
    if len(digits) == 10:
        return "91" + digits
    return digits


def upload_media(pdf_bytes, filename="invoice.pdf"):
    """Upload a PDF to Meta's Media endpoint, returning the media id."""
    _require_configured()
    url = _graph_url(f"{settings.WHATSAPP_PHONE_NUMBER_ID}/media")
    files = {
        "file": (filename, pdf_bytes, "application/pdf"),
    }
    data = {
        "messaging_product": "whatsapp",
        "type": "application/pdf",
    }
    try:
        response = requests.post(url, headers=_auth_headers(), data=data, files=files, timeout=30)
    except requests.RequestException as exc:
        logger.error("WhatsApp media upload network error: %s", exc)
        raise WhatsAppSendError(f"Could not reach WhatsApp to upload the PDF: {exc}") from exc
    if not response.ok:
        logger.error("WhatsApp media upload failed: %s", response.text)
        raise WhatsAppSendError(f"Failed to upload PDF to WhatsApp: {response.text}")
    try:
        return response.json()["id"]
    except (ValueError, KeyError) as exc:
        # ValueError: response body wasn't valid JSON. KeyError: JSON was
        # valid but didn't have the expected "id" key (unexpected API
        # response shape, e.g. from a version drift or partial outage).
        logger.error("WhatsApp media upload returned an unexpected response: %s", response.text)
        raise WhatsAppSendError("WhatsApp returned an unexpected response while uploading the PDF.") from exc


def send_bill_document(phone_number, media_id, invoice_number, filename="invoice.pdf", company_name=None):
    """Send a template message with the uploaded PDF as a document header.

    Raises WhatsAppSendError with Meta's response body on failure (e.g. an
    unapproved template name, an invalid recipient number, or a number that
    hasn't opted in) so the caller can surface a clear error rather than a
    silent failure.

    The approved template is expected to have a body with ONE text
    variable ({{1}}, the invoice number) by default. If your actual
    approved template also includes the company name as a second variable
    (e.g. "Your invoice {{1}} from {{2}} is attached."), set
    WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR=true so this sends both
    parameters in the right order -- otherwise Meta will reject the send
    with a parameter-count mismatch.
    """
    _require_configured()
    recipient = normalize_phone_number(phone_number)
    if not recipient:
        raise WhatsAppSendError("Customer phone number is missing or invalid.")

    body_parameters = [{"type": "text", "text": invoice_number}]
    if settings.WHATSAPP_BILL_TEMPLATE_HAS_COMPANY_VAR:
        body_parameters.append({"type": "text", "text": company_name or ""})

    url = _graph_url(f"{settings.WHATSAPP_PHONE_NUMBER_ID}/messages")
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_BILL_TEMPLATE_NAME,
            "language": {"code": settings.WHATSAPP_BILL_TEMPLATE_LANGUAGE},
            "components": [
                {
                    "type": "header",
                    "parameters": [
                        {
                            "type": "document",
                            "document": {"id": media_id, "filename": filename},
                        }
                    ],
                },
                {
                    "type": "body",
                    "parameters": body_parameters,
                },
            ],
        },
    }
    try:
        response = requests.post(
            url, headers={**_auth_headers(), "Content-Type": "application/json"}, json=payload, timeout=30
        )
    except requests.RequestException as exc:
        logger.error("WhatsApp send network error: %s", exc)
        raise WhatsAppSendError(f"Could not reach WhatsApp to send the message: {exc}") from exc
    if not response.ok:
        logger.error("WhatsApp send failed: %s", response.text)
        raise WhatsAppSendError(f"Failed to send WhatsApp message: {response.text}")
    try:
        return response.json()
    except ValueError:
        # Meta returned a 2xx with a non-JSON body -- treat as success since
        # the message was accepted, just without a parseable receipt.
        return {"detail": "Message accepted by WhatsApp (no structured response body)."}


def share_bill_pdf(phone_number, pdf_bytes, invoice_number, company_name=None):
    """Upload the PDF and send it as a WhatsApp document message. Returns
    Meta's message-send response (contains the outbound message id) on
    success.
    """
    filename = f"{invoice_number}.pdf"
    media_id = upload_media(pdf_bytes, filename=filename)
    return send_bill_document(phone_number, media_id, invoice_number, filename=filename, company_name=company_name)
