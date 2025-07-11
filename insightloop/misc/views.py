from django.shortcuts import render, redirect
from django.contrib import messages
from insightloop.auth_utils import is_authenticated
from landing.mongo_models import User
import re

def profile(request):
    if not is_authenticated(request):
        messages.error(request, "Please log in to access this page")
        return redirect('login')
    
    try:
        # Get user from MongoDB using email stored in session
        user = User.objects.get(email=request.session['user_email'])
        company = user.company
        context = {
            'user': user,
            'company': company
        }
        return render(request, 'misc/Profile.html', context)
    except User.DoesNotExist:
        messages.error(request, "User not found")
        return redirect('login')
    except KeyError:
        messages.error(request, "Session expired")
        return redirect('login')


def billing(request):
    if not is_authenticated(request):
        messages.error(request, "Please log in to access this page")
        return redirect('login')
    
    try:
        user = User.objects.get(email=request.session['user_email'])
        context = {'user': user}
        return render(request, 'misc/Billing.html', context)
    except User.DoesNotExist:
        messages.error(request, "User not found")
        return redirect('login')
    except KeyError:
        messages.error(request, "Session expired")
        return redirect('login')


def settings(request):
    if not is_authenticated(request):
        messages.error(request, "Please log in to access this page")
        return redirect('login')
    
    try:
        user = User.objects.get(email=request.session['user_email'])
        
        if request.method == 'POST':
            # Personal Info Form
            if 'update_personal' in request.POST:
                user.name = request.POST.get('full_name', user.name)
                
                # Update session email if email changes
                new_email = request.POST.get('email', user.email)
                if new_email != user.email:
                    request.session['user_email'] = new_email
                user.email = new_email
                
                user.phone = request.POST.get('phone', user.phone)
                user.location = request.POST.get('location', user.location)
                user.username = request.POST.get('username', user.username)
                user.save()
                messages.success(request, 'Personal information updated successfully!')
            
            # Password Change Form
            elif 'update_password' in request.POST:
                current_password = request.POST.get('current_password')
                new_password = request.POST.get('new_password')
                confirm_password = request.POST.get('confirm_password')
                
                if user.check_password(current_password):
                    if new_password == confirm_password:
                        if len(new_password) >= 8:
                            user.set_password(new_password)
                            user.save()
                            messages.success(request, 'Password updated successfully!')
                        else:
                            messages.error(request, 'Password must be at least 8 characters')
                    else:
                        messages.error(request, 'New passwords do not match')
                else:
                    messages.error(request, 'Current password is incorrect')
            
            # Notifications Form
            elif 'update_notifications' in request.POST:
                user.notifications = {
                    "comments": 'comments' in request.POST,
                    "weekly_summary": 'weekly_summary' in request.POST,
                    "updates": 'updates' in request.POST
                }
                user.save()
                messages.success(request, 'Notification preferences updated!')
            
            # Profile Picture Update
            elif 'update_profile_pic' in request.POST:
                profile_pic = request.FILES.get('profile_pic', None)
                if profile_pic:
                    # Delete old profile pic if exists
                    if user.profile_pic:
                        user.profile_pic.delete()
                    
                    # Save new profile pic
                    user.profile_pic = profile_pic
                    user.save()
                    messages.success(request, 'Profile picture updated successfully!')
                else:
                    messages.error(request, 'Please select an image to upload')
        
        context = {'user': user}
        return render(request, 'misc/Setting.html', context)
    
    except User.DoesNotExist:
        messages.error(request, "User not found")
        return redirect('login')
    except KeyError:
        messages.error(request, "Session expired")
        return redirect('login')