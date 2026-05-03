from django.shortcuts import render
from django.shortcuts import redirect
from insightloop.auth_utils import is_authenticated

def ai_export(request):
    if not is_authenticated(request):
        return redirect('login')
    
    return render(request, 'AIExport/Export&AI.html', {
        'company_name': getattr(request, 'company_name', ''),
        'user_name': getattr(request, 'user_name', ''),
    })
