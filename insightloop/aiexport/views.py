from django.shortcuts import redirect, render

# Create your views here.
# aiexport/views.py
from django.shortcuts import render
from insightloop.auth_utils import is_authenticated

def ai_export(request):
    if not is_authenticated(request):
        return redirect('login')
    
    return render(request, 'AIExport/Export&AI.html', {
        'company_name': request.company_name,
        'user_name': request.user_name
    })