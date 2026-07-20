"""Bill PDF generation.

Renders a Bill (kacha or pakka) to a PDF using WeasyPrint, pulling company
branding/bank details from the Company record so the invoice looks
professional without any per-bill configuration.
"""
import io
import logging

from django.template.loader import render_to_string

from landing.mongo_models import Company

logger = logging.getLogger(__name__)


class BillPdfRenderError(Exception):
    """Raised when the PDF could not be generated. Distinct from a plain
    Exception so callers (bills/views.py) can catch it specifically and
    return a clean error response instead of a raw 500 traceback."""


def _company_context(company_id):
    company = Company.objects(company_id=company_id).first()
    if company is None:
        # Bill exists but the company record is missing/misconfigured --
        # render with empty company fields rather than crashing the whole
        # PDF generation, since a bill should still be shareable.
        return {}
    return {
        "name": company.name,
        "address": company.address,
        "gst_number": company.gst_number,
        "phone": company.phone,
        "email": company.email,
        # Logo/signature/stamp are remote URLs (S3/media host). WeasyPrint
        # fetches them at render time; if any one is unreachable or
        # malformed, we'd rather render the invoice without that image than
        # fail the whole PDF -- so we don't validate them here, but the
        # invoice template itself only renders an <img> when the URL is
        # present, and render_bill_pdf below wraps the whole render in a
        # try/except so a fetch failure still surfaces a clean error rather
        # than a raw crash.
        "logo_url": company.logo_url,
        "stamp_url": company.stamp_url,
        "signature_url": company.signature_url,
        "bank_account_number": company.bank_account_number,
        "ifsc_code": company.ifsc_code,
        "bank_name": company.bank_name,
        "branch_name": company.branch_name,
    }


def render_bill_pdf(bill):
    """Render a Bill document to PDF bytes.

    Import of WeasyPrint is deferred to inside this function: WeasyPrint
    requires system libraries (Pango/Cairo/GDK-pixbuf) that may not be
    present in every environment (e.g. a bare test runner), so importing it
    at module level would break unrelated code paths that never touch PDF
    generation if those libraries are missing.

    Raises BillPdfRenderError (instead of letting WeasyPrint's own
    exceptions propagate) on any failure -- a missing system library, an
    unreachable logo/signature/stamp image, or a template error would
    otherwise surface as an uncaught 500 on every PDF/WhatsApp-share request.
    """
    try:
        from weasyprint import HTML
    except ImportError as exc:
        logger.error("WeasyPrint is not installed or its system libraries are missing: %s", exc)
        raise BillPdfRenderError(
            "PDF generation is unavailable on this server (WeasyPrint is not installed correctly). "
            "Contact support."
        ) from exc

    try:
        html_string = render_to_string(
            "bills/invoice.html",
            {
                "bill": bill,
                "company": _company_context(bill.company_id),
            },
        )
        buffer = io.BytesIO()
        HTML(string=html_string).write_pdf(buffer)
        buffer.seek(0)
        return buffer.read()
    except BillPdfRenderError:
        raise
    except Exception as exc:
        logger.error("Failed to render PDF for bill %s: %s", getattr(bill, "id", "?"), exc, exc_info=True)
        raise BillPdfRenderError(
            "Could not generate the PDF for this bill. This can happen if a logo, signature, or stamp "
            "image URL in your company profile is unreachable -- check Profile settings and try again."
        ) from exc
