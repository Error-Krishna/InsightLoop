class CompanyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Check if session has authentication info
        if 'user_email' in request.session and 'company_id' in request.session:
            # Set request attributes from session
            request.company_id = request.session['company_id']
            request.user_email = request.session['user_email']
            request.user_name = request.session.get('user_name', '')
            request.company_name = request.session.get('company_name', '')
        else:
            request.company_id = None
        
        response = self.get_response(request)
        return response