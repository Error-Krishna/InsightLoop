def is_authenticated(request):
    return hasattr(request, 'company_id') and request.company_id and 'user_email' in request.session