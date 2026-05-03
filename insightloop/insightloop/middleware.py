class CompanyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Check if session has authentication info
        if 'user_email' in request.session:
            # Set request attributes from session
            request.company_id = request.session.get('company_id')
            request.user_email = request.session['user_email']
            request.user_name = request.session.get('user_name', '')
            request.company_name = request.session.get('company_name', '')
        else:
            request.company_id = None
        
        response = self.get_response(request)
        return response


class PathBasedUrlconfMiddleware:
    API_URLCONFS = {
        "/api/v1/auth/": "insightloop.api_auth_urls",
        "/api/v1/dashboard/": "insightloop.api_dashboard_urls",
        "/api/v1/insights/": "insightloop.api_insights_urls",
        "/api/v1/workers/": "insightloop.api_workers_urls",
        "/api/v1/upload/": "insightloop.api_upload_urls",
        "/api/v1/profile/": "insightloop.api_profile_urls",
        "/api/v1/ai/": "insightloop.api_ai_urls",
        "/api/v1/bills/": "insightloop.api_bills_urls",
        "/api/v1/inventory/": "insightloop.api_inventory_urls",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/v1/"):
            request.urlconf = "insightloop.api_root_urls"
            for prefix, urlconf in self.API_URLCONFS.items():
                if request.path.startswith(prefix):
                    request.urlconf = urlconf
                    break
        else:
            request.urlconf = "insightloop.public_urls"
        return self.get_response(request)
